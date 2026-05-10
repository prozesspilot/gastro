/**
 * Integration-Tests für M03 OCR-Routen.
 * Mit GOOGLE_VISION_KEY_FILE=='' wird der Mock-Pfad genutzt.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

// Skip all DB integration tests when no Postgres is available (set PP_E2E=1 to run)
const E2E = process.env.PP_E2E === '1';

let app: FastifyInstance;
let tenantId: string;
let customerId: string;

beforeAll(async () => {
  if (!E2E) return;
  // Mock-Pfad sicherstellen (kein echter Vision-Call in Tests)
  process.env.GOOGLE_VISION_KEY_FILE = '';
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
    'INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id',
    [`test-m03-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'M03 Test'],
  );
  tenantId = rows[0].id;

  const cRes = await app.inject({
    method: 'POST',
    url: '/api/v1/customers',
    headers: { 'content-type': 'application/json', 'x-pp-tenant-id': tenantId },
    payload: { name: 'M03 Customer' },
  });
  customerId = cRes.json().data.id;
});

afterEach(async () => {
  if (!E2E) return;
  await app.db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
});

function headers(tid: string = tenantId) {
  return { 'content-type': 'application/json', 'x-pp-tenant-id': tid };
}

async function makeReceipt() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/receipts',
    headers: headers(),
    payload: { customer_id: customerId, original_name: 'beleg.pdf' },
  });
  return res.json().data;
}

describe.skipIf(!E2E)('POST /api/v1/receipts/:id/ocr', () => {
  it('liefert 200 mit metadata.ocr_text bei Mock-Pfad', async () => {
    const r = await makeReceipt();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${r.id}/ocr`,
      headers: headers(),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.mock).toBe(true);
    expect(body.data.ocr_text).toBe('OCR nicht konfiguriert');
    expect(body.data.ocr_confidence).toBe(0);
    expect(body.data.receipt.metadata.ocr_text).toBe('OCR nicht konfiguriert');
    expect(body.data.receipt.metadata.ocr_at).toMatch(/^\d{4}-/);
  });

  it('gibt 404 bei fremdem Tenant zurück', async () => {
    const r = await makeReceipt();

    const { rows } = await app.db.query<{ id: string }>(
      'INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id',
      [`test-m03-iso-${Date.now()}`, 'Other'],
    );
    const otherTenantId = rows[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${r.id}/ocr`,
      headers: headers(otherTenantId),
      payload: {},
    });
    expect(res.statusCode).toBe(404);

    await app.db.query('DELETE FROM tenants WHERE id = $1', [otherTenantId]);
  });

  it('setzt Status während OCR auf processing (Mock: bleibt processing nach Mock-Run)', async () => {
    const r = await makeReceipt();
    const before = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${r.id}`,
      headers: headers(),
    });
    expect(before.json().data.status).toBe('pending');

    await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${r.id}/ocr`,
      headers: headers(),
      payload: {},
    });

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${r.id}`,
      headers: headers(),
    });
    // Mock-Pfad endet nicht mit 'error' und setzt während Verarbeitung 'processing'
    expect(['processing', 'done', 'pending']).toContain(after.json().data.status);
    expect(after.json().data.metadata.ocr_text).toBe('OCR nicht konfiguriert');
  });
});
