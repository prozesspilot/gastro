/**
 * Integration-Tests für Receipt-API.
 *
 * ERFORDERT laufende Postgres-Instanz.
 * Tenant + Customer werden vor jedem Test frisch angelegt und danach bereinigt.
 *
 * Ausführung: PP_E2E=1 npm test
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

// Skip all DB integration tests when no Postgres is available
const E2E = process.env.PP_E2E === '1';

let app: FastifyInstance;
let tenantId: string;
let customerId: string;

beforeAll(async () => {
  if (!E2E) return;
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (!E2E) return;
  await app.close();
});

beforeEach(async () => {
  if (!E2E) return;
  const { rows } = await app.db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
    [`test-receipts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'Test-Mandant'],
  );
  tenantId = rows[0].id;

  // Customer anlegen — Receipts brauchen FK auf Customer
  const cRes = await app.inject({
    method:  'POST',
    url:     '/api/v1/customers',
    headers: { 'content-type': 'application/json', 'x-pp-tenant-id': tenantId },
    payload: { name: 'Test Customer' },
  });
  customerId = cRes.json().data.id;
});

afterEach(async () => {
  if (!E2E) return;
  await app.db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

function headers() {
  return { 'content-type': 'application/json', 'x-pp-tenant-id': tenantId };
}

async function createTestReceipt(overrides: Record<string, unknown> = {}) {
  return app.inject({
    method:  'POST',
    url:     '/api/v1/receipts',
    headers: headers(),
    payload: { customer_id: customerId, original_name: 'beleg.pdf', mime_type: 'application/pdf', ...overrides },
  });
}

// ── POST /receipts ───────────────────────────────────────────────────────

describe.skipIf(!E2E)('POST /api/v1/receipts', () => {
  it('legt einen neuen Receipt an und gibt 201 zurück', async () => {
    const res = await createTestReceipt();
    const body = res.json();

    expect(res.statusCode).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.tenant_id).toBe(tenantId);
    expect(body.data.customer_id).toBe(customerId);
    expect(body.data.status).toBe('pending');
    expect(body.data.source).toBe('manual');
    expect(body.data.original_name).toBe('beleg.pdf');
  });

  it('gibt 422 bei fehlendem customer_id zurück', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/receipts',
      headers: headers(),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('gibt 400 bei fehlendem tenant-Header zurück', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/receipts',
      headers: { 'content-type': 'application/json' },
      payload: { customer_id: customerId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_TENANT');
  });
});

// ── GET /receipts ─────────────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts', () => {
  it('gibt paginierte Liste zurück', async () => {
    await createTestReceipt({ original_name: 'a.pdf' });
    await createTestReceipt({ original_name: 'b.pdf' });

    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/receipts',
      headers: headers(),
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.receipts.length).toBeGreaterThanOrEqual(2);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
  });

  it('filtert nach customer_id', async () => {
    await createTestReceipt();
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/receipts?customer_id=${customerId}`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.receipts.every((r: { customer_id: string }) => r.customer_id === customerId)).toBe(true);
  });
});

// ── GET /receipts/:id ─────────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts/:id', () => {
  it('gibt den Receipt zurück wenn gefunden', async () => {
    const created = (await createTestReceipt()).json();
    const id = created.data.id;

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/receipts/${id}`,
      headers: headers(),
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.id).toBe(id);
  });

  it('gibt 404 bei unbekannter ID zurück', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/receipts/00000000-0000-0000-0000-000000000000',
      headers: headers(),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── PUT /receipts/:id/status ──────────────────────────────────────────────

describe.skipIf(!E2E)('PUT /api/v1/receipts/:id/status', () => {
  it('aktualisiert den Status', async () => {
    const created = (await createTestReceipt()).json();
    const id = created.data.id;

    const res = await app.inject({
      method:  'PUT',
      url:     `/api/v1/receipts/${id}/status`,
      headers: headers(),
      payload: { status: 'done' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('done');
  });

  it('akzeptiert error_message bei Status error', async () => {
    const created = (await createTestReceipt()).json();
    const id = created.data.id;

    const res = await app.inject({
      method:  'PUT',
      url:     `/api/v1/receipts/${id}/status`,
      headers: headers(),
      payload: { status: 'error', error_message: 'OCR fehlgeschlagen' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('error');
    expect(res.json().data.error_message).toBe('OCR fehlgeschlagen');
  });

  it('gibt 422 bei ungültigem Status zurück', async () => {
    const created = (await createTestReceipt()).json();
    const res = await app.inject({
      method:  'PUT',
      url:     `/api/v1/receipts/${created.data.id}/status`,
      headers: headers(),
      payload: { status: 'foobar' },
    });
    expect(res.statusCode).toBe(422);
  });
});

// ── GET /receipts/stats ───────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts/stats', () => {
  it('gibt aggregierte Statistik zurück', async () => {
    await createTestReceipt();
    await createTestReceipt({ source: 'whatsapp' });
    const r3 = (await createTestReceipt()).json();
    await app.inject({
      method:  'PUT',
      url:     `/api/v1/receipts/${r3.data.id}/status`,
      headers: headers(),
      payload: { status: 'done' },
    });

    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/receipts/stats',
      headers: headers(),
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.total).toBe(3);
    expect(body.data.by_status.pending).toBe(2);
    expect(body.data.by_status.done).toBe(1);
    expect(body.data.by_source.manual).toBe(2);
    expect(body.data.by_source.whatsapp).toBe(1);
    expect(body.data.today_count).toBe(3);
  });

  it('Stats sind tenant-isoliert', async () => {
    await createTestReceipt();

    // Anderen Tenant anlegen, prüfen, dass dessen Stats leer sind
    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-iso-${Date.now()}`, 'Iso'],
    );
    const otherTenant = rows[0].id;

    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/receipts/stats',
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenant },
    });
    expect(res.json().data.total).toBe(0);

    await app.db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenant]);
  });
});

// ── PUT /receipts/bulk-status ─────────────────────────────────────────────

describe.skipIf(!E2E)('PUT /api/v1/receipts/bulk-status', () => {
  it('aktualisiert mehrere Receipts gleichzeitig', async () => {
    const r1 = (await createTestReceipt()).json();
    const r2 = (await createTestReceipt()).json();
    const r3 = (await createTestReceipt()).json();

    const res = await app.inject({
      method:  'PUT',
      url:     '/api/v1/receipts/bulk-status',
      headers: headers(),
      payload: { ids: [r1.data.id, r2.data.id, r3.data.id], status: 'done' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(3);
    expect(res.json().data.updated.every((r: { status: string }) => r.status === 'done')).toBe(true);
  });

  it('gibt 422 bei mehr als 50 IDs zurück', async () => {
    const ids = Array.from({ length: 51 }, () => '00000000-0000-0000-0000-000000000000');
    const res = await app.inject({
      method:  'PUT',
      url:     '/api/v1/receipts/bulk-status',
      headers: headers(),
      payload: { ids, status: 'done' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('ist tenant-isoliert: fremde Receipts bleiben unangetastet', async () => {
    // Receipt im aktuellen Tenant
    const r1 = (await createTestReceipt()).json();

    // Anderer Tenant + Customer + Receipt
    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-bulk-iso-${Date.now()}`, 'OtherTenant'],
    );
    const otherTenant = rows[0].id;
    const otherCustomerRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/customers',
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenant },
      payload: { name: 'Other' },
    });
    const otherCustomerId = otherCustomerRes.json().data.id;
    const otherReceipt = await app.inject({
      method:  'POST',
      url:     '/api/v1/receipts',
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenant },
      payload: { customer_id: otherCustomerId },
    });
    const otherId = otherReceipt.json().data.id;

    // Bulk im aktuellen Tenant — versucht, fremde ID zu treffen
    const res = await app.inject({
      method:  'PUT',
      url:     '/api/v1/receipts/bulk-status',
      headers: headers(),
      payload: { ids: [r1.data.id, otherId], status: 'done' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(1);

    // Fremder Receipt darf nicht 'done' sein
    const checkOther = await app.inject({
      method:  'GET',
      url:     `/api/v1/receipts/${otherId}`,
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenant },
    });
    expect(checkOther.json().data.status).toBe('pending');

    await app.db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenant]);
  });
});

// ── GET /receipts/export ──────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts/export', () => {
  it('liefert CSV mit allen Receipts', async () => {
    await createTestReceipt({ original_name: 'beleg-1.pdf' });
    await createTestReceipt({ original_name: 'beleg-2.pdf' });

    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/receipts/export',
      headers: headers(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.body.split('\n')[0]).toContain('id,status,original_name');
    const lines = res.body.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3); // Header + 2 Datensätze
  });

  it('setzt content-disposition Header', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/receipts/export',
      headers: headers(),
    });
    expect(res.headers['content-disposition']).toMatch(/attachment.*filename/);
  });
});

// ── Filter & Pagination ───────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts mit Filtern', () => {
  it('filtert nach status=pending', async () => {
    const r1 = (await createTestReceipt()).json();
    const r2 = (await createTestReceipt()).json();
    await app.inject({
      method:  'PUT',
      url:     `/api/v1/receipts/${r2.data.id}/status`,
      headers: headers(),
      payload: { status: 'done' },
    });

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/receipts?status=pending',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.receipts.every((r: { status: string }) => r.status === 'pending')).toBe(true);
    expect(res.json().data.receipts.some((r: { id: string }) => r.id === r1.data.id)).toBe(true);
  });

  it('respektiert limit/offset', async () => {
    await createTestReceipt({ original_name: 'a.pdf' });
    await createTestReceipt({ original_name: 'b.pdf' });
    await createTestReceipt({ original_name: 'c.pdf' });

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/receipts?limit=2&offset=0',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.receipts).toHaveLength(2);
    expect(res.json().data.limit).toBe(2);
    expect(res.json().data.offset).toBe(0);
  });
});

// ── POST / Validierung — Customer in fremdem Tenant ──────────────────────

describe.skipIf(!E2E)('POST /api/v1/receipts mit fremdem Customer', () => {
  it('gibt 404 zurück wenn customer nicht im Tenant existiert', async () => {
    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-other-${Date.now()}`, 'Other'],
    );
    const otherTenantId = rows[0].id;
    const otherCustomerRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/customers',
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenantId },
      payload: { name: 'Foreign' },
    });
    const foreignCustomerId = otherCustomerRes.json().data.id;

    // Versuch im aktuellen Tenant einen Receipt für den fremden Customer anzulegen
    const res = await createTestReceipt({ customer_id: foreignCustomerId });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CUSTOMER_NOT_FOUND');

    await app.db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
  });
});

// ── GET /:id Tenant-Isolation ────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts/:id Tenant-Isolation', () => {
  it('gibt 404 zurück wenn Receipt zum anderen Tenant gehört', async () => {
    const created = (await createTestReceipt()).json();
    const id = created.data.id;

    // Anderer Tenant
    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-iso-get-${Date.now()}`, 'OtherTenant'],
    );
    const otherTenantId = rows[0].id;

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/receipts/${id}`,
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenantId },
    });
    expect(res.statusCode).toBe(404);

    await app.db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────

describe.skipIf(!E2E)('POST /api/v1/receipts mit file_sha256 (Deduplication)', () => {
  const sha = 'a'.repeat(64);

  it('verschiedene SHA256 → beide 201', async () => {
    const r1 = await createTestReceipt({ file_sha256: 'b'.repeat(64) });
    const r2 = await createTestReceipt({ file_sha256: 'c'.repeat(64) });
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
  });

  it('zweimal gleicher SHA256 → 409 mit existing_id', async () => {
    const first = await createTestReceipt({ file_sha256: sha });
    expect(first.statusCode).toBe(201);
    const existingId = first.json().data.id;

    const second = await createTestReceipt({ file_sha256: sha });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('DUPLICATE_RECEIPT');
    expect(second.json().error.existing_id).toBe(existingId);
  });

  it('gleicher SHA256 in anderem Tenant → 201 (Tenant-Isolation)', async () => {
    const first = await createTestReceipt({ file_sha256: sha });
    expect(first.statusCode).toBe(201);

    // Anderer Tenant + Customer
    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-dedup-iso-${Date.now()}`, 'Iso'],
    );
    const otherTenantId = rows[0].id;
    const oc = await app.inject({
      method:  'POST',
      url:     '/api/v1/customers',
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenantId },
      payload: { name: 'Other' },
    });
    const otherCustomerId = oc.json().data.id;

    const second = await app.inject({
      method:  'POST',
      url:     '/api/v1/receipts',
      headers: { 'content-type': 'application/json', 'x-pp-tenant-id': otherTenantId },
      payload: { customer_id: otherCustomerId, file_sha256: sha },
    });
    expect(second.statusCode).toBe(201);

    await app.db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
  });

  it('lehnt ungültigen SHA256 ab', async () => {
    const res = await createTestReceipt({ file_sha256: 'not-a-valid-hash' });
    expect(res.statusCode).toBe(422);
  });
});

// ── Volltextsuche ─────────────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts mit search-Parameter', () => {
  it('findet Receipt anhand original_name', async () => {
    await createTestReceipt({ original_name: 'Lieferschein Bahn.pdf' });
    await createTestReceipt({ original_name: 'Rechnung Foo.pdf' });

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/receipts?search=Bahn',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.receipts as Array<{ original_name: string }>;
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((r) => r.original_name?.includes('Bahn'))).toBe(true);
  });

  it('findet Receipt anhand metadata.ocr_text', async () => {
    const r = (await createTestReceipt()).json();
    await app.db.query(
      `UPDATE receipts SET metadata = $2 WHERE id = $1`,
      [r.data.id, JSON.stringify({ ocr_text: 'Hochgeschwindigkeitszug nach Berlin' })],
    );

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/receipts?search=Berlin',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.receipts.length).toBeGreaterThanOrEqual(1);
  });

  it('liefert leere Liste bei nicht gefundenem Suchbegriff', async () => {
    await createTestReceipt({ original_name: 'beleg-1.pdf' });
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/receipts?search=xyznopematch9876',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.receipts).toEqual([]);
    expect(res.json().data.total).toBe(0);
  });
});

// ── GET /:id/upload-url ───────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts/:id/upload-url', () => {
  it('gibt eine uploadUrl zurück', async () => {
    const created = (await createTestReceipt()).json();
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/receipts/${created.data.id}/upload-url`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.uploadUrl).toMatch(/^https?:\/\//);
    expect(res.json().data.key).toContain(tenantId);
  });

  it('gibt 404 wenn Receipt nicht existiert', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/receipts/00000000-0000-0000-0000-000000000000/upload-url',
      headers: headers(),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /:id/reprocess (A1) ─────────────────────────────────────────────

describe.skipIf(!E2E)('POST /api/v1/receipts/:id/reprocess', () => {
  it('setzt Status auf received zurück', async () => {
    // Receipt anlegen und Status auf done setzen
    const created = (await createTestReceipt()).json();
    const id = created.data.id;
    await app.inject({
      method:  'PUT',
      url:     `/api/v1/receipts/${id}/status`,
      headers: headers(),
      payload: { status: 'done' },
    });

    // Re-Processing auslösen
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/receipts/${id}/reprocess`,
      headers: headers(),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().data.status).toBe('received');
  });

  it('gibt 404 bei unbekannter ID zurück', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/receipts/00000000-0000-0000-0000-000000000000/reprocess',
      headers: headers(),
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('gibt 400 bei ungültiger UUID zurück', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/receipts/invalid-uuid/reprocess',
      headers: headers(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /:id/download (A1) ───────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/receipts/:id/download', () => {
  it('gibt 404 wenn kein storage_key gesetzt', async () => {
    // Receipt anlegen — hat keinen storage_key
    const created = (await createTestReceipt()).json();
    const id = created.data.id;

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/receipts/${id}/download`,
      headers: headers(),
    });

    // Kein storage_key → NO_FILE (404)
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NO_FILE');
  });

  it('gibt 404 bei unbekannter Receipt-ID zurück', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/receipts/00000000-0000-0000-0000-000000000000/download',
      headers: headers(),
    });
    expect(res.statusCode).toBe(404);
  });
});
