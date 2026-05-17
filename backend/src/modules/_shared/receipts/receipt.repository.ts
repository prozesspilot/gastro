/**
 * Shared Receipt-Repository (M01 §7.1).
 *
 * Liest und schreibt die `receipts`-Tabelle (moderne Schema mit `id` UUID,
 * `storage_key`, `metadata` JSONB).
 *
 * Alle Handler (M01, M02, M03 …) nutzen dieses Repository über das
 * gemeinsame Receipt-Interface. Die Spalten-Umbenennung gegenüber der
 * Ursprungs-Migration wird hier transparent gemappt:
 *
 *   DB-Spalte       | Receipt-Feld
 *   ----------------|--------------------------
 *   id              | receipt_id
 *   storage_key     | file.object_key
 *   metadata JSONB  | extraction, categorization,
 *                   | validation, archive, exports,
 *                   | audit, meta, page_count
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
  mime_type: string;
  size_bytes: number;
  sha256: string;
  page_count?: number;
}

export interface Receipt {
  receipt_id: string;
  customer_id: string;
  schema_version?: string;
  status: ReceiptStatus;
  created_at?: string;
  updated_at?: string;
  source?: Record<string, unknown>;
  file: ReceiptFile;
  extraction?: Record<string, unknown>;
  categorization?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  archive?: Record<string, unknown>;
  exports?: unknown[];
  audit?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

// ── Moderne DB-Zeile ──────────────────────────────────────────────────────────

interface ReceiptRow {
  id: string;
  customer_id: string;
  status: string;
  storage_key: string | null;
  file_sha256: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const SELECT_COLS = `
  id, customer_id, status, storage_key, file_sha256, mime_type,
  file_size_bytes, metadata, created_at, updated_at
`;

function rowToReceipt(row: ReceiptRow): Receipt {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    receipt_id: row.id,
    customer_id: row.customer_id,
    status: row.status as ReceiptStatus,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    file: {
      object_key: row.storage_key ?? '',
      mime_type: row.mime_type ?? 'application/octet-stream',
      size_bytes: typeof row.file_size_bytes === 'number' ? row.file_size_bytes : 0,
      sha256: row.file_sha256 ?? '',
      page_count: meta.page_count as number | undefined,
    },
    extraction: meta.extraction as Record<string, unknown> | undefined,
    categorization: meta.categorization as Record<string, unknown> | undefined,
    validation: meta.validation as Record<string, unknown> | undefined,
    archive: meta.archive as Record<string, unknown> | undefined,
    exports: meta.exports as unknown[] | undefined,
    audit: meta.audit as Record<string, unknown> | undefined,
    meta: meta.meta as Record<string, unknown> | undefined,
  };
}

/** Baut das metadata-Patch-Objekt aus einem Receipt (nur befüllte Felder). */
function receiptToMetadataPatch(receipt: Partial<Receipt>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (receipt.extraction !== undefined) patch.extraction = receipt.extraction;
  if (receipt.categorization !== undefined) patch.categorization = receipt.categorization;
  if (receipt.validation !== undefined) patch.validation = receipt.validation;
  if (receipt.archive !== undefined) patch.archive = receipt.archive;
  if (receipt.exports !== undefined) patch.exports = receipt.exports;
  if (receipt.audit !== undefined) patch.audit = receipt.audit;
  if (receipt.meta !== undefined) patch.meta = receipt.meta;
  if (receipt.file?.page_count !== undefined) patch.page_count = receipt.file.page_count;
  return patch;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

export async function findById(
  db: Pool,
  receiptId: string,
  customerId: string,
): Promise<Receipt | null> {
  const { rows } = await db.query<ReceiptRow>(
    `SELECT ${SELECT_COLS}
       FROM receipts
      WHERE id = $1 AND customer_id = $2
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
    `SELECT ${SELECT_COLS}
       FROM receipts
      WHERE customer_id = $1 AND file_sha256 = $2
      LIMIT 1`,
    [customerId, sha256],
  );
  return rows[0] ? rowToReceipt(rows[0]) : null;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateReceiptInput {
  receipt_id: string;
  customer_id: string;
  status?: ReceiptStatus;
  file: ReceiptFile;
  payload?: Partial<Receipt>;
}

/**
 * Legt einen neuen Receipt an. receipt_id wird als `id` gespeichert.
 * ON CONFLICT (id) → nur Status-Update, kein Überschreiben vorhandener Daten.
 */
export async function create(db: Pool, input: CreateReceiptInput): Promise<Receipt> {
  const status = input.status ?? 'received';
  const initialMeta = receiptToMetadataPatch({
    ...input.payload,
    file: input.file,
  });

  const { rows } = await db.query<ReceiptRow>(
    `INSERT INTO receipts (id, customer_id, status, storage_key, file_sha256,
        mime_type, file_size_bytes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status     = EXCLUDED.status,
       updated_at = now()
     RETURNING ${SELECT_COLS}`,
    [
      input.receipt_id,
      input.customer_id,
      status,
      input.file.object_key,
      input.file.sha256,
      input.file.mime_type,
      input.file.size_bytes,
      JSON.stringify(initialMeta),
    ],
  );
  return rowToReceipt(rows[0]);
}

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Vollständiges Update eines Receipts. `status` und `storage_key` werden
 * direkt gesetzt; Verarbeitungsdaten (extraction, categorization …) werden
 * per JSONB-Merge in `metadata` geschrieben, so dass andere Felder erhalten
 * bleiben.
 */
export async function update(db: Pool, receipt: Receipt): Promise<Receipt> {
  const metaPatch = receiptToMetadataPatch(receipt);

  const { rows } = await db.query<ReceiptRow>(
    `UPDATE receipts
        SET status      = $2,
            storage_key = $3,
            file_sha256 = $4,
            metadata    = COALESCE(metadata, '{}') || $5::jsonb,
            updated_at  = now()
      WHERE id = $1
      RETURNING ${SELECT_COLS}`,
    [
      receipt.receipt_id,
      receipt.status,
      receipt.file.object_key,
      receipt.file.sha256,
      JSON.stringify(metaPatch),
    ],
  );
  if (!rows[0]) {
    throw new Error(`Receipt ${receipt.receipt_id} nicht gefunden beim Update`);
  }
  return rowToReceipt(rows[0]);
}
