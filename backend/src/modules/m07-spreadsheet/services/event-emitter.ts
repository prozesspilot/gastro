/**
 * M07 — Receipt-Export-Event-Emitter.
 *
 * Sendet `pp.receipt.exported` / `pp.receipt.export_failed` über den
 * Low-Level-Publisher (D6) auf den Stream `pp:events:receipt`.
 *
 * Best-effort wie alle Event-Publishes — Fehler kippen den Hauptpfad nicht.
 */

import type Redis from 'ioredis';
import { publishEvent } from '../../../core/events/publisher';

export const RECEIPT_STREAM = 'pp:events:receipt';

export type ExportEventType = 'pp.receipt.exported' | 'pp.receipt.export_failed';

export interface ExportEventData {
  receipt_id: string;
  customer_id: string;
  status: string;
  target: string; // 'google_sheets' | 'excel_onedrive' | …
  external_id?: string;
  external_url?: string;
  trace_id?: string;
  error?: string;
}

export async function emitExportEvent(
  redis: Redis,
  type: ExportEventType,
  data: ExportEventData,
): Promise<void> {
  await publishEvent(redis, RECEIPT_STREAM, {
    type,
    customer_id: data.customer_id,
    timestamp: new Date().toISOString(),
    payload: JSON.stringify(data),
  });
}
