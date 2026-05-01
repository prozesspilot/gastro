/**
 * M09 — Reference-Resolver
 *
 * Extrahiert PP-REF-xxxx aus Mail-Subject und löst es auf einen Receipt auf.
 * Format: PP-REF-{receipt_id.slice(-12)}
 */

import type { Pool } from 'pg';

const REF_PATTERN = /PP-REF-([A-Z0-9]{12})/i;

/**
 * Generiert eine Reference-ID aus einer Receipt-ID.
 */
export function buildReferenceId(receiptId: string): string {
  return `PP-REF-${receiptId.slice(-12).toUpperCase()}`;
}

/**
 * Extrahiert eine Reference-ID aus einem Subject oder Body-Text.
 * Gibt null zurück wenn keine Reference-ID gefunden.
 */
export function extractReferenceId(text: string): string | null {
  const match = REF_PATTERN.exec(text);
  return match ? `PP-REF-${match[1].toUpperCase()}` : null;
}

/**
 * Findet eine Communication-Eintrag anhand der Reference-ID.
 */
export async function findCommunicationByReference(
  db: Pool,
  referenceId: string,
): Promise<{
  communication_id: string;
  receipt_id: string | null;
  customer_id: string;
} | null> {
  const { rows } = await db.query<{
    communication_id: string;
    receipt_id: string | null;
    customer_id: string;
  }>(
    `SELECT communication_id, receipt_id, customer_id
       FROM communications
      WHERE reference_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [referenceId],
  );
  return rows[0] ?? null;
}
