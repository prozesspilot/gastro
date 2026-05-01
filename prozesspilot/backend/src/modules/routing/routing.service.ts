/**
 * D9 — Routing-Service
 *
 * Geschäftslogik rund um routing_jobs:
 *   createJobForDocument  — Job anlegen + n8n-Webhook auslösen (best-effort)
 *   processJob            — Job ausführen, Status setzen, Retry-Logik anwenden
 *
 * Der Service selbst führt keine Datenbankverbindungen; er delegiert an das
 * Repository. n8n-Aufrufe sind best-effort: schlagen sie fehl, wird der Job
 * als failed markiert, nicht geworfen.
 */

import type { Pool } from 'pg';
import { logger } from '../../core/logger';
import { triggerWebhook } from '../../core/n8n/client';
import {
  type CreateJobInput,
  type JobResponse,
  claimNextJob,
  createJob,
  failJob,
  findJobById,
  resetJobForRetry,
  updateJobStatus,
} from './routing.repository';

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface CreateJobForDocumentOptions {
  tenantId:    string;
  documentId:  string;
  payload?:    Record<string, unknown>;
  maxAttempts?: number;
  runAt?:      Date;
}

export interface ProcessResult {
  job:     JobResponse;
  success: boolean;
  error?:  string;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** n8n-Webhook für ein Dokument auslösen — best-effort, wirft nie. */
async function triggerDocumentWebhook(
  tenantId: string,
  documentId: string,
  jobId: string,
  extraPayload: Record<string, unknown>,
): Promise<void> {
  try {
    await triggerWebhook('document-routing', {
      tenant_id:   tenantId,
      document_id: documentId,
      job_id:      jobId,
      ...extraPayload,
    });
  } catch (err) {
    logger.warn(
      { err, tenantId, documentId, jobId },
      'n8n-Webhook fehlgeschlagen (best-effort, wird ignoriert)',
    );
  }
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

/**
 * Legt einen neuen Routing-Job für ein Dokument an und löst den n8n-Webhook
 * asynchron aus (best-effort).
 */
export async function createJobForDocument(
  pool: Pool,
  options: CreateJobForDocumentOptions,
): Promise<JobResponse> {
  const input: CreateJobInput = {
    document_id:  options.documentId,
    payload:      options.payload ?? {},
    max_attempts: options.maxAttempts ?? 3,
    run_at:       options.runAt,
  };

  const job = await createJob(pool, options.tenantId, input);

  logger.info(
    { jobId: job.id, tenantId: options.tenantId, documentId: options.documentId },
    'Routing-Job erstellt',
  );

  // n8n asynchron auslösen — kein await, kein throw
  void triggerDocumentWebhook(
    options.tenantId,
    options.documentId,
    job.id,
    options.payload ?? {},
  );

  return job;
}

/**
 * Nächsten fälligen Job reservieren und verarbeiten.
 *
 * Verarbeitung = n8n-Webhook auslösen und auf Antwort warten.
 * Erfolg → Status 'done' + result.
 * Fehler → failJob (inkrementiert attempts; 'dead' wenn max_attempts erreicht).
 *
 * @returns ProcessResult oder null, wenn kein Job bereit war.
 */
export async function processNextJob(pool: Pool): Promise<ProcessResult | null> {
  const job = await claimNextJob(pool);
  if (!job) return null;

  logger.info(
    { jobId: job.id, tenantId: job.tenant_id, attempt: job.attempts },
    'Routing-Job wird verarbeitet',
  );

  try {
    const n8nResult = await triggerWebhook('document-routing', {
      tenant_id:   job.tenant_id,
      document_id: job.document_id,
      job_id:      job.id,
      attempt:     job.attempts,
      ...job.payload,
    });

    const result: Record<string, unknown> = {
      n8n_response: n8nResult ?? null,
      processed_at: new Date().toISOString(),
    };

    const updated = await updateJobStatus(pool, job.tenant_id, job.id, 'done', result);
    logger.info({ jobId: job.id }, 'Routing-Job erfolgreich abgeschlossen');

    return { job: updated ?? job, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn({ jobId: job.id, err }, 'Routing-Job fehlgeschlagen');

    const updated = await failJob(pool, job.tenant_id, job.id, errorMessage);
    return { job: updated ?? job, success: false, error: errorMessage };
  }
}

/**
 * Einen bestimmten Job erneut in die Warteschlange stellen (Retry).
 * Setzt Status → 'queued', run_at → jetzt + delayMs.
 * Nur möglich wenn Status 'failed' oder 'dead'.
 */
export async function retryJob(
  pool: Pool,
  tenantId: string,
  jobId: string,
  delayMs = 0,
): Promise<JobResponse | null> {
  const job = await findJobById(pool, tenantId, jobId);
  if (!job) return null;
  if (job.status !== 'failed' && job.status !== 'dead') return null;

  const runAt = new Date(Date.now() + delayMs);
  return resetJobForRetry(pool, tenantId, jobId, runAt);
}
