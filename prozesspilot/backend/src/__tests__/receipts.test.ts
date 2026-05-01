/**
 * Receipt Repository Unit Tests — keine echte DB.
 *
 * Testet die Receipt-Repository-Logik mit einem gemockten DB-Pool.
 * Verifiziert CRUD-Verhalten und Tenant-Isolation auf Repository-Ebene.
 *
 * Tests:
 *   1. create() → Receipt-Objekt wird korrekt zurückgegeben
 *   2. findById() → gibt Receipt zurück wenn vorhanden
 *   3. findById() mit falscher customer_id → null (Tenant-Isolation)
 *   4. update() → Status und payload werden aktualisiert
 *   5. findByHash() → gibt Receipt zurück wenn sha256 bekannt
 */

import { describe, expect, it, vi } from 'vitest';
import {
  create,
  findById,
  findByHash,
  update,
} from '../modules/_shared/receipts/receipt.repository';
import type { Receipt } from '../modules/_shared/receipts/receipt.repository';

// ── Fake DB ──────────────────────────────────────────────────────────────────

type FakeRow = {
  receipt_id: string;
  customer_id: string;
  status: string;
  file_object_key: string;
  file_sha256: string;
  payload: Receipt;
  created_at: Date;
  updated_at: Date;
};

const store: FakeRow[] = [];

function makeFakePool() {
  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      // INSERT
      if (/INSERT INTO receipts/i.test(sql)) {
        const [id, cid, status, key, sha, payloadJson] = params as string[];
        const payload = JSON.parse(payloadJson) as Receipt;
        const row: FakeRow = {
          receipt_id: id,
          customer_id: cid,
          status,
          file_object_key: key,
          file_sha256: sha,
          payload,
          created_at: new Date(),
          updated_at: new Date(),
        };
        store.push(row);
        return { rows: [row] };
      }
      // SELECT by id + customer_id
      if (/WHERE\s+receipt_id = \$1 AND customer_id = \$2/i.test(sql)) {
        const [id, cid] = params as string[];
        const row = store.find((r) => r.receipt_id === id && r.customer_id === cid);
        return { rows: row ? [row] : [] };
      }
      // SELECT by customer_id + sha256
      if (/WHERE\s+customer_id = \$1 AND file_sha256 = \$2/i.test(sql)) {
        const [cid, sha] = params as string[];
        const row = store.find((r) => r.customer_id === cid && r.file_sha256 === sha);
        return { rows: row ? [row] : [] };
      }
      // UPDATE
      if (/UPDATE\s+receipts/i.test(sql)) {
        const [id, status, key, sha, payloadJson] = params as string[];
        const idx = store.findIndex((r) => r.receipt_id === id);
        if (idx >= 0) {
          const payload = JSON.parse(payloadJson) as Receipt;
          store[idx] = {
            ...store[idx],
            status,
            file_object_key: key,
            file_sha256: sha,
            payload,
            updated_at: new Date(),
          };
          return { rows: [store[idx]] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const customerA = 'cust_receipts_test_a';
const customerB = 'cust_receipts_test_b';

const baseFile = {
  object_key: `${customerA}/originals/2026/04/receipt.pdf`,
  mime_type: 'application/pdf',
  size_bytes: 1024,
  sha256: 'sha256_abc1234567890abc1234567890',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Receipt Repository', () => {
  it('Test 1: create() gibt Receipt-Objekt zurück', async () => {
    store.length = 0;
    const db = makeFakePool();

    const receipt = await create(db as never, {
      receipt_id: 'rcpt_crud_001',
      customer_id: customerA,
      status: 'received',
      file: baseFile,
    });

    expect(receipt.receipt_id).toBe('rcpt_crud_001');
    expect(receipt.customer_id).toBe(customerA);
    expect(receipt.status).toBe('received');
    expect(receipt.file.sha256).toBe(baseFile.sha256);
  });

  it('Test 2: findById() gibt Receipt zurück wenn vorhanden', async () => {
    store.length = 0;
    const db = makeFakePool();

    await create(db as never, {
      receipt_id: 'rcpt_crud_002',
      customer_id: customerA,
      status: 'archived',
      file: { ...baseFile, sha256: 'sha256_002' },
    });

    const found = await findById(db as never, 'rcpt_crud_002', customerA);
    expect(found).not.toBeNull();
    expect(found?.receipt_id).toBe('rcpt_crud_002');
    expect(found?.status).toBe('archived');
  });

  it('Test 3: findById() mit falscher customer_id → null (Tenant-Isolation)', async () => {
    store.length = 0;
    const db = makeFakePool();

    await create(db as never, {
      receipt_id: 'rcpt_crud_003',
      customer_id: customerA,
      status: 'archived',
      file: { ...baseFile, sha256: 'sha256_003' },
    });

    // Tenant B versucht Tenant A Receipt zu lesen
    const found = await findById(db as never, 'rcpt_crud_003', customerB);
    expect(found).toBeNull();
  });

  it('Test 4: update() aktualisiert Status und Payload', async () => {
    store.length = 0;
    const db = makeFakePool();

    const original = await create(db as never, {
      receipt_id: 'rcpt_crud_004',
      customer_id: customerA,
      status: 'received',
      file: { ...baseFile, sha256: 'sha256_004' },
    });

    const updated = await update(db as never, {
      ...original,
      status: 'exported',
      exports: [{ target: 'lexoffice', status: 'pushed', external_id: 'lex-001', external_url: 'http://lex', pushed_at: new Date().toISOString() }],
    });

    expect(updated.status).toBe('exported');
    expect(updated.exports).toHaveLength(1);
  });

  it('Test 5: findByHash() gibt Receipt zurück wenn sha256 bekannt', async () => {
    store.length = 0;
    const db = makeFakePool();

    const sha = 'sha256_unique_hash_00005';
    await create(db as never, {
      receipt_id: 'rcpt_crud_005',
      customer_id: customerA,
      status: 'received',
      file: { ...baseFile, sha256: sha },
    });

    const found = await findByHash(db as never, customerA, sha);
    expect(found).not.toBeNull();
    expect(found?.receipt_id).toBe('rcpt_crud_005');
  });

  it('Test 6: findByHash() mit fremder customer_id → null', async () => {
    store.length = 0;
    const db = makeFakePool();

    const sha = 'sha256_unique_hash_00006';
    await create(db as never, {
      receipt_id: 'rcpt_crud_006',
      customer_id: customerA,
      status: 'received',
      file: { ...baseFile, sha256: sha },
    });

    // customerB versucht mit bekannter sha256 zu lesen → null (anderer Tenant)
    const found = await findByHash(db as never, customerB, sha);
    expect(found).toBeNull();
  });

  it('Test 7: create() mit status=categorized setzt korrekt', async () => {
    store.length = 0;
    const db = makeFakePool();

    const receipt = await create(db as never, {
      receipt_id: 'rcpt_crud_007',
      customer_id: customerA,
      status: 'categorized',
      file: { ...baseFile, sha256: 'sha256_007' },
    });

    expect(receipt.status).toBe('categorized');
  });

  it('Test 8: status=requires_review wird korrekt gespeichert', async () => {
    store.length = 0;
    const db = makeFakePool();

    const receipt = await create(db as never, {
      receipt_id: 'rcpt_crud_008',
      customer_id: customerA,
      status: 'requires_review',
      file: { ...baseFile, sha256: 'sha256_008' },
    });

    expect(receipt.status).toBe('requires_review');
  });
});
