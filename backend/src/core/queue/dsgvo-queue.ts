/**
 * T010/M12 — BullMQ-Queue fuer DSGVO-Auskunfts-ZIP-Builds.
 *
 * Pattern identisch zu core/queue/ocr-queue.ts. Lazy-Init, Singleton.
 *
 * Job-Payload: { request_id, tenant_id }
 *   - Subject-Email kommt aus dsgvo_requests-Row (Worker laedt sie).
 *   - ZIP-Passwort wird vom Worker generiert + verschluesselt persistiert.
 */

import type { Job, Queue } from 'bullmq';
import { config } from '../config';
import { logger } from '../logger';

export interface DsgvoJobData {
  request_id: string;
  tenant_id: string;
}

export interface DsgvoJobResult {
  status: 'ready' | 'failed';
  export_object_key?: string;
  error?: string;
}

export const DSGVO_QUEUE_NAME = 'dsgvo';

let cachedQueue: Queue<DsgvoJobData, DsgvoJobResult> | null = null;

export async function getDsgvoQueue(): Promise<Queue<DsgvoJobData, DsgvoJobResult>> {
  if (cachedQueue) return cachedQueue;
  const bullmq = await import('bullmq');
  cachedQueue = new bullmq.Queue<DsgvoJobData, DsgvoJobResult>(DSGVO_QUEUE_NAME, {
    connection: { url: config.REDIS_URL },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 3600, count: 200 },
      removeOnFail: { age: 7 * 24 * 3600, count: 100 },
    },
  });
  return cachedQueue;
}

export async function enqueueDsgvoZipJob(data: DsgvoJobData): Promise<void> {
  if (!config.DSGVO_QUEUE_ENABLED) {
    logger.debug({ request_id: data.request_id }, '[dsgvo-queue] disabled — skip enqueue');
    return;
  }
  const queue = await getDsgvoQueue();
  const jobId = `dsgvo:${data.request_id}`;
  await queue.add('build-zip', data, { jobId });
  logger.info(
    { jobId, request_id: data.request_id, tenant_id: data.tenant_id },
    '[dsgvo-queue] Job enqueued',
  );
}

export async function closeDsgvoQueue(): Promise<void> {
  if (cachedQueue) {
    await cachedQueue.close().catch(() => undefined);
    cachedQueue = null;
  }
}

export type DsgvoJob = Job<DsgvoJobData, DsgvoJobResult>;
