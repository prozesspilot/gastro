/**
 * Unit-Tests für Receipt-Repository.
 * ERFORDERT laufende Postgres-Instanz.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import {
  bulkUpdateStatus,
  createReceipt,
  getReceipt,
  getReceiptStats,
  listReceipts,
  listReceiptsForExport,
  updateReceiptStatus,
} from '../../src/modules/receipts/receipt.repository';

// Skip all DB integration tests when no Postgres is available (set PP_E2E=1 to run)
const E2E = process.env.PP_E2E === '1';

let app: FastifyInstance;
let db: Pool;
let tenantId: string;
let customerId: string;

beforeAll(async () => {
  if (!E2E) return;
  app = await buildApp();
  await app.ready();
  db = app.db;
});

afterAll(async () => {
  if (!E2E) return;
  await app.close();
});

beforeEach(async () => {
  if (!E2E) return;
  const { rows: tRows } = await db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
    [`test-repo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'Repo Test'],
  );
  tenantId = tRows[0].id;

  // Customer via HTTP-Endpoint anlegen (PII-Felder werden verschlüsselt)
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
  await db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe.skipIf(!E2E)('createReceipt', () => {
  it('legt einen Receipt mit Default-Werten an', async () => {
    const r = await createReceipt(db, tenantId, { customer_id: customerId });
    expect(r.tenant_id).toBe(tenantId);
    expect(r.customer_id).toBe(customerId);
    expect(r.status).toBe('pending');
    expect(r.source).toBe('manual');
    expect(r.metadata).toEqual({});
  });
});

describe.skipIf(!E2E)('getReceipt', () => {
  it('gibt null zurück wenn nicht im Tenant', async () => {
    const r = await createReceipt(db, tenantId, { customer_id: customerId });

    // Anderer Tenant
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-other-${Date.now()}`, 'Other'],
    );
    const otherTenant = rows[0].id;
    try {
      const found = await getReceipt(db, otherTenant, r.id);
      expect(found).toBeNull();
    } finally {
      await db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenant]);
    }
  });

  it('gibt Receipt zurück wenn im Tenant', async () => {
    const r = await createReceipt(db, tenantId, { customer_id: customerId });
    const found = await getReceipt(db, tenantId, r.id);
    expect(found?.id).toBe(r.id);
  });
});

describe.skipIf(!E2E)('listReceipts', () => {
  it('paginiert + filtert nach status', async () => {
    await createReceipt(db, tenantId, { customer_id: customerId });
    const r2 = await createReceipt(db, tenantId, { customer_id: customerId });
    await updateReceiptStatus(db, tenantId, r2.id, 'done');

    const all = await listReceipts(db, tenantId, { limit: 20, offset: 0 });
    expect(all.total).toBe(2);

    const onlyDone = await listReceipts(db, tenantId, { limit: 20, offset: 0, status: 'done' });
    expect(onlyDone.total).toBe(1);
    expect(onlyDone.data[0].status).toBe('done');
  });
});

describe.skipIf(!E2E)('updateReceiptStatus', () => {
  it('setzt error_message bei status=error', async () => {
    const r = await createReceipt(db, tenantId, { customer_id: customerId });
    const updated = await updateReceiptStatus(db, tenantId, r.id, 'error', 'Boom');
    expect(updated?.status).toBe('error');
    expect(updated?.error_message).toBe('Boom');
  });

  it('gibt null bei unbekannter ID', async () => {
    const u = await updateReceiptStatus(db, tenantId, '00000000-0000-0000-0000-000000000000', 'done');
    expect(u).toBeNull();
  });
});

describe.skipIf(!E2E)('getReceiptStats', () => {
  it('zählt korrekt nach status und source', async () => {
    await createReceipt(db, tenantId, { customer_id: customerId });
    const r2 = await createReceipt(db, tenantId, { customer_id: customerId, source: 'whatsapp' });
    await updateReceiptStatus(db, tenantId, r2.id, 'done');
    await createReceipt(db, tenantId, { customer_id: customerId, source: 'email' });

    const stats = await getReceiptStats(db, tenantId);
    expect(stats.total).toBe(3);
    expect(stats.by_status.pending).toBe(2);
    expect(stats.by_status.done).toBe(1);
    expect(stats.by_source.manual).toBe(1);
    expect(stats.by_source.whatsapp).toBe(1);
    expect(stats.by_source.email).toBe(1);
    expect(stats.today_count).toBe(3);
  });
});

describe.skipIf(!E2E)('bulkUpdateStatus', () => {
  it('aktualisiert mehrere IDs in einer Transaktion', async () => {
    const r1 = await createReceipt(db, tenantId, { customer_id: customerId });
    const r2 = await createReceipt(db, tenantId, { customer_id: customerId });
    const updated = await bulkUpdateStatus(db, tenantId, [r1.id, r2.id], 'processing');
    expect(updated).toHaveLength(2);
    expect(updated.every((r) => r.status === 'processing')).toBe(true);
  });

  it('gibt leeres Array bei leerer ID-Liste', async () => {
    const updated = await bulkUpdateStatus(db, tenantId, [], 'done');
    expect(updated).toEqual([]);
  });
});

describe.skipIf(!E2E)('listReceiptsForExport', () => {
  it('mappt categorization aus metadata', async () => {
    const r = await createReceipt(db, tenantId, { customer_id: customerId });
    await db.query(
      `UPDATE receipts SET metadata = $2 WHERE id = $1`,
      [
        r.id,
        JSON.stringify({
          categorization: {
            category: 'Reise',
            amount: 42.5,
            currency: 'EUR',
            date: '2026-04-30',
            confidence: 0.9,
          },
        }),
      ],
    );

    const rows = await listReceiptsForExport(db, tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('Reise');
    expect(rows[0].amount).toBe(42.5);
    expect(rows[0].currency).toBe('EUR');
  });
});
