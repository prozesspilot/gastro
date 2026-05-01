/**
 * Webhook-Queue mit Exponential Backoff.
 *
 * Schreibt Jobs in `webhook_queue`. Worker (`startWorker`) zieht alle paar
 * Sekunden den nächsten fälligen Job, ruft die URL per fetch() auf und
 * schreibt das Ergebnis zurück.
 *
 * Backoff: next_retry_at = now() + 2^attempts * 30s.
 */

import type { Pool } from 'pg';
import { logger } from '../logger';

const BASE_BACKOFF_MS = 30_000;

export interface WebhookJob {
  id:            string;
  tenant_id:     string;
  url:           string;
  payload:       Record<string, unknown>;
  attempts:      number;
  max_attempts:  number;
  next_retry_at: Date;
  last_error:    string | null;
  status:        'pending' | 'processing' | 'done' | 'failed';
}

interface WebhookRow {
  id:            string;
  tenant_id:     string;
  url:           string;
  payload:       Record<string, unknown>;
  attempts:      number;
  max_attempts:  number;
  next_retry_at: Date;
  last_error:    string | null;
  status:        string;
}

function rowToJob(r: WebhookRow): WebhookJob {
  return {
    ...r,
    status: r.status as WebhookJob['status'],
  };
}

/** Job in die Queue legen. */
export async function enqueue(
  db: Pool,
  tenantId: string,
  url: string,
  payload: Record<string, unknown>,
  maxAttempts = 5,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `
    INSERT INTO webhook_queue (tenant_id, url, payload, max_attempts)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
    [tenantId, url, JSON.stringify(payload), maxAttempts],
  );
  if (!rows[0]) {
    throw new Error('Failed to enqueue webhook job');
  }
  return rows[0].id;
}

export interface ProcessOptions {
  /** Im Test injizierbar. Default: globaler fetch. */
  fetcher?: typeof fetch;
  /** Im Test injizierbar. Default: Date.now */
  now?:     () => number;
}

/**
 * Verarbeitet den nächsten fälligen Job. Gibt true zurück, wenn ein Job
 * verarbeitet wurde, sonst false (queue leer / nichts fällig).
 */
export async function processNext(
  db: Pool,
  opts: ProcessOptions = {},
): Promise<boolean> {
  const fetcher = opts.fetcher ?? fetch;
  const now     = opts.now ?? (() => Date.now());

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Atomisch claimen — verhindert Doppelverarbeitung
    const { rows } = await client.query<WebhookRow>(
      `
      UPDATE webhook_queue
      SET status = 'processing', updated_at = now()
      WHERE id = (
        SELECT id FROM webhook_queue
        WHERE status = 'pending' AND next_retry_at <= now()
        ORDER BY next_retry_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, tenant_id, url, payload, attempts, max_attempts,
                next_retry_at, last_error, status
      `,
    );
    await client.query('COMMIT');

    const job = rows[0] ? rowToJob(rows[0]) : null;
    if (!job) return false;

    try {
      const res = await fetcher(job.url, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(job.payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await db.query(
        `UPDATE webhook_queue SET status = 'done', last_error = NULL WHERE id = $1`,
        [job.id],
      );
      return true;
    } catch (err) {
      const newAttempts = job.attempts + 1;
      const errMsg = (err as Error).message;
      if (newAttempts >= job.max_attempts) {
        await db.query(
          `UPDATE webhook_queue SET status = 'failed', attempts = $2, last_error = $3 WHERE id = $1`,
          [job.id, newAttempts, errMsg],
        );
      } else {
        const backoffMs = (2 ** newAttempts) * BASE_BACKOFF_MS;
        const nextAt = new Date(now() + backoffMs);
        await db.query(
          `
          UPDATE webhook_queue
          SET status = 'pending',
              attempts = $2,
              last_error = $3,
              next_retry_at = $4
          WHERE id = $1
          `,
          [job.id, newAttempts, errMsg, nextAt],
        );
      }
      logger.warn(
        { jobId: job.id, attempts: newAttempts, err: errMsg },
        'webhook.processNext: Versuch fehlgeschlagen',
      );
      return true;
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error({ err }, 'webhook.processNext: unerwarteter Fehler');
    return false;
  } finally {
    client.release();
  }
}

/**
 * Worker, der periodisch processNext aufruft. Gibt eine Stop-Funktion zurück.
 */
export function startWorker(
  db: Pool,
  intervalMs = 10_000,
  opts: ProcessOptions = {},
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      // So lange Jobs da sind, schnell abarbeiten — danach Pause
      let processed = true;
      while (processed && !stopped) {
        processed = await processNext(db, opts);
      }
    } catch (err) {
      logger.error({ err }, 'webhook worker tick fehlgeschlagen');
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  };

  // Erste Ausführung verzögert starten, damit der Caller noch aufräumen kann
  timer = setTimeout(tick, intervalMs);

  return (): void => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
