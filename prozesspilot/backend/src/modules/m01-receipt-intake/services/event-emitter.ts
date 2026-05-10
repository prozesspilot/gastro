/**
 * M01 — Receipt-Event-Emitter.
 *
 * Sendet `pp.receipt.extracted` / `pp.receipt.requires_review` /
 * `pp.receipt.extraction_failed` über den existierenden Low-Level-Publisher
 * (D6) auf den Stream `pp:events:receipt`.
 *
 * Best-effort wie alle Event-Publishes — Fehler kippen den Hauptpfad nicht.
 */

import type Redis from 'ioredis';
import { publishEvent } from '../../../core/events/publisher';

/** M01-spezifischer Stream-Name (01 §4.1). Liegt nicht in core/events/types,
 *  weil der Foundation-Code andere Streams benutzt; wir orientieren uns an
 *  der Spec direkt. */
export const RECEIPT_STREAM = 'pp:events:receipt';

export type ReceiptEventType =
  | 'pp.receipt.extracted'
  | 'pp.receipt.requires_review'
  | 'pp.receipt.extraction_failed';

export interface ReceiptEventData {
  receipt_id: string;
  customer_id: string;
  status: string;
  confidence?: number;
  supplier_name?: string;
  total_gross?: number;
  trace_id?: string;
}

export async function emitReceiptEvent(
  redis: Redis,
  type: ReceiptEventType,
  data: ReceiptEventData,
): Promise<void> {
  await publishEvent(redis, RECEIPT_STREAM, {
    type,
    customer_id: data.customer_id,
    timestamp: new Date().toISOString(),
    payload: JSON.stringify(data),
  });
}
