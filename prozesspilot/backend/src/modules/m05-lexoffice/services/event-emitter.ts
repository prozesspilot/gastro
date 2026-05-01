/**
 * M05 — Lexoffice-Export-Event-Emitter.
 */

import type Redis from 'ioredis';
import { publishEvent } from '../../../core/events/publisher';

export const RECEIPT_STREAM = 'pp:events:receipt';

export type ExportEventType = 'pp.receipt.exported' | 'pp.receipt.export_failed';

export interface ExportEventData {
  receipt_id: string;
  customer_id: string;
  status: string;
  target: 'lexoffice';
  external_id?: string;
  external_url?: string;
  error?: string;
  trace_id?: string;
}

export async function emitLexofficeEvent(
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
