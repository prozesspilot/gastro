/**
 * T038 — Discord-Webhook-Helper fuer Cron-Top-Level-Crash-Alerts.
 *
 * Wird von den CLI-Entrypoints in `src/cron/*.ts` aufgerufen, BEVOR
 * `process.exit(non-zero)` ausgeloest wird. Sorgt dafuer, dass Crashes
 * auf dem Ops-Channel sichtbar sind statt nur im lokalen systemd-Log
 * zu versanden.
 *
 * Best-effort: schluckt eigene Fehler (Webhook-Down sollte den Cron nicht
 * zusaetzlich tot machen). Timeout 5 s gegen haengende Webhooks.
 *
 * Wenn `DISCORD_OPS_WEBHOOK_URL` leer ist (z.B. lokal/Test): no-op +
 * Hinweis-Log. Verhindert "silent stille" in Production — Operator weiss
 * dann zumindest aus dem Log, dass eine Discord-Nachricht "versucht
 * worden waere".
 */

import { hostname } from 'node:os';
import { config } from '../config';
import { logger } from '../logger';

const WEBHOOK_TIMEOUT_MS = 5000;
const MAX_ERROR_PREVIEW = 400;

export interface CronCrashAlert {
  /** Name des Cron-Scripts, z.B. 'sumup-daily.ts'. */
  scriptName: string;
  /** Geworfener Error oder beschreibender String. */
  error: unknown;
  /** Optionale Zusatzinfo (DB-Connection-String fragments, Tenant-Count, etc.). */
  context?: Record<string, unknown>;
}

/**
 * Erstellt die Webhook-Payload als Discord-Embed mit @everyone-Mention.
 * Exportiert fuer Tests + Snapshot-Vergleich.
 */
export function buildCronCrashPayload(alert: CronCrashAlert): {
  content: string;
  allowed_mentions: { parse: string[] };
} {
  const errMsg = alert.error instanceof Error ? alert.error.message : String(alert.error);
  const errPreview =
    errMsg.length > MAX_ERROR_PREVIEW ? `${errMsg.slice(0, MAX_ERROR_PREVIEW)}…` : errMsg;
  const ts = new Date().toISOString();
  const host = hostname();
  const contextLine = alert.context
    ? `\nContext: \`${JSON.stringify(alert.context).slice(0, 200)}\``
    : '';

  return {
    content: `@everyone 🔴 Cron-Crash: \`${alert.scriptName}\` auf \`${host}\`\nError: \`${errPreview}\`\nTime: \`${ts}\`${contextLine}`,
    allowed_mentions: { parse: ['everyone'] },
  };
}

/**
 * Sendet die Crash-Nachricht an Discord. Schluckt eigene Fehler.
 * Returns true wenn versucht wurde (auch wenn fetch failed), false wenn
 * Webhook-URL nicht konfiguriert ist.
 */
export async function notifyCronCrash(alert: CronCrashAlert): Promise<boolean> {
  const url = config.DISCORD_OPS_WEBHOOK_URL;
  if (!url) {
    logger.warn(
      { scriptName: alert.scriptName },
      '[notify-discord] DISCORD_OPS_WEBHOOK_URL leer — Crash bleibt nur im lokalen Log',
    );
    return false;
  }

  const payload = buildCronCrashPayload(alert);
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return true;
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        scriptName: alert.scriptName,
      },
      '[notify-discord] Webhook-Call fehlgeschlagen — Crash-Alert verloren',
    );
    return true;
  } finally {
    clearTimeout(tid);
  }
}
