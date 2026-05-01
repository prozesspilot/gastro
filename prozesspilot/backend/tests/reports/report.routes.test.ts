/**
 * Tests für PDF-Report-Routen.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

let app: FastifyInstance;
let tenantId: string;
let customerId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  const { rows } = await app.db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
    [`test-rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'Report Mandant'],
  );
  tenantId = rows[0].id;

  const cRes = await app.inject({
    method:  'POST',
    url:     '/api/v1/customers',
    headers: { 'content-type': 'application/json', 'x-pp-tenant-id': tenantId },
    payload: { name: 'Report Customer' },
  });
  customerId = cRes.json().data.id;
});

afterEach(async () => {
  await app.db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

function headers() {
  return { 'content-type': 'application/json', 'x-pp-tenant-id': tenantId };
}

describe('GET /api/v1/reports/receipts', () => {
  it('liefert PDF mit Content-Type application/pdf', async () => {
    await app.inject({
      method:  'POST',
      url:     '/api/v1/receipts',
      headers: headers(),
      payload: { customer_id: customerId, original_name: 'beleg.pdf' },
    });

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/reports/receipts',
      headers: headers(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/attachment.*\.pdf/);
    // Body ist ein nicht-leerer Buffer mit %PDF Magic
    expect(res.rawPayload.byteLength).toBeGreaterThan(100);
    expect(res.rawPayload.slice(0, 4).toString()).toBe('%PDF');
  });

  it('liefert PDF auch ohne Belege (leerer Mandant)', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/reports/receipts',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.rawPayload.byteLength).toBeGreaterThan(100);
  });

  it('akzeptiert status-Filter', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/reports/receipts?status=done',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
  });
});
