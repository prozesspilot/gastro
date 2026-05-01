/**
 * M02 — Receipt-Archived-Event-Emitter.
 *
 * Veröffentlicht `pp.receipt.archived` über den Low-Level-Publisher (D6)
 * auf den Stream `pp:events:receipt`. Best-effort wie alle Event-Publishes.
 */

import type Redis from 'ioredis';
import { publishEvent } from '../../../core/events/publisher';

export const RECEIPT_STREAM = 'pp:events:receipt';

export type ArchiveEventType = 'pp.receipt.archived' | 'pp.receipt.archive_failed';

export interface ArchiveEventData {
  receipt_id: string;
  customer_id: string;
  status: string;
  target?: string;
  path?: string;
  external_id?: string;
  trace_id?: string;
}

export async function emitArchiveEvent(
  redis: Redis,
  type: ArchiveEventType,
  data: ArchiveEventData,
): Promise<void> {
  await publishEvent(redis, RECEIPT_STREAM, {
    type,
    customer_id: data.customer_id,
    timestamp: new Date().toISOString(),
    payload: JSON.stringify(data),
  });
}
