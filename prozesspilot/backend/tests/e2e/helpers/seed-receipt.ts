/**
 * E2E-Helper: seedReceipt
 *
 * Inseriert ein Receipt direkt in die Welt-A-receipts-Tabelle.
 */

import type { Pool } from 'pg';

export interface SeedReceiptOpts {
  customer_id: string;
  receipt_id?: string;
  status?: string;
  file?: {
    object_key?: string;
    mime_type?: string;
    size_bytes?: number;
    sha256?: string;
  };
  source?: Record<string, unknown>;
  extraction?: Record<string, unknown>;
  categorization?: Record<string, unknown>;
}

export interface SeededReceipt {
  receipt_id: string;
  customer_id: string;
  status: string;
  file_object_key: string;
  file_sha256: string;
}

export async function seedReceipt(pool: Pool, opts: SeedReceiptOpts): Promise<SeededReceipt> {
  const receiptId = opts.receipt_id ?? `rcpt_e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const file = {
    object_key: `cust_${opts.customer_id}/originals/test/${receiptId}.jpg`,
    mime_type: 'image/jpeg',
    size_bytes: 1024,
    sha256: `e2e_${receiptId}`,
    ...(opts.file ?? {}),
  };
  const status = opts.status ?? 'received';

  const payload = {
    receipt_id: receiptId,
    customer_id: opts.customer_id,
    schema_version: '1.0',
    status,
    file,
    source: opts.source ?? { channel: 'e2e_test' },
    ...(opts.extraction ? { extraction: opts.extraction } : {}),
    ...(opts.categorization ? { categorization: opts.categorization } : {}),
  };

  await pool.query(
    `INSERT INTO receipts (receipt_id, customer_id, status, file_object_key, file_sha256, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (customer_id, file_sha256) DO UPDATE
       SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = now()`,
    [receiptId, opts.customer_id, status, file.object_key, file.sha256, JSON.stringify(payload)],
  );

  return {
    receipt_id: receiptId,
    customer_id: opts.customer_id,
    status,
    file_object_key: file.object_key,
    file_sha256: file.sha256,
  };
}
