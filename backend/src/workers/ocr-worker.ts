/**
 * T007 — BullMQ-Worker für die OCR-Queue.
 *
 * Verantwortung:
 *   1. Job aus Queue „ocr" konsumieren.
 *   2. ocr.service.processBeleg() aufrufen.
 *   3. Bei Erfolg: Ergebnis zurückgeben (BullMQ speichert es ab).
 *   4. Bei Throw: BullMQ retried bis OCR_MAX_ATTEMPTS.
 *   5. Nach finalem Fail: markBelegOcrFailed + Discord-Alert.
 *
 * Lifecycle:
 *   * `startOcrWorker(deps)` — erzeugt + startet den Worker. Wird normalerweise
 *     aus app.ts/server.ts beim Boot aufgerufen.
 *   * `stopOcrWorker()`     — graceful shutdown (Tests + SIGTERM-Handler).
 *
 * Test-Strategie:
 *   * Unit-Test der `buildOcrJobProcessor()`-Factory mit Mock-ocr.service.
 *   * Integration läuft mit echtem Redis (vitest setup hat dev-Redis verfügbar).
 */

import { access } from 'node:fs/promises';
import type { Worker } from 'bullmq';
import type { Pool } from 'pg';

import type { S3Client } from '@aws-sdk/client-s3';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { OCR_QUEUE_NAME, type OcrJobData, type OcrJobResult } from '../core/queue/ocr-queue';
import { markBelegOcrFailed } from '../modules/m01-receipt-intake/services/beleg.repository';
import { processBeleg } from '../modules/m01-receipt-intake/services/ocr.service';

export interface OcrWorkerDeps {
  db: Pool;
  s3: S3Client;
}

let cachedWorker: Worker<OcrJobData, OcrJobResult> | null = null;

/**
 * Factory: liefert die Job-Processor-Funktion. Ausgelagert, damit Tests sie
 * direkt aufrufen können ohne Worker/Redis-Setup.
 */
export function buildOcrJobProcessor(deps: OcrWorkerDeps) {
  return async function processOcrJob(job: {
    id?: string;
    data: OcrJobData;
    attemptsMade: number;
  }): Promise<OcrJobResult> {
    const { tenantId, belegId, reason } = job.data;
    const attempt = job.attemptsMade + 1; // BullMQ zählt 0-basiert beim ersten Run

    logger.info(
      { jobId: job.id, belegId, tenantId, attempt, reason },
      '[ocr-worker] Processing job',
    );

    try {
      const result = await processBeleg(deps.db, tenantId, belegId, { s3: deps.s3 });
      return {
        status: result.status,
        overall_confidence: result.overall_confidence,
        reason: result.reason,
      };
    } catch (err) {
      // Recoverable: re-throw damit BullMQ retried. Beim letzten Versuch
      // übernimmt der 'failed'-Handler die finale Markierung.
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          belegId,
          attempt,
          max: config.OCR_MAX_ATTEMPTS,
        },
        '[ocr-worker] Job-Attempt fehlgeschlagen',
      );
      throw err;
    }
  };
}

/**
 * Discord-Alert beim finalen Fail. Best-effort — kein throw nach außen.
 */
async function sendDiscordAlert(belegId: string, errorMessage: string): Promise<void> {
  const url = config.DISCORD_OPS_WEBHOOK_URL;
  if (!url) return;
  // Finaler OCR-Fail braucht Eingriff (Beleg in Status 'error') — Alert ohne @everyone-Ping.
  const body = JSON.stringify({
    content: `🔴 OCR-Job für Beleg \`${belegId.slice(0, 8)}…\` ist nach ${config.OCR_MAX_ATTEMPTS} Versuchen final fehlgeschlagen.\nFehler: ${errorMessage.slice(0, 200)}`,
    allowed_mentions: { parse: [] },
  });
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), belegId },
      '[ocr-worker] Discord-Alert konnte nicht gesendet werden',
    );
  }
}

/**
 * Startet den BullMQ-Worker. Kann mehrfach aufgerufen werden — Singleton.
 */
export async function startOcrWorker(
  deps: OcrWorkerDeps,
): Promise<Worker<OcrJobData, OcrJobResult>> {
  if (cachedWorker) return cachedWorker;

  // T007 Review-Fix M3: Pre-Flight-Check für Vision-Key-File.
  // Ohne diesen Check würde der erste OCR-Job mit ENOENT crashen, 3× retry
  // → final fail nach ca. 4 Minuten — Steve/Andreas sehen erst dann den Bug.
  // Mit Pre-Check: Warn-Log beim Worker-Start, Operator kann reagieren bevor
  // Belege im Status 'extracting' hängen. Worker startet trotzdem (Tests/Dev
  // brauchen keine echten Credentials — OCR-Calls sind dort gemockt).
  if (config.GOOGLE_VISION_KEY_FILE) {
    try {
      await access(config.GOOGLE_VISION_KEY_FILE);
      logger.info(
        { keyFile: config.GOOGLE_VISION_KEY_FILE },
        '[ocr-worker] Vision-Key-File gefunden',
      );
    } catch {
      logger.warn(
        { keyFile: config.GOOGLE_VISION_KEY_FILE },
        '[ocr-worker] GOOGLE_VISION_KEY_FILE zeigt auf nicht-existente Datei — OCR-Jobs werden mit Error abgebrochen',
      );
    }
  }

  const bullmq = await import('bullmq');
  const processor = buildOcrJobProcessor(deps);
  const worker = new bullmq.Worker<OcrJobData, OcrJobResult>(OCR_QUEUE_NAME, processor, {
    connection: { url: config.REDIS_URL },
    concurrency: 2,
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attempts = job.attemptsMade;
    const max = job.opts.attempts ?? config.OCR_MAX_ATTEMPTS;
    if (attempts < max) {
      // Noch Retries übrig — kein finaler Fail
      return;
    }
    const errorMessage = err.message ?? 'unbekannter Fehler';
    logger.error(
      {
        belegId: job.data.belegId,
        tenantId: job.data.tenantId,
        attempts,
        max,
        err: errorMessage,
      },
      '[ocr-worker] Finaler Fail — markiere Beleg als error + Discord-Alert',
    );
    await markBelegOcrFailed(deps.db, job.data.tenantId, job.data.belegId, errorMessage, attempts);
    await sendDiscordAlert(job.data.belegId, errorMessage);
  });

  worker.on('completed', (job, result) => {
    logger.info(
      {
        belegId: job.data.belegId,
        status: result.status,
        confidence: result.overall_confidence,
      },
      '[ocr-worker] Job completed',
    );
  });

  worker.on('error', (err) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      '[ocr-worker] Worker-Error',
    );
  });

  cachedWorker = worker;
  return worker;
}

/**
 * Graceful shutdown. Wird vom SIGTERM-Handler in server.ts aufgerufen.
 */
export async function stopOcrWorker(): Promise<void> {
  if (cachedWorker) {
    await cachedWorker.close();
    cachedWorker = null;
  }
}
