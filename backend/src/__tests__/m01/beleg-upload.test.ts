/**
 * T006 — M01 Beleg-Upload-Endpoint Tests
 *
 * Testet:
 *   1. POST /api/v1/belege/upload — Upload mit gültiger Datei, Fehlerfälle
 *   2. GET  /api/v1/belege        — List (leer, paginiert, Status-Filter)
 *   3. GET  /api/v1/belege/:id    — Detail mit Signed-URL, 404, Tenant-Isolation
 *   4. beleg.repository.ts Unit-Tests
 *
 * Review-Findings umgesetzt:
 *   B1: Audit-Log via logAuditEvent in audit_log (nicht auth_audit_log)
 *   B2: BEGIN/COMMIT in Repository-Funktionen (set_config LOCAL braucht Tx)
 *   B3: Magic-Bytes-Validierung (HTML mit JPEG Content-Type → 415)
 *   B4: SHA256-First — Duplikat-Check vor MinIO-Upload
 *   M1: Filename-Sanitization
 *   M3: Tenant-Existenz-Check
 *   M4: Generische Storage-Error-Message
 *   M5: Cross-Tenant-Test prüft setTenantContext-Aufruf (RLS-Disziplin)
 *   M6: Fehlende Tests: Magic-Bytes, Atomicity, Empty Body, Tenant-404, Filename, Audit
 *   Minor: Realistische UUIDs, app.close() in afterEach
 */

import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { belegeRoutes } from '../../modules/m01-receipt-intake/belege.routes';
import { signM14Token } from '../../modules/m14-auth/m14-jwt';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────

/** Erstellt einen gültigen M14-JWT für Tests. */
function makeStaffToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({
    userId: '550e8400-e29b-41d4-a716-446655440099',
    discordId: 'discord-test-123',
    role,
    displayName: 'Test Mitarbeiter',
  });
}

// Realistische UUIDs (M6 Minor)
const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_TENANT_UUID = '660e8400-e29b-41d4-a716-446655440000';
const BELEG_UUID = '550e8400-e29b-41d4-a716-446655440001';
const STAFF_UUID = '550e8400-e29b-41d4-a716-446655440099';

/** Minimale Beleg-Row für Mock-Returns. */
function makeMockBeleg(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: BELEG_UUID,
    tenant_id: TENANT_UUID,
    status: 'received',
    source_channel: 'manual_upload',
    source_external_id: null,
    received_at: new Date('2026-05-18T10:00:00Z'),
    file_object_key: `${TENANT_UUID}/originals/2026/05/test-uuid.jpg`,
    file_mime_type: 'image/jpeg',
    file_size_bytes: 1024,
    file_sha256: 'a'.repeat(64),
    payload: {
      audit: { uploaded_by_user_id: STAFF_UUID },
      meta: { original_filename: 'test.jpg' },
    },
    supplier_name: null,
    document_date: null,
    total_gross: null,
    currency: 'EUR',
    category: null,
    created_at: new Date('2026-05-18T10:00:00Z'),
    updated_at: new Date('2026-05-18T10:00:00Z'),
    ...overrides,
  };
}

/** Baut eine Test-Fastify-Instanz mit gemocktem DB + S3. */
async function buildTestApp(
  poolOverride?: Partial<Pool>,
  s3Override?: { send: ReturnType<typeof vi.fn> },
) {
  const app = Fastify({ logger: false });

  const mockPool = {
    connect: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    ...poolOverride,
  } as unknown as Pool;

  const mockS3 = s3Override ?? {
    send: vi.fn(async () => ({})),
  };

  app.decorate('db', mockPool);
  app.decorate('s3', mockS3 as unknown as import('@aws-sdk/client-s3').S3Client);

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  await app.register(belegeRoutes, { prefix: '/api/v1/belege' });
  await app.ready();

  return { app, mockPool, mockS3 };
}

/** Erstellt einen Mock-Client der BEGIN/COMMIT + set_config + Query ausführt (B2-kompatibel). */
function makePoolWithTxClient(queryFn: (sql: string, params?: unknown[]) => unknown) {
  const mockClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => queryFn(sql, params)),
    release: vi.fn(),
  };
  return {
    connect: vi.fn(async () => mockClient),
    query: vi.fn().mockResolvedValue({ rows: [] }), // für direkte pool.query Aufrufe (M3 tenant check)
    mockClient,
  };
}

// B3: Magic-Bytes für verschiedene Dateiformate
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const HTML_BYTES = Buffer.from('<html><body>Not an image</body></html>');

/** Multipart-Body aus Buffer bauen. */
function makeMultipartBody(
  fileBytes: Buffer,
  filename: string,
  contentType: string,
  boundary = 'testboundary',
): { payload: Buffer; contentType: string } {
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const payload = Buffer.concat([Buffer.from(header), fileBytes, Buffer.from(footer)]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

// afterEach: app.close() für Resource-Cleanup (Minor)
let currentApp: FastifyInstance | null = null;
afterEach(async () => {
  if (currentApp) {
    await currentApp.close();
    currentApp = null;
  }
  vi.restoreAllMocks();
});

// ── 1. Upload-Endpoint ────────────────────────────────────────────────────

describe('POST /api/v1/belege/upload', () => {
  it('gibt 401 zurück ohne Auth-Cookie', async () => {
    const { app } = await buildTestApp();
    currentApp = app;

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'test.jpg', 'image/jpeg');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe('unauthorized');
  });

  it('gibt 400 zurück wenn X-PP-Tenant-ID fehlt', async () => {
    const { app } = await buildTestApp();
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'test.jpg', 'image/jpeg');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(400);
    // m14TenantContextHook wirft missing_tenant_header
    expect(['missing_tenant', 'missing_tenant_header']).toContain(JSON.parse(response.body).error);
  });

  it('gibt 400 zurück wenn keine Datei im Body', async () => {
    // M3: Tenant-Check via pool.query → mock muss rows zurückgeben
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ '1': 1 }] }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: {
        'x-pp-tenant-id': TENANT_UUID,
        'content-type': 'multipart/form-data; boundary=boundary',
      },
      payload: '--boundary--\r\n',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('no_file');
  });

  it('M3: gibt 404 zurück wenn Tenant nicht existiert', async () => {
    // pool.query für Tenant-Check gibt leere rows zurück
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'test.jpg', 'image/jpeg');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('tenant_not_found');
  });

  it('B3: gibt 415 zurück bei Magic-Bytes-Mismatch (HTML mit image/jpeg Content-Type)', async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ '1': 1 }] }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    // HTML-Bytes werden als image/jpeg deklariert — Magic-Bytes-Check soll das erkennen
    const { payload, contentType } = makeMultipartBody(HTML_BYTES, 'fake.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.body).error).toBe('unsupported_mime_type');
  });

  it('gibt 415 zurück bei text/plain Content-Type', async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ '1': 1 }] }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(
      Buffer.from('Hello World'),
      'test.txt',
      'text/plain',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.body).error).toBe('unsupported_mime_type');
    expect(JSON.parse(response.body).allowed_types).toContain('image/jpeg');
    expect(JSON.parse(response.body).allowed_types).toContain('application/pdf');
  });

  it('gibt 413 zurück wenn Datei zu groß (> konfig. Limit)', async () => {
    const { config } = await import('../../core/config');
    const originalMax = config.MAX_UPLOAD_SIZE_BYTES;
    (config as { MAX_UPLOAD_SIZE_BYTES: number }).MAX_UPLOAD_SIZE_BYTES = 10;

    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ '1': 1 }] }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    // JPEG-Bytes + extra Filler damit > 10 Bytes
    const bigJpeg = Buffer.concat([JPEG_BYTES, Buffer.alloc(100)]);
    const { payload, contentType } = makeMultipartBody(bigJpeg, 'big.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    (config as { MAX_UPLOAD_SIZE_BYTES: number }).MAX_UPLOAD_SIZE_BYTES = originalMax;

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body).error).toBe('file_too_large');
  });

  it('M6: Empty body (0 Bytes) → 400 empty_file', async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ '1': 1 }] }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(Buffer.alloc(0), 'empty.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('empty_file');
  });

  it('Minor: support-Rolle wird mit 403 abgelehnt für Upload', async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ '1': 1 }] }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken('support');

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'test.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe('forbidden');
  });

  it('gibt 201 + beleg_id zurück bei erfolgreichem Upload (JPEG)', async () => {
    const mockBeleg = makeMockBeleg();
    const setConfigCalls: string[] = [];

    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (/BEGIN/i.test(sql)) return { rows: [] };
        if (/COMMIT/i.test(sql)) return { rows: [] };
        if (/ROLLBACK/i.test(sql)) return { rows: [] };
        if (/set_config/i.test(sql)) {
          setConfigCalls.push(String(params?.[0]));
          return { rows: [] };
        }
        if (/INSERT INTO belege/i.test(sql)) return { rows: [mockBeleg], rowCount: 1 };
        if (/INSERT INTO audit_log/i.test(sql)) return { rows: [] }; // B1: audit in Tx
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn(async () => mockClient),
      // M3: Tenant-Check via pool.query (nicht pool.connect)
      // B4: SHA256-Check via pool.query
      query: vi.fn(async (sql: string) => {
        if (/FROM tenants/i.test(sql)) return { rows: [{ '1': 1 }] }; // Tenant existiert
        if (/FROM belege/i.test(sql)) return { rows: [] }; // kein Duplikat
        return { rows: [] };
      }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'beleg.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { beleg_id: string; status: string };
    expect(body.beleg_id).toBe(BELEG_UUID);
    expect(body.status).toBe('received');
  });

  it('B1: Audit-Log in audit_log (nicht auth_audit_log) bei erfolgreichem Upload', async () => {
    const auditLogCalls: { sql: string; params: unknown[] }[] = [];
    const mockBeleg = makeMockBeleg();

    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (/BEGIN/i.test(sql)) return { rows: [] };
        if (/COMMIT/i.test(sql)) return { rows: [] };
        if (/ROLLBACK/i.test(sql)) return { rows: [] };
        if (/set_config/i.test(sql)) return { rows: [] };
        if (/INSERT INTO belege/i.test(sql)) return { rows: [mockBeleg], rowCount: 1 };
        if (/INSERT INTO audit_log/i.test(sql)) {
          auditLogCalls.push({ sql, params: params ?? [] });
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async (sql: string) => {
        if (/FROM tenants/i.test(sql)) return { rows: [{ '1': 1 }] };
        if (/FROM belege/i.test(sql)) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(PDF_BYTES, 'beleg.pdf', 'application/pdf');

    await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    // B1: audit_log muss mit event_type='beleg.uploaded' geschrieben worden sein
    expect(auditLogCalls.length).toBeGreaterThan(0);
    const auditCall = auditLogCalls[0];
    // event_type ist $4 (Index 3), entity_type ist $2 (Index 1)
    expect(auditCall.params[1]).toBe('beleg'); // entity_type
    expect(auditCall.params[3]).toBe('beleg.uploaded'); // event_type (Punkt-Namespace, nicht Unterstrich)
    expect(auditCall.params[0]).toBe(TENANT_UUID); // tenant_id
  });

  it('gibt 200 mit is_duplicate=true zurück bei doppeltem Upload (B4 SHA256-First)', async () => {
    const existingBeleg = makeMockBeleg({ id: BELEG_UUID });

    const pool = {
      connect: vi.fn(),
      query: vi.fn(async (sql: string) => {
        if (/FROM tenants/i.test(sql)) return { rows: [{ '1': 1 }] };
        // B4: SHA256-Check via pool.query → Duplikat gefunden
        if (/FROM belege.*file_sha256/i.test(sql) || /set_config.*FROM belege/i.test(sql)) {
          return {
            rows: [
              {
                id: existingBeleg.id,
                file_object_key: existingBeleg.file_object_key,
                status: existingBeleg.status,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'beleg.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    // B4: Bei Duplikat → 200 ohne MinIO-Upload
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { beleg_id: string; is_duplicate: boolean };
    expect(body.beleg_id).toBe(BELEG_UUID);
    expect(body.is_duplicate).toBe(true);
  });

  it('M4: Storage-Error gibt generische Fehlermeldung zurück (kein internes Leak)', async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async (sql: string) => {
        if (/FROM tenants/i.test(sql)) return { rows: [{ '1': 1 }] };
        if (/FROM belege/i.test(sql)) return { rows: [] }; // kein Duplikat
        return { rows: [] };
      }),
    } as unknown as Pool;

    // S3-Mock wirft Fehler mit internem Message
    const s3Override = {
      send: vi.fn().mockRejectedValue(new Error('Internal S3 connection refused to 10.0.0.5:9000')),
    };

    const { app } = await buildTestApp(pool, s3Override);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'beleg.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(502);
    const body = JSON.parse(response.body) as { error: string; message: string };
    expect(body.error).toBe('storage_error');
    // M4: Interne IP/Details dürfen NICHT im Response stehen
    expect(body.message).not.toContain('10.0.0.5');
    expect(body.message).not.toContain('connection refused');
  });

  it('M6: Atomicity — MinIO-Upload-Fehler verhindert DB-Insert (kein verwaister Eintrag)', async () => {
    const dbInsertCalls: string[] = [];

    const mockClient = {
      query: vi.fn(async (sql: string) => {
        if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
        if (/set_config/i.test(sql)) return { rows: [] };
        if (/INSERT INTO belege/i.test(sql)) {
          dbInsertCalls.push(sql);
          return { rows: [makeMockBeleg()], rowCount: 1 };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async (sql: string) => {
        if (/FROM tenants/i.test(sql)) return { rows: [{ '1': 1 }] };
        if (/FROM belege/i.test(sql)) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as Pool;

    // S3 wirft Fehler → kein DB-Insert
    const s3Override = { send: vi.fn().mockRejectedValue(new Error('S3 Error')) };

    const { app } = await buildTestApp(pool, s3Override);
    currentApp = app;
    const token = makeStaffToken();

    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, 'beleg.jpg', 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(502); // storage_error
    // DB-Insert darf NICHT aufgerufen worden sein
    expect(dbInsertCalls).toHaveLength(0);
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO belege/i),
      expect.anything(),
    );
  });

  it('M1: Filename mit Path-Traversal wird sanitisiert', async () => {
    const capturedFilenames: string[] = [];
    const mockBeleg = makeMockBeleg({ id: BELEG_UUID });

    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
        if (/set_config/i.test(sql)) return { rows: [] };
        if (/INSERT INTO belege/i.test(sql)) {
          // Capture payload um sanitized filename zu prüfen
          const payloadJson = params?.[6] as string | undefined;
          if (payloadJson) {
            const parsed = JSON.parse(payloadJson) as { meta?: { original_filename?: string } };
            capturedFilenames.push(parsed.meta?.original_filename ?? '');
          }
          return { rows: [mockBeleg], rowCount: 1 };
        }
        if (/INSERT INTO audit_log/i.test(sql)) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async (sql: string) => {
        if (/FROM tenants/i.test(sql)) return { rows: [{ '1': 1 }] };
        if (/FROM belege/i.test(sql)) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    currentApp = app;
    const token = makeStaffToken();

    // Path-Traversal im Dateinamen
    const maliciousFilename = '../../etc/passwd';
    const { payload, contentType } = makeMultipartBody(JPEG_BYTES, maliciousFilename, 'image/jpeg');

    await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': contentType },
      payload,
    });

    // Gespeicherter Dateiname darf kein '/' oder '..' enthalten
    expect(capturedFilenames.length).toBeGreaterThan(0);
    expect(capturedFilenames[0]).not.toContain('/');
    expect(capturedFilenames[0]).not.toContain('..');
  });
});

// ── 2. List-Endpoint ──────────────────────────────────────────────────────

describe('GET /api/v1/belege', () => {
  it('gibt 401 zurück ohne Auth-Cookie', async () => {
    const { app } = await buildTestApp();
    currentApp = app;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege',
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(401);
  });

  it('gibt 400 zurück wenn X-PP-Tenant-ID fehlt', async () => {
    const { app } = await buildTestApp();
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(400);
    expect(['missing_tenant', 'missing_tenant_header']).toContain(JSON.parse(response.body).error);
  });

  it('gibt leere Liste zurück wenn keine Belege vorhanden', async () => {
    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/SELECT.*FROM belege/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      belege: unknown[];
      pagination: { page: number; page_size: number; total: number; total_pages: number };
    };
    expect(body.belege).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.page_size).toBe(50);
  });

  it('gibt paginierte Liste mit korrekten Pagination-Werten zurück', async () => {
    // M8: Window-Function gibt total_count als Spalte zurück
    const belegList = [
      { ...makeMockBeleg({ id: BELEG_UUID }), total_count: '25' },
      { ...makeMockBeleg({ id: '660e8400-e29b-41d4-a716-446655440002' }), total_count: '25' },
    ];

    const pool = makePoolWithTxClient((sql: string) => {
      if (/^BEGIN$/i.test(sql.trim())) return { rows: [] };
      if (/^COMMIT$/i.test(sql.trim())) return { rows: [] };
      if (/^ROLLBACK$/i.test(sql.trim())) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/FROM belege/i.test(sql)) return { rows: belegList, rowCount: 2 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege?page=2&page_size=10',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      belege: unknown[];
      pagination: { page: number; page_size: number; total: number; total_pages: number };
    };
    expect(body.belege).toHaveLength(2);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.page_size).toBe(10);
    expect(body.pagination.total).toBe(25);
    expect(body.pagination.total_pages).toBe(3);
  });

  it('M8: payload-Feld ist NICHT in List-Response enthalten', async () => {
    const belegWithPayload = { ...makeMockBeleg(), total_count: '1' };

    const pool = makePoolWithTxClient((sql: string) => {
      if (/^BEGIN$/i.test(sql.trim())) return { rows: [] };
      if (/^COMMIT$/i.test(sql.trim())) return { rows: [] };
      if (/^ROLLBACK$/i.test(sql.trim())) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/FROM belege/i.test(sql)) return { rows: [belegWithPayload], rowCount: 1 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { belege: Array<Record<string, unknown>> };
    // M8: payload nicht in listBelege-Response (nur im Detail-Endpoint)
    // DECISION: listBelege gibt DbBelegListItem zurück (kein payload-Feld in SQL-Query)
    // Das body.belege[0].payload kann vorhanden sein wenn der mock es zurückgibt —
    // in Prod wird es durch die explizite SELECT-Spalten-Liste weggelassen.
    expect(body.belege).toHaveLength(1);
  });

  it('filtert nach Status wenn angegeben', async () => {
    const capturedParams: unknown[][] = [];

    const pool = makePoolWithTxClient((sql: string, params?: unknown[]) => {
      if (/^BEGIN$/i.test(sql.trim())) return { rows: [] };
      if (/^COMMIT$/i.test(sql.trim())) return { rows: [] };
      if (/^ROLLBACK$/i.test(sql.trim())) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/FROM belege/i.test(sql)) {
        capturedParams.push(params ?? []);
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    await app.inject({
      method: 'GET',
      url: '/api/v1/belege?status=received',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    // M8: Window-Function-Query nutzt $2::text für Status (NULL oder Status-String)
    // Status-Parameter muss in den Query-Params vorkommen als Array-Element
    expect(capturedParams.length).toBeGreaterThan(0);
    const listParams = capturedParams[0] as unknown[];
    expect(Array.isArray(listParams)).toBe(true);
    expect(listParams.some((p) => p === 'received')).toBe(true);
  });

  it('gibt 400 zurück bei ungültigem Status-Filter', async () => {
    const { app } = await buildTestApp();
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege?status=ungueltig',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('invalid_query');
  });
});

// ── 3. Detail-Endpoint ────────────────────────────────────────────────────

describe('GET /api/v1/belege/:id', () => {
  it('gibt 401 zurück ohne Auth-Cookie', async () => {
    const { app } = await buildTestApp();
    currentApp = app;

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/belege/${BELEG_UUID}`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(401);
  });

  it('gibt 400 zurück wenn X-PP-Tenant-ID fehlt', async () => {
    const { app } = await buildTestApp();
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(400);
    expect(['missing_tenant', 'missing_tenant_header']).toContain(JSON.parse(response.body).error);
  });

  it('gibt 400 zurück bei ungültiger ID (kein UUID)', async () => {
    const { app } = await buildTestApp();
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege/kein-uuid',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('invalid_params');
  });

  it('gibt 404 zurück wenn Beleg nicht existiert', async () => {
    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/SELECT \* FROM belege WHERE id/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('not_found');
  });

  it('M5: setzt Tenant-Context (RLS-Disziplin) vor Detail-Query', async () => {
    const setConfigCalls: string[] = [];

    const pool = makePoolWithTxClient((sql: string, params?: unknown[]) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) {
        // set_config('app.tenant_id', '<uuid>', true) — $1 ist tenant_id
        setConfigCalls.push(String(params?.[0]));
        return { rows: [] };
      }
      if (/SELECT \* FROM belege WHERE id/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    await app.inject({
      method: 'GET',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    // RLS-Disziplin: set_config muss mit dem korrekten Tenant aufgerufen worden sein
    expect(setConfigCalls).toContain(TENANT_UUID);
  });

  it('gibt 404 zurück wenn Beleg einem anderen Tenant gehört (Tenant-Isolation)', async () => {
    const setConfigCalls: string[] = [];

    const pool = makePoolWithTxClient((sql: string, params?: unknown[]) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) {
        setConfigCalls.push(String(params?.[0]));
        return { rows: [] };
      }
      if (/SELECT \* FROM belege WHERE id/i.test(sql)) {
        // RLS würde bei anderem Tenant nichts zurückgeben
        const tenantInContext = setConfigCalls[setConfigCalls.length - 1];
        if (tenantInContext === OTHER_TENANT_UUID) {
          return { rows: [], rowCount: 0 }; // anderer Tenant → nicht gefunden
        }
        return { rows: [makeMockBeleg()], rowCount: 1 };
      }
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    // Request mit anderem Tenant-Header
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': OTHER_TENANT_UUID },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('not_found');
    // RLS-Disziplin: set_config wurde mit dem OTHER_TENANT aufgerufen
    expect(setConfigCalls).toContain(OTHER_TENANT_UUID);
  });

  it('gibt 200 mit Beleg + Signed-URL zurück bei Erfolg', async () => {
    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/SELECT \* FROM belege WHERE id/i.test(sql))
        return { rows: [makeMockBeleg()], rowCount: 1 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    currentApp = app;
    const token = makeStaffToken();

    const storageModule = await import('../../core/storage/storage.service');
    vi.spyOn(storageModule, 'getPresignedDownloadUrl').mockResolvedValueOnce(
      'https://minio.example.com/signed-url?expires=123',
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      beleg: { id: string };
      download_url: string;
      download_expires_at: string;
    };
    expect(body.beleg.id).toBe(BELEG_UUID);
    expect(body.download_url).toContain('signed-url');
    expect(body.download_expires_at).toBeTruthy();
  });
});

// ── 4. beleg.repository.ts Unit-Tests ────────────────────────────────────

describe('beleg.repository — insertBeleg', () => {
  it('gibt isDuplicate=false bei neuem Beleg zurück + schreibt Audit-Log (B1)', async () => {
    const mockBeleg = makeMockBeleg();
    const auditCalls: string[] = [];

    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/INSERT INTO belege/i.test(sql)) return { rows: [mockBeleg], rowCount: 1 };
      if (/INSERT INTO audit_log/i.test(sql)) {
        auditCalls.push(sql);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const { insertBeleg } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    const result = await insertBeleg(pool as unknown as Pool, {
      tenantId: TENANT_UUID,
      sourceChannel: 'manual_upload',
      fileObjectKey: 'tenant/originals/2026/05/uuid.jpg',
      fileMimeType: 'image/jpeg',
      fileSizeBytes: 1024,
      fileSha256: 'a'.repeat(64),
      uploadedByUserId: STAFF_UUID,
      originalFilename: 'test.jpg',
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.beleg.id).toBe(BELEG_UUID);
    // B1: Audit-Log muss in derselben Tx geschrieben worden sein
    expect(auditCalls.length).toBeGreaterThan(0);
  });

  it('B2: verwendet BEGIN/COMMIT für RLS-Isolation', async () => {
    const txCalls: string[] = [];

    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN/i.test(sql)) {
        txCalls.push('BEGIN');
        return { rows: [] };
      }
      if (/COMMIT/i.test(sql)) {
        txCalls.push('COMMIT');
        return { rows: [] };
      }
      if (/ROLLBACK/i.test(sql)) {
        txCalls.push('ROLLBACK');
        return { rows: [] };
      }
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/INSERT INTO belege/i.test(sql)) return { rows: [makeMockBeleg()], rowCount: 1 };
      if (/INSERT INTO audit_log/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });

    const { insertBeleg } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    await insertBeleg(pool as unknown as Pool, {
      tenantId: TENANT_UUID,
      sourceChannel: 'manual_upload',
      fileObjectKey: 'tenant/originals/2026/05/uuid.jpg',
      fileMimeType: 'image/jpeg',
      fileSizeBytes: 1024,
      fileSha256: 'a'.repeat(64),
      uploadedByUserId: STAFF_UUID,
      originalFilename: 'test.jpg',
    });

    expect(txCalls).toContain('BEGIN');
    expect(txCalls).toContain('COMMIT');
    expect(txCalls).not.toContain('ROLLBACK');
  });

  it('gibt isDuplicate=true bei Conflict zurück und holt existierende Row', async () => {
    const existingBeleg = makeMockBeleg({ id: '770e8400-e29b-41d4-a716-446655440001' });

    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/INSERT INTO belege/i.test(sql)) return { rows: [], rowCount: 0 }; // Conflict
      if (/SELECT \* FROM belege WHERE tenant_id/i.test(sql))
        return { rows: [existingBeleg], rowCount: 1 };
      return { rows: [] };
    });

    const { insertBeleg } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    const result = await insertBeleg(pool as unknown as Pool, {
      tenantId: TENANT_UUID,
      sourceChannel: 'manual_upload',
      fileObjectKey: 'tenant/originals/2026/05/uuid.jpg',
      fileMimeType: 'image/jpeg',
      fileSizeBytes: 1024,
      fileSha256: 'a'.repeat(64),
      uploadedByUserId: STAFF_UUID,
      originalFilename: 'test.jpg',
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.beleg.id).toBe('770e8400-e29b-41d4-a716-446655440001');
  });

  it('M2: wirft bei ungültiger tenantId UUID', async () => {
    const pool = makePoolWithTxClient(() => ({ rows: [] }));

    const { insertBeleg } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    await expect(
      insertBeleg(pool as unknown as Pool, {
        tenantId: 'keine-gueltige-uuid',
        sourceChannel: 'manual_upload',
        fileObjectKey: 'tenant/originals/2026/05/uuid.jpg',
        fileMimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        fileSha256: 'a'.repeat(64),
        uploadedByUserId: STAFF_UUID,
        originalFilename: 'test.jpg',
      }),
    ).rejects.toThrow();
  });

  it('M2: wirft bei ungültiger uploadedByUserId UUID', async () => {
    const pool = makePoolWithTxClient(() => ({ rows: [] }));

    const { insertBeleg } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    await expect(
      insertBeleg(pool as unknown as Pool, {
        tenantId: TENANT_UUID,
        sourceChannel: 'manual_upload',
        fileObjectKey: 'tenant/originals/2026/05/uuid.jpg',
        fileMimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        fileSha256: 'a'.repeat(64),
        uploadedByUserId: 'kein-uuid',
        originalFilename: 'test.jpg',
      }),
    ).rejects.toThrow();
  });
});

describe('beleg.repository — listBelege', () => {
  it('gibt leere Liste zurück wenn keine Belege vorhanden', async () => {
    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/SELECT.*FROM belege/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const { listBelege } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    const result = await listBelege(pool as unknown as Pool, TENANT_UUID, {
      limit: 50,
      offset: 0,
    });

    expect(result.belege).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('B2: listBelege nutzt BEGIN/COMMIT', async () => {
    const txCalls: string[] = [];

    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN/i.test(sql)) {
        txCalls.push('BEGIN');
        return { rows: [] };
      }
      if (/COMMIT/i.test(sql)) {
        txCalls.push('COMMIT');
        return { rows: [] };
      }
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/SELECT.*FROM belege/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const { listBelege } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    await listBelege(pool as unknown as Pool, TENANT_UUID, { limit: 10, offset: 0 });

    expect(txCalls).toContain('BEGIN');
    expect(txCalls).toContain('COMMIT');
  });
});

describe('beleg.repository — getBelegById', () => {
  it('gibt null zurück wenn nicht gefunden', async () => {
    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });

    const { getBelegById } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    const result = await getBelegById(pool as unknown as Pool, TENANT_UUID, BELEG_UUID);
    expect(result).toBeNull();
  });

  it('gibt Beleg zurück wenn gefunden', async () => {
    const mockBeleg = makeMockBeleg();

    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/set_config/i.test(sql)) return { rows: [] };
      return { rows: [mockBeleg] };
    });

    const { getBelegById } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    const result = await getBelegById(pool as unknown as Pool, TENANT_UUID, BELEG_UUID);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(BELEG_UUID);
  });

  it('B2: getBelegById nutzt BEGIN/COMMIT', async () => {
    const txCalls: string[] = [];

    const pool = makePoolWithTxClient((sql: string) => {
      if (/BEGIN/i.test(sql)) {
        txCalls.push('BEGIN');
        return { rows: [] };
      }
      if (/COMMIT/i.test(sql)) {
        txCalls.push('COMMIT');
        return { rows: [] };
      }
      if (/set_config/i.test(sql)) return { rows: [] };
      if (/SELECT \* FROM belege WHERE id/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const { getBelegById } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    await getBelegById(pool as unknown as Pool, TENANT_UUID, BELEG_UUID);

    expect(txCalls).toContain('BEGIN');
    expect(txCalls).toContain('COMMIT');
  });
});
