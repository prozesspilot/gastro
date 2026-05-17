/**
 * M03 — Categorization-Event-Emitter.
 *
 * Veröffentlicht pp.receipt.categorized / pp.receipt.requires_review
 * auf dem Stream pp:events:receipt (D6 publishEvent).
 */

import type Redis from 'ioredis';
import { publishEvent } from '../../../core/events/publisher';

export const RECEIPT_STREAM = 'pp:events:receipt';

export type CategorizationEventType =
  | 'pp.receipt.categorized'
  | 'pp.receipt.requires_review'
  | 'pp.receipt.categorization_failed';

export interface CategorizationEventData {
  receipt_id: string;
  customer_id: string;
  status: string;
  category?: string;
  category_label?: string;
  skr_account?: string;
  confidence?: number;
  engine?: string;
  trace_id?: string;
}

export async function emitCategorizationEvent(
  redis: Redis,
  type: CategorizationEventType,
  data: CategorizationEventData,
): Promise<void> {
  await publishEvent(redis, RECEIPT_STREAM, {
    type,
    customer_id: data.customer_id,
    timestamp: new Date().toISOString(),
    payload: JSON.stringify(data),
  });
}
