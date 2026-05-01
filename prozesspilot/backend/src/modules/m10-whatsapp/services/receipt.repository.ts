/**
 * M10 — Receipt-Repository (lese-only für Idempotenz-Check)
 *
 * M10 schreibt nicht direkt nach `receipts` (das macht WF-MASTER-RECEIPT
 * über POST /api/v1/receipts). Wir brauchen aber einen Lookup per
 * (customer_id, file_sha256) für die Idempotenz im Media-Download.
 *
 * Spec-Referenz:
 *   M10 §7.3 Schritt 6
 *   01_Datenmodell_Events.md §6 (UNIQUE (customer_id, file_sha256))
 */

import type { Pool } from 'pg';

export interface ExistingReceiptFile {
  receiptId:   string;
  objectKey:   string;
  mimeType:    string;
  sizeBytes:   number;
  sha256:      string;
}

interface ReceiptRow {
  receipt_id:      string;
  file_object_key: string;
  file_sha256:     string;
  payload:         {
    file?: {
      mime_type?:  string;
      size_bytes?: number;
    };
  };
}

/**
 * Sucht ein bestehendes Receipt mit identischem (customer_id, file_sha256).
 * Gibt null zurück, wenn keine Übereinstimmung existiert.
 */
export async function findReceiptByHash(
  db: Pool,
  customerId: string,
  sha256: string,
): Promise<ExistingReceiptFile | null> {
  const { rows } = await db.query<ReceiptRow>(
    `SELECT receipt_id, file_object_key, file_sha256, payload
       FROM receipts
      WHERE customer_id = $1
        AND file_sha256 = $2
      LIMIT 1`,
    [customerId, sha256],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    receiptId:  row.receipt_id,
    objectKey:  row.file_object_key,
    mimeType:   row.payload.file?.mime_type  ?? 'application/octet-stream',
    sizeBytes:  row.payload.file?.size_bytes ?? 0,
    sha256:     row.file_sha256,
  };
}
