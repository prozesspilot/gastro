/**
 * Receipt Pipeline Integration Tests
 *
 * Testet die komplette Pipeline von Upload bis Archivierung
 * gegen eine echte Test-DB (pp_test).
 *
 * Voraussetzung: TEST_DATABASE_URL gesetzt oder PostgreSQL auf localhost:5432
 * mit DB pp_test erreichbar.
 *
 * Tests:
 *   1. Receipt hochladen → status=received
 *   2. OCR (gemockt) → status=extracted
 *   3. Kategorisierung (gemockt) → status=categorized
 *   4. Archivierung → status=archived
 *   5. Idempotenz (gleiche sha256) → existierender Beleg gefunden
 *   6. Tenant-Isolation
 */

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  create,
  findByHash,
  findById,
  update,
} from '../../modules/_shared/receipts/receipt.repository';
import type { Receipt, ReceiptFile } from '../../modules/_shared/receipts/receipt.repository';
import { cleanTestDb, setupTestDb } from './setup';

// DECISION: Integration-Tests laufen nur wenn DB erreichbar.
// Bei fehlendem DB-Server wird der gesamte Describe-Block geskippt.
let pool: pg.Pool;
let dbAvailable = false;

beforeAll(async () => {
  try {
    pool = await setupTestDb();
    // Verbindungstest
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch {
    // DB nicht verfuegbar — Tests werden geskippt
  }
});

afterAll(async () => {
  if (pool) {
    await pool.end().catch(() => {});
  }
});

beforeEach(async () => {
  if (dbAvailable) {
    await cleanTestDb(pool);
  }
});

function makeCustomerId(): string {
  return crypto.randomUUID();
}

function makeSha256(): string {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function makeFile(sha256?: string): ReceiptFile {
  return {
    object_key: `raw/test-${Date.now()}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 1024,
    sha256: sha256 ?? makeSha256(),
  };
}

describe('Receipt Pipeline Integration', () => {
  it('Test 1: Receipt hochladen → status=received', async () => {
    if (!dbAvailable) return;

    const customerId = makeCustomerId();
    const receiptId = crypto.randomUUID();
    const file = makeFile();

    const created = await create(pool, {
      receipt_id: receiptId,
      customer_id: customerId,
      status: 'received',
      file,
    });

    expect(created.receipt_id).toBe(receiptId);
    expect(created.status).toBe('received');

    const loaded = await findById(pool, receiptId, customerId);
    expect(loaded).not.toBeNull();
    expect(loaded?.status).toBe('received');
  });

  it('Test 2: OCR (gemockt) → status=extracted', async () => {
    if (!dbAvailable) return;

    const customerId = makeCustomerId();
    const receiptId = crypto.randomUUID();
    const file = makeFile();

    const created = await create(pool, {
      receipt_id: receiptId,
      customer_id: customerId,
      status: 'received',
      file,
    });

    // Simuliert OCR-Ergebnis
    const extracted: Receipt = {
      ...created,
      status: 'extracted',
      extraction: {
        fields: {
          supplier_name: 'METRO Cash & Carry',
          total_amount: 125.5,
          currency: 'EUR',
          invoice_date: '2026-04-15',
          invoice_number: 'RE-2026-001',
        },
        confidence: 0.92,
        extracted_at: new Date().toISOString(),
        provider: 'mock',
      },
    };

    const updated = await update(pool, extracted);
    expect(updated.status).toBe('extracted');
    expect(updated.extraction).toBeDefined();
    expect((updated.extraction as Record<string, unknown>)?.fields).toBeDefined();
  });

  it('Test 3: Kategorisierung (gemockt) → status=categorized', async () => {
    if (!dbAvailable) return;

    const customerId = makeCustomerId();
    const receiptId = crypto.randomUUID();
    const file = makeFile();

    const created = await create(pool, {
      receipt_id: receiptId,
      customer_id: customerId,
      status: 'extracted',
      file,
    });

    const categorized: Receipt = {
      ...created,
      status: 'categorized',
      categorization: {
        category_id: 'betriebsbedarf',
        category_label: 'Betriebsbedarf',
        skr03_account: '4980',
        confidence: 0.89,
        strategy: 'claude',
        categorized_at: new Date().toISOString(),
      },
    };

    const updated = await update(pool, categorized);
    expect(updated.status).toBe('categorized');
    expect(updated.categorization).toBeDefined();
  });

  it('Test 4: Archivierung → status=archived', async () => {
    if (!dbAvailable) return;

    const customerId = makeCustomerId();
    const receiptId = crypto.randomUUID();
    const file = makeFile();

    const created = await create(pool, {
      receipt_id: receiptId,
      customer_id: customerId,
      status: 'categorized',
      file,
    });

    const archived: Receipt = {
      ...created,
      status: 'archived',
      archive: {
        target: 'minio',
        bucket: 'prozesspilot-receipts',
        object_key: `archive/${customerId}/${receiptId}.pdf`,
        archived_at: new Date().toISOString(),
      },
    };

    const updated = await update(pool, archived);
    expect(updated.status).toBe('archived');
    expect(updated.archive).toBeDefined();
  });

  it('Test 5: Idempotenz (gleiche sha256) → existierender Beleg gefunden', async () => {
    if (!dbAvailable) return;

    const sha256 = 'a'.repeat(64);
    const customerId = makeCustomerId();
    const receiptId = crypto.randomUUID();
    const file = makeFile(sha256);

    await create(pool, {
      receipt_id: receiptId,
      customer_id: customerId,
      status: 'received',
      file,
    });

    // Zweiter Versuch mit gleicher sha256: findByHash sollte den Ersten finden
    const existing = await findByHash(pool, customerId, sha256);
    expect(existing).not.toBeNull();
    expect(existing?.receipt_id).toBe(receiptId);
  });

  it('Test 6: Tenant-Isolation — anderer Customer sieht Beleg nicht', async () => {
    if (!dbAvailable) return;

    const customerId1 = makeCustomerId();
    const customerId2 = makeCustomerId();
    const receiptId = crypto.randomUUID();
    const file = makeFile();

    await create(pool, {
      receipt_id: receiptId,
      customer_id: customerId1,
      status: 'received',
      file,
    });

    // Customer2 darf den Beleg von Customer1 NICHT sehen
    const resultForOther = await findById(pool, receiptId, customerId2);
    expect(resultForOther).toBeNull();

    // Customer1 sieht seinen eigenen Beleg
    const resultForOwner = await findById(pool, receiptId, customerId1);
    expect(resultForOwner).not.toBeNull();
  });
});
