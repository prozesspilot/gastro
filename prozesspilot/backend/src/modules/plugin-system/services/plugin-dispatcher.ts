/**
 * Plugin-Dispatcher — sendet HTTP POST an registrierte Plugin-Webhooks.
 *
 * SSRF-Schutz: In Produktion werden private IP-Ranges blockiert.
 */

import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';

export interface PluginRegistryRow {
  plugin_id: string;
  tenant_id: string;
  name: string;
  version: string;
  webhook_url: string;
  webhook_secret: string;
  hook_events: string[];
  enabled: boolean;
}

export interface PluginExecutionResult {
  success: boolean;
  status?: number;
  duration_ms: number;
  error?: string;
}

/**
 * Prueft ob eine URL auf eine private IP-Range zeigt (SSRF-Schutz).
 * In Produktion werden diese URLs geblockt.
 */
function isPrivateUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    // Prüfung: 127.x, 10.x, 192.168.x, 172.16-31.x, ::1, localhost
    return (
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname) ||
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return true; // Ungueltige URL → geblockt
  }
}

/**
 * HMAC-SHA256-Signatur fuer Plugin-Webhook-Payload.
 */
function hmacSha256(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Sendet ein Plugin-Event an einen Webhook und speichert das Ergebnis in plugin_executions.
 */
export async function dispatchToPlugin(
  db: Pool,
  plugin: PluginRegistryRow,
  hookEvent: string,
  payload: unknown,
  receiptId?: string,
): Promise<PluginExecutionResult> {
  const start = Date.now();

  // SSRF-Schutz in Produktion
  if (process.env['NODE_ENV'] === 'production' && isPrivateUrl(plugin.webhook_url)) {
    const errMsg = `SSRF: Private URLs sind in Produktion nicht erlaubt: ${plugin.webhook_url}`;
    logger.warn({ plugin_id: plugin.plugin_id, webhook_url: plugin.webhook_url }, errMsg);

    await persistExecution(db, {
      plugin_id: plugin.plugin_id,
      hook_event: hookEvent,
      receipt_id: receiptId,
      payload,
      response_status: null,
      response_body: null,
      duration_ms: 0,
      success: false,
      error_message: errMsg,
    });

    return { success: false, duration_ms: 0, error: errMsg };
  }

  const body = JSON.stringify({
    event: hookEvent,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  const sig = hmacSha256(plugin.webhook_secret, body);

  try {
    const res = await fetch(plugin.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ProzessPilot-Signature': `sha256=${sig}`,
        'X-ProzessPilot-Event': hookEvent,
        'X-ProzessPilot-Plugin-Id': plugin.plugin_id,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const responseBody = await res.text().catch(() => '');
    const duration_ms = Date.now() - start;

    await persistExecution(db, {
      plugin_id: plugin.plugin_id,
      hook_event: hookEvent,
      receipt_id: receiptId,
      payload,
      response_status: res.status,
      response_body: responseBody.slice(0, 2000),
      duration_ms,
      success: res.ok,
      error_message: res.ok ? null : `HTTP ${res.status}: ${responseBody.slice(0, 500)}`,
    });

    logger.info(
      { plugin_id: plugin.plugin_id, hook_event: hookEvent, status: res.status, duration_ms },
      'Plugin-Webhook aufgerufen',
    );

    return { success: res.ok, status: res.status, duration_ms };
  } catch (err) {
    const duration_ms = Date.now() - start;
    const errMsg = (err as Error).message;

    await persistExecution(db, {
      plugin_id: plugin.plugin_id,
      hook_event: hookEvent,
      receipt_id: receiptId,
      payload,
      response_status: null,
      response_body: null,
      duration_ms,
      success: false,
      error_message: errMsg,
    }).catch(() => undefined);

    logger.warn(
      { plugin_id: plugin.plugin_id, hook_event: hookEvent, err },
      'Plugin-Webhook fehlgeschlagen',
    );

    return { success: false, duration_ms, error: errMsg };
  }
}

interface ExecutionRecord {
  plugin_id: string;
  hook_event: string;
  receipt_id?: string;
  payload: unknown;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number;
  success: boolean;
  error_message: string | null;
}

async function persistExecution(db: Pool, record: ExecutionRecord): Promise<void> {
  await db.query(
    `INSERT INTO plugin_executions
       (plugin_id, hook_event, receipt_id, payload, response_status, response_body,
        duration_ms, success, error_message)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
    [
      record.plugin_id,
      record.hook_event,
      record.receipt_id ?? null,
      JSON.stringify(record.payload),
      record.response_status,
      record.response_body,
      record.duration_ms,
      record.success,
      record.error_message,
    ],
  );
}
