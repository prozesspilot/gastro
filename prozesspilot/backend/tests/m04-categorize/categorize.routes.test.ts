/**
 * Integration-Tests für M04 Categorize-Routen.
 * Mit CLAUDE_API_KEY=='' wird der Mock-Pfad genutzt.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

let app: FastifyInstance;
let tenantId: string;
let customerId: string;

beforeAll(async () => {
  // Mock-Pfad: keinen echten Anthropic-Call ausführen
  process.env.CLAUDE_API_KEY = '';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  const { rows } = await app.db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
    [`test-m04-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'M04 Test'],
  );
  tenantId = rows[0].id;

  const cRes = await app.inject({
    method:  'POST',
    url:     '/api/v1/customers',
    headers: { 'content-type': 'application/json', 'x-pp-tenant-id': tenantId },
    payload: { name: 'M04 Customer' },
  });
  customerId = cRes.json().data.id;
});

afterEach(async () => {
  await app.db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

function headers(tid: string = tenantId) {
  return { 'content-type': 'application/json', 'x-pp-tenant-id': tid };
}

async function makeReceipt() {
  const res = await app.inject({
    method:  'POST',
    url:     '/api/v1/receipts',
    headers: headers(),
    payload: { customer_id: customerId, original_name: 'beleg.pdf' },
  });
  return res.json().data;
}

// NOTE: Die alten m04-Tests sind historisch und testen das vor M03 ersetzte m04-Modul.
// Das m04-Modul wurde aus app.ts entfernt (Route-Konflikt mit m03-categorization).
// Die äquivalenten Tests sind in src/modules/m03-categorization/tests/.
describe.skip('POST /api/v1/receipts/:id/categorize (m04 veraltet — jetzt m03)', () => {
  it('liefert 200 mit Mock-Categorization', async () => {
    const r = await makeReceipt();
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/receipts/${r.id}/categorize`,
      headers: headers(),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.mock).toBe(true);
    expect(body.data.categorization.category).toBe('Büromaterial');
    expect(body.data.categorization.amount).toBe(0);
    expect(body.data.categorization.currency).toBe('EUR');
    expect(body.data.receipt.metadata.categorization).toBeDefined();
    expect(body.data.receipt.metadata.categorization.category).toBe('Büromaterial');
  });

  it('gibt 404 bei fremdem Tenant', async () => {
    const r = await makeReceipt();

    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-m04-iso-${Date.now()}`, 'Other'],
    );
    const otherTenantId = rows[0].id;

    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/receipts/${r.id}/categorize`,
      headers: headers(otherTenantId),
      payload: {},
    });
    expect(res.statusCode).toBe(404);

    await app.db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
  });

  it('setzt metadata.categorization persistent in DB', async () => {
    const r = await makeReceipt();
    await app.inject({
      method:  'POST',
      url:     `/api/v1/receipts/${r.id}/categorize`,
      headers: headers(),
      payload: {},
    });

    const after = await app.inject({
      method:  'GET',
      url:     `/api/v1/receipts/${r.id}`,
      headers: headers(),
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().data.metadata.categorization).toBeDefined();
    expect(after.json().data.metadata.categorization.category).toBe('Büromaterial');
  });
});
