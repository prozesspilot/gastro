/**
 * Shared Receipt-Repository (M01 §7.1).
 *
 * Liest und schreibt die `receipts`-Tabelle (Migration 010_m10_minimal.sql).
 * Wird von allen Modulen benutzt, die ein Receipt laden/aktualisieren.
 *
 * Design:
 *   - Receipts sind das zentrale Datenformat (01 §2). `payload` ist das
 *     vollständige Receipt-JSON; `status`, `customer_id`, `file_object_key`
 *     und `file_sha256` werden zusätzlich als Spalten geführt für
 *     Indizes/Queries.
 *   - update() schreibt sowohl Spalten als auch payload, damit beide
 *     konsistent bleiben.
 *   - findByHash() ist die Idempotenz-Anker-Query (UNIQUE(customer_id, file_sha256)).
 */

import type { Pool } from 'pg';

// ── Receipt-Form (Subset von 01 §2.1) ─────────────────────────────────────────

export type ReceiptStatus =
  | 'received'
  | 'extracting'
  | 'extracted'
  | 'categorizing'
  | 'categorized'
  | 'archiving'
  | 'archived'
  | 'exporting'
  | 'exported'
  | 'completed'
  | 'requires_review'
  | 'error';

export interface ReceiptFile {
  object_key: string;
  mime_type:  string;
  size_bytes: number;
  sha256:     string;
  page_count?: number;
}

export interface Receipt {
  receipt_id:     string;
  customer_id:    string;
  schema_version?: string;
  status:         ReceiptStatus;
  created_at?:    string;
  updated_at?:    string;
  source?:        Record<string, unknown>;
  file:           ReceiptFile;
  extraction?:    Record<string, unknown>;
  categorization?: Record<string, unknown>;
  validation?:    Record<string, unknown>;
  archive?:       Record<string, unknown>;
  exports?:       unknown[];
  audit?:         Record<string, unknown>;
  meta?:          Record<string, unknown>;
}

interface ReceiptRow {
  receipt_id:      string;
  customer_id:     string;
  status:          string;
  file_object_key: string;
  file_sha256:     string;
  payload:         Receipt;
  created_at:      Date;
  updated_at:      Date;
}

function rowToReceipt(row: ReceiptRow): Receipt {
  return {
    ...row.payload,
    receipt_id:  row.receipt_id,
    customer_id: row.customer_id,
    status:      row.status as ReceiptStatus,
    created_at:  row.created_at.toISOString(),
    updated_at:  row.updated_at.toISOString(),
  };
}

// ── Lookups ───────────────────────────────────────────────────────────────────

export async function findById(
  db: Pool,
  receiptId: string,
  customerId: string,
): Promise<Receipt | null> {
  const { rows } = await db.query<ReceiptRow>(
    `SELECT receipt_id, customer_id, status, file_object_key, file_sha256,
            payload, created_at, updated_at
       FROM receipts
      WHERE receipt_id = $1 AND customer_id = $2
      LIMIT 1`,
    [receiptId, customerId],
  );
  return rows[0] ? rowToReceipt(rows[0]) : null;
}

export async function findByHash(
  db: Pool,
  customerId: string,
  sha256: string,
): Promise<Receipt | null> {
  const { rows } = await db.query<ReceiptRow>(
    `SELECT receipt_id, customer_id, status, file_object_key, file_sha256,
            payload, created_at, updated_at
       FROM receipts
      WHERE customer_id = $1 AND file_sha256 = $2
      LIMIT 1`,
    [customerId, sha256],
  );
  return rows[0] ? rowToReceipt(rows[0]) : null;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateReceiptInput {
  receipt_id:  string;
  customer_id: string;
  status?:     ReceiptStatus;
  file:        ReceiptFile;
  payload?:    Partial<Receipt>;
}

export async function create(db: Pool, input: CreateReceiptInput): Promise<Receipt> {
  const status = input.status ?? 'received';
  const payload: Receipt = {
    schema_version: '1.0',
    ...input.payload,
    receipt_id:  input.receipt_id,
    customer_id: input.customer_id,
    status,
    file:        input.file,
  };

  const { rows } = await db.query<ReceiptRow>(
    `INSERT INTO receipts (
        receipt_id, customer_id, status, file_object_key, file_sha256, payload
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING receipt_id, customer_id, status, file_object_key, file_sha256,
                payload, created_at, updated_at`,
    [
      input.receipt_id,
      input.customer_id,
      status,
      input.file.object_key,
      input.file.sha256,
      JSON.stringify(payload),
    ],
  );
  return rowToReceipt(rows[0]);
}

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Vollständiges Update eines Receipts. Spalten `status`, `file_object_key`,
 * `file_sha256` werden aus dem übergebenen Receipt synchronisiert; das
 * vollständige Receipt-JSON landet in `payload`.
 */
export async function update(db: Pool, receipt: Receipt): Promise<Receipt> {
  const { rows } = await db.query<ReceiptRow>(
    `UPDATE receipts
        SET status          = $2,
            file_object_key = $3,
            file_sha256     = $4,
            payload         = $5::jsonb,
            updated_at      = now()
      WHERE receipt_id = $1
      RETURNING receipt_id, customer_id, status, file_object_key, file_sha256,
                payload, created_at, updated_at`,
    [
      receipt.receipt_id,
      receipt.status,
      receipt.file.object_key,
      receipt.file.sha256,
      JSON.stringify(receipt),
    ],
  );
  if (!rows[0]) {
    throw new Error(`Receipt ${receipt.receipt_id} nicht gefunden`);
  }
  return rowToReceipt(rows[0]);
}
