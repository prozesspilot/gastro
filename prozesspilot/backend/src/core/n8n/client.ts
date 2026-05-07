/**
 * D7 — n8n-HTTP-Client
 *
 * Kapselt alle Aufrufe an die n8n-Instanz:
 *   - Webhook-Trigger  (POST /webhook/<path>)
 *   - n8n-REST-API     (GET/POST /api/v1/…)
 *
 * Authentifizierung: HTTP Basic Auth (N8N_BASIC_AUTH_USER / PASSWORD).
 *
 * Design: alle Methoden sind best-effort und werfen bei HTTP-Fehlern eine
 * N8nClientError, die der Aufrufer fangen und loggen kann.
 *
 * Öffentliche API:
 *   triggerWebhook(path, payload)
 *   getWorkflows()
 *   getWorkflow(id)
 */

import { config } from '../config';
import { logger } from '../logger';

// ── Fehler-Typ ────────────────────────────────────────────────────────────────

export class N8nClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'N8nClientError';
  }
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function basicAuthHeader(): string {
  const credentials = `${config.N8N_BASIC_AUTH_USER}:${config.N8N_BASIC_AUTH_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function n8nFetch(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = `${config.N8N_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: basicAuthHeader(),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }
    logger.warn({ url, status: res.status, body }, 'n8n-Anfrage fehlgeschlagen');
    throw new N8nClientError(`n8n ${res.status}: ${res.statusText}`, res.status, body);
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

/**
 * Löst einen n8n-Webhook aus (POST /webhook/<path>).
 *
 * @param webhookPath  Webhook-Pfad aus n8n, z. B. "document-received"
 * @param payload      Beliebige JSON-Nutzlast
 * @returns            Antwort von n8n (JSON) oder null
 */
export async function triggerWebhook(
  webhookPath: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  logger.debug({ webhookPath }, 'n8n-Webhook auslösen');
  return n8nFetch(`/webhook/${webhookPath}`, {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
}

/**
 * Löst die Receipt-Pipeline aus — ruft WF-INPUT-UPLOAD via Webhook auf.
 * Best-effort: wirft nie, loggt nur bei Fehler.
 *
 * @param payload  customer_id, receipt_id, tenant_id, storage_key etc.
 */
export async function triggerReceiptPipeline(
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    logger.info({ receiptId: payload.receipt_id }, 'n8n-Pipeline triggern: receipt-received');
    await triggerWebhook('receipt-received', payload);
  } catch (err) {
    logger.warn(
      { err, receiptId: payload.receipt_id },
      'n8n receipt-received Webhook fehlgeschlagen (best-effort, wird ignoriert)',
    );
  }
}

/**
 * Lädt alle Workflows aus der n8n-REST-API.
 */
export async function getWorkflows(): Promise<unknown[]> {
  const result = await n8nFetch('/api/v1/workflows') as { data: unknown[] };
  return result.data ?? [];
}

/**
 * Lädt einen einzelnen Workflow.
 */
export async function getWorkflow(id: string): Promise<unknown> {
  return n8nFetch(`/api/v1/workflows/${id}`);
}
