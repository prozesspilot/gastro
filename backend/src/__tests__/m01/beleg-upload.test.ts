/**
 * T006 — M01 Beleg-Upload-Endpoint Tests
 *
 * Testet:
 *   1. POST /api/v1/belege/upload — Upload mit gültiger Datei, Fehlerfälle
 *   2. GET  /api/v1/belege        — List (leer, paginiert, Status-Filter)
 *   3. GET  /api/v1/belege/:id    — Detail mit Signed-URL, 404, Tenant-Isolation
 *
 * Kein echter DB-, Redis- oder S3-Zugriff — alle Calls gemockt.
 * Pattern analog zu sumup-oauth.test.ts.
 */

import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { belegeRoutes } from '../../modules/m01-receipt-intake/belege.routes';
import { signM14Token } from '../../modules/m14-auth/m14-jwt';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────

/** Erstellt einen gültigen M14-JWT für Tests. */
function makeStaffToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({
    userId: 'staff-uuid-test',
    discordId: 'discord-test-123',
    role,
    displayName: 'Test Mitarbeiter',
  });
}

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';

/** Minimale Beleg-Row für Mock-Returns. */
function makeMockBeleg(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'beleg-uuid-1',
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
      audit: { uploaded_by_user_id: 'staff-uuid-test' },
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
async function buildTestApp(poolOverride?: Partial<Pool>) {
  const app = Fastify({ logger: false });

  const mockPool = {
    connect: vi.fn(),
    query: vi.fn(),
    ...poolOverride,
  } as unknown as Pool;

  // S3-Mock
  const mockS3 = {
    send: vi.fn(async () => ({})),
  };

  app.decorate('db', mockPool);
  app.decorate('s3', mockS3 as unknown as import('@aws-sdk/client-s3').S3Client);

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  await app.register(belegeRoutes, { prefix: '/api/v1/belege' });

  return { app, mockPool, mockS3 };
}

/** Erstellt einen einfachen Mock-Client der `setTenantContext` + eine Query ausführt. */
function makePoolWithClient(queryFn: (sql: string, params?: unknown[]) => unknown) {
  const mockClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => queryFn(sql, params)),
    release: vi.fn(),
  };
  return {
    connect: vi.fn(async () => mockClient),
    query: vi.fn(),
    mockClient,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. Upload-Endpoint ────────────────────────────────────────────────────

describe('POST /api/v1/belege/upload', () => {
  it('gibt 401 zurück ohne Auth-Cookie', async () => {
    const { app } = await buildTestApp();

    // DECISION: multipart/form-data content-type nötig damit der Upload-Handler erreicht wird.
    // Ohne multipart-Header gibt @fastify/multipart einen Fehler bevor der Auth-Check läuft.
    const boundary = 'testboundary401';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\nfake\r\n--${boundary}--\r\n`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      headers: {
        'x-pp-tenant-id': TENANT_UUID,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('gibt 400 zurück wenn X-PP-Tenant-ID fehlt', async () => {
    const { app } = await buildTestApp();
    const token = makeStaffToken();

    // DECISION: multipart/form-data content-type nötig (siehe 401-Test oben).
    const boundary = 'testboundary400';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\nfake\r\n--${boundary}--\r\n`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('missing_tenant');
  });

  it('gibt 400 zurück wenn keine Datei im Body', async () => {
    const { app } = await buildTestApp();
    const token = makeStaffToken();

    // Sende multipart-Request ohne Datei-Part
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
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('no_file');
  });

  it('gibt 415 zurück bei ungültigem MIME-Type', async () => {
    const { app } = await buildTestApp();
    const token = makeStaffToken();

    // Multipart mit text/plain Datei
    const boundary = 'testboundary';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nHello World\r\n--${boundary}--\r\n`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: {
        'x-pp-tenant-id': TENANT_UUID,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(415);
    const body = JSON.parse(response.body) as { error: string; allowed_types?: string[] };
    expect(body.error).toBe('unsupported_media_type');
    expect(body.allowed_types).toContain('image/jpeg');
    expect(body.allowed_types).toContain('application/pdf');
  });

  it('gibt 413 zurück wenn Datei zu groß (> 20 MB)', async () => {
    // DECISION: @fastify/multipart wirft einen eigenen Fehler wenn fileSize überschritten.
    // Wir testen das via direkte Logik im Handler (nach toBuffer()).
    // Für den Integration-Test: config.MAX_UPLOAD_SIZE_BYTES auf 10 Bytes setzen.
    const { config } = await import('../../core/config');
    const originalMax = config.MAX_UPLOAD_SIZE_BYTES;
    (config as { MAX_UPLOAD_SIZE_BYTES: number }).MAX_UPLOAD_SIZE_BYTES = 10;

    const { app } = await buildTestApp();
    const token = makeStaffToken();

    const boundary = 'testboundary';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.jpg"\r\nContent-Type: image/jpeg\r\n\r\nThis content is longer than 10 bytes for sure\r\n--${boundary}--\r\n`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: {
        'x-pp-tenant-id': TENANT_UUID,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    (config as { MAX_UPLOAD_SIZE_BYTES: number }).MAX_UPLOAD_SIZE_BYTES = originalMax;

    expect(response.statusCode).toBe(413);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('file_too_large');
  });

  it('gibt 201 + beleg_id zurück bei erfolgreichem Upload', async () => {
    // DECISION: Dual-Mock nötig — pool.connect für insertBeleg, pool.query für logAuthEvent
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('set_config')) return { rows: [] };
        if (sql.includes('INSERT INTO belege')) return { rows: [makeMockBeleg()], rowCount: 1 };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async () => ({ rows: [] })), // für logAuthEvent
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    const token = makeStaffToken();

    const boundary = 'testboundary';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="beleg.jpg"\r\nContent-Type: image/jpeg\r\n\r\nJFIF-fake-jpeg-content\r\n--${boundary}--\r\n`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: {
        'x-pp-tenant-id': TENANT_UUID,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { beleg_id: string; status: string };
    expect(body.beleg_id).toBe('beleg-uuid-1');
    expect(body.status).toBe('received');
  });

  it('gibt 200 mit is_duplicate=true zurück bei doppeltem Upload (Idempotenz)', async () => {
    // DECISION: Dual-Mock nötig — pool.connect für insertBeleg, pool.query für logAuthEvent
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('set_config')) return { rows: [] };
        if (sql.includes('INSERT INTO belege')) return { rows: [], rowCount: 0 }; // Conflict
        if (sql.includes('SELECT * FROM belege WHERE tenant_id'))
          return { rows: [makeMockBeleg()], rowCount: 1 };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async () => ({ rows: [] })), // für logAuthEvent
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    const token = makeStaffToken();

    const boundary = 'testboundary';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="beleg.jpg"\r\nContent-Type: image/jpeg\r\n\r\nJFIF-fake-jpeg-content\r\n--${boundary}--\r\n`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: {
        'x-pp-tenant-id': TENANT_UUID,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { beleg_id: string; is_duplicate: boolean };
    expect(body.beleg_id).toBe('beleg-uuid-1');
    expect(body.is_duplicate).toBe(true);
  });

  it('Audit-Log wird bei erfolgreichem Upload geschrieben', async () => {
    const auditLogCalls: unknown[][] = [];

    // DECISION: logAuthEvent ruft pool.query direkt auf (nicht pool.connect + client.query),
    // daher müssen wir BEIDE — pool.query (für Audit) UND pool.connect (für insertBeleg) — mocken.
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('set_config')) return { rows: [] };
        if (sql.includes('INSERT INTO belege')) return { rows: [makeMockBeleg()], rowCount: 1 };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('insert_auth_audit_log')) {
          auditLogCalls.push(params ?? []);
          return { rows: [] };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;

    const { app } = await buildTestApp(pool);
    const token = makeStaffToken();

    const boundary = 'testboundary';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="beleg.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-fake-content\r\n--${boundary}--\r\n`;

    await app.inject({
      method: 'POST',
      url: '/api/v1/belege/upload',
      cookies: { pp_auth: token },
      headers: {
        'x-pp-tenant-id': TENANT_UUID,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    // Audit-Log sollte aufgerufen worden sein
    expect(auditLogCalls.length).toBe(1);
    // event_type ist zweiter Parameter (nach user_id)
    const eventType = auditLogCalls[0]?.[1];
    expect(eventType).toBe('beleg_uploaded');
  });
});

// ── 2. List-Endpoint ──────────────────────────────────────────────────────

describe('GET /api/v1/belege', () => {
  it('gibt 401 zurück ohne Auth-Cookie', async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege',
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(401);
  });

  it('gibt 400 zurück wenn X-PP-Tenant-ID fehlt', async () => {
    const { app } = await buildTestApp();
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('missing_tenant');
  });

  it('gibt leere Liste zurück wenn keine Belege vorhanden', async () => {
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      if (sql.includes('SELECT * FROM belege')) return { rows: [], rowCount: 0 };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
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
    const belegList = [makeMockBeleg({ id: 'b1' }), makeMockBeleg({ id: 'b2' })];

    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      if (sql.includes('SELECT * FROM belege')) return { rows: belegList, rowCount: 2 };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '25' }], rowCount: 1 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
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

  it('filtert nach Status wenn angegeben', async () => {
    const capturedQueries: string[] = [];

    const pool = makePoolWithClient((sql: string) => {
      capturedQueries.push(sql);
      if (sql.includes('set_config')) return { rows: [] };
      if (sql.includes('SELECT * FROM belege')) return { rows: [], rowCount: 0 };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    const token = makeStaffToken();

    await app.inject({
      method: 'GET',
      url: '/api/v1/belege?status=received',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    // Prüfen dass der Status-Filter in der Query vorkommt
    const listQuery = capturedQueries.find(
      (q) => q.includes('SELECT * FROM belege') && q.includes('status'),
    );
    expect(listQuery).toBeTruthy();
  });

  it('gibt 400 zurück bei ungültigem Status-Filter', async () => {
    const { app } = await buildTestApp();
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege?status=ungueltig',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('invalid_query');
  });
});

// ── 3. Detail-Endpoint ────────────────────────────────────────────────────

describe('GET /api/v1/belege/:id', () => {
  it('gibt 401 zurück ohne Auth-Cookie', async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege/beleg-uuid-1',
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(401);
  });

  it('gibt 400 zurück wenn X-PP-Tenant-ID fehlt', async () => {
    const { app } = await buildTestApp();
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege/550e8400-e29b-41d4-a716-446655440001',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('missing_tenant');
  });

  it('gibt 400 zurück bei ungültiger ID (kein UUID)', async () => {
    const { app } = await buildTestApp();
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege/kein-uuid',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('invalid_params');
  });

  it('gibt 404 zurück wenn Beleg nicht existiert', async () => {
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      if (sql.includes('SELECT * FROM belege WHERE id')) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    const token = makeStaffToken();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege/550e8400-e29b-41d4-a716-446655440001',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('gibt 404 zurück wenn Beleg einem anderen Tenant gehört (Tenant-Isolation)', async () => {
    const OTHER_TENANT = '660e8400-e29b-41d4-a716-446655440000';

    const pool = makePoolWithClient((sql: string, params?: unknown[]) => {
      if (sql.includes('set_config')) return { rows: [] };
      // Beleg existiert in DB, aber mit anderem tenant_id
      if (sql.includes('SELECT * FROM belege WHERE id')) {
        // Der Handler fragt mit WHERE id=$1 AND tenant_id=$2
        // params[1] ist der tenant_id aus dem Header → OTHER_TENANT
        // Beleg-tenant_id ist TENANT_UUID → kein Match → leere Rows
        const queryTenantId = Array.isArray(params) ? params[1] : undefined;
        if (queryTenantId === OTHER_TENANT) {
          return { rows: [], rowCount: 0 }; // anderer Tenant → nicht gefunden
        }
        return { rows: [makeMockBeleg()], rowCount: 1 };
      }
      return { rows: [] };
    });

    const { app } = await buildTestApp(pool as unknown as Pool);
    const token = makeStaffToken();

    // Request mit anderem Tenant-Header
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege/550e8400-e29b-41d4-a716-446655440001',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': OTHER_TENANT },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('gibt 200 mit Beleg + Signed-URL zurück bei Erfolg', async () => {
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      if (sql.includes('SELECT * FROM belege WHERE id'))
        return { rows: [makeMockBeleg()], rowCount: 1 };
      return { rows: [] };
    });

    const { app, mockS3 } = await buildTestApp(pool as unknown as Pool);
    const token = makeStaffToken();

    // Presigned-URL-Mock: S3-Client.send() wird für GetObjectCommand aufgerufen
    // getPresignedDownloadUrl nutzt @aws-sdk/s3-request-presigner
    // DECISION: Da getSignedUrl direkt den S3Client aufruft, müssen wir es via vi.mock mocken.
    const storageModule = await import('../../core/storage/storage.service');
    vi.spyOn(storageModule, 'getPresignedDownloadUrl').mockResolvedValueOnce(
      'https://minio.example.com/signed-url?expires=123',
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/belege/550e8400-e29b-41d4-a716-446655440001',
      cookies: { pp_auth: token },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      beleg: { id: string };
      download_url: string;
      download_expires_at: string;
    };
    expect(body.beleg.id).toBe('beleg-uuid-1');
    expect(body.download_url).toContain('signed-url');
    expect(body.download_expires_at).toBeTruthy();
  });
});

// ── 4. beleg.repository.ts Unit-Tests ────────────────────────────────────

describe('beleg.repository — insertBeleg', () => {
  it('gibt isDuplicate=false bei neuem Beleg zurück', async () => {
    const mockBeleg = makeMockBeleg();
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      if (sql.includes('INSERT INTO belege')) return { rows: [mockBeleg], rowCount: 1 };
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
      uploadedByUserId: 'staff-uuid',
      originalFilename: 'test.jpg',
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.beleg.id).toBe('beleg-uuid-1');
  });

  it('gibt isDuplicate=true bei Conflict zurück und holt existierende Row', async () => {
    const existingBeleg = makeMockBeleg({ id: 'existing-beleg-uuid' });
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      // INSERT → Conflict → leere Rows
      if (sql.includes('INSERT INTO belege')) return { rows: [], rowCount: 0 };
      // SELECT existierende Row
      if (sql.includes('SELECT * FROM belege WHERE tenant_id')) {
        return { rows: [existingBeleg], rowCount: 1 };
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
      uploadedByUserId: 'staff-uuid',
      originalFilename: 'test.jpg',
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.beleg.id).toBe('existing-beleg-uuid');
  });
});

describe('beleg.repository — listBelege', () => {
  it('gibt leere Liste zurück wenn keine Belege vorhanden', async () => {
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      if (sql.includes('SELECT * FROM belege')) return { rows: [], rowCount: 0 };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
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
});

describe('beleg.repository — getBelegById', () => {
  it('gibt null zurück wenn nicht gefunden', async () => {
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      return { rows: [] };
    });

    const { getBelegById } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    const result = await getBelegById(pool as unknown as Pool, TENANT_UUID, 'non-existent-uuid');
    expect(result).toBeNull();
  });

  it('gibt Beleg zurück wenn gefunden', async () => {
    const mockBeleg = makeMockBeleg();
    const pool = makePoolWithClient((sql: string) => {
      if (sql.includes('set_config')) return { rows: [] };
      return { rows: [mockBeleg] };
    });

    const { getBelegById } = await import(
      '../../modules/m01-receipt-intake/services/beleg.repository'
    );

    const result = await getBelegById(pool as unknown as Pool, TENANT_UUID, 'beleg-uuid-1');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('beleg-uuid-1');
  });
});
