/**
 * M10 — Meta Graph API Client
 *
 * Wrapper um die WhatsApp Cloud API (Meta Graph). Drei Operationen:
 *   - getMediaMeta(mediaId, accessToken)        → URL + Mime + sha256 + Größe
 *   - downloadMediaBytes(url, accessToken)      → Buffer
 *   - sendTemplateMessage(...)                  → message_id
 *
 * Retry-Verhalten:
 *   - 5xx → 3× mit Exponential Backoff (250ms / 1s / 4s)
 *   - 4xx → kein Retry, sofortiger Fehler
 *
 * Verwendet Node 20's natives `fetch` — keine zusätzliche Dependency.
 *
 * Spec-Referenz: M10 §7.3, §7.4, §8
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';

// ── Typen ──────────────────────────────────────────────────────────────────

export interface MediaMeta {
  url:        string;
  mime_type:  string;
  sha256:     string;
  file_size:  number;
}

export interface SendTemplateResult {
  message_id: string;
}

export interface MetaGraphClient {
  getMediaMeta(mediaId: string, accessToken: string): Promise<MediaMeta>;
  downloadMediaBytes(url: string, accessToken: string): Promise<Buffer>;
  sendTemplateMessage(
    phoneNumberId: string,
    to: string,
    templateName: string,
    accessToken: string,
    language?: string,
  ): Promise<SendTemplateResult>;
}

// ── Konfiguration ──────────────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.facebook.com';
const MAX_RETRIES = 3;
const BACKOFF_MS  = [250, 1000, 4000];

// ── Hilfsfunktion: fetch mit Retry für 5xx ─────────────────────────────────

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  what: string,
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(input, init);

      // Erfolg
      if (res.ok) return res;

      // 4xx — kein Retry
      if (res.status >= 400 && res.status < 500) {
        const body = await res.text().catch(() => '');
        logger.warn({ status: res.status, what, body: body.slice(0, 500) }, 'Meta Graph 4xx');
        throw new MetaGraphError(`Meta Graph ${what} fehlgeschlagen (${res.status})`, res.status, body);
      }

      // 5xx — retryen, sofern noch Versuche übrig
      if (attempt < MAX_RETRIES) {
        logger.warn({ status: res.status, attempt, what }, 'Meta Graph 5xx, retry');
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      const body = await res.text().catch(() => '');
      throw new MetaGraphError(`Meta Graph ${what} 5xx nach ${MAX_RETRIES + 1} Versuchen`, res.status, body);
    } catch (err) {
      // Netzwerkfehler — wie 5xx behandeln
      lastErr = err;
      if (err instanceof MetaGraphError) throw err; // 4xx-Pfad: nicht retryen

      if (attempt < MAX_RETRIES) {
        logger.warn({ err, attempt, what }, 'Meta Graph Netzwerkfehler, retry');
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      throw err;
    }
  }
  // Fallback (sollte nie erreicht werden)
  throw lastErr instanceof Error ? lastErr : new Error('Meta Graph: unbekannter Fehler');
}

export class MetaGraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

// ── Default-Implementierung ────────────────────────────────────────────────

export const defaultMetaGraphClient: MetaGraphClient = {
  /**
   * GET https://graph.facebook.com/v19.0/{media_id}
   * → { url, mime_type, sha256, file_size, id }
   */
  async getMediaMeta(mediaId, accessToken) {
    const url = `${GRAPH_BASE}/${config.WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`;
    const res = await fetchWithRetry(
      url,
      {
        method:  'GET',
        headers: { authorization: `Bearer ${accessToken}` },
      },
      'getMediaMeta',
    );

    const json = (await res.json()) as {
      url?:        string;
      mime_type?:  string;
      sha256?:     string;
      file_size?:  number;
    };

    if (!json.url || !json.mime_type) {
      throw new MetaGraphError(
        'Meta Graph getMediaMeta: url oder mime_type fehlt im Response',
        500,
        JSON.stringify(json),
      );
    }

    return {
      url:        json.url,
      mime_type:  json.mime_type,
      sha256:     json.sha256 ?? '',
      file_size:  Number(json.file_size ?? 0),
    };
  },

  /**
   * GET <url>  (Bearer-Auth, gibt Bytes zurück)
   */
  async downloadMediaBytes(url, accessToken) {
    const res = await fetchWithRetry(
      url,
      {
        method:  'GET',
        headers: { authorization: `Bearer ${accessToken}` },
      },
      'downloadMediaBytes',
    );
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  },

  /**
   * POST https://graph.facebook.com/{ver}/{phone_number_id}/messages
   * Body: { messaging_product:'whatsapp', to, type:'template', template:{name, language:{code}} }
   */
  async sendTemplateMessage(phoneNumberId, to, templateName, accessToken, language = 'de') {
    const url = `${GRAPH_BASE}/${config.WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'template',
      template: {
        name:     templateName,
        language: { code: language },
      },
    };

    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          authorization:  `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      'sendTemplateMessage',
    );

    const json = (await res.json()) as { messages?: Array<{ id: string }> };
    const messageId = json.messages?.[0]?.id;
    if (!messageId) {
      throw new MetaGraphError(
        'sendTemplateMessage: keine message_id im Response',
        500,
        JSON.stringify(json),
      );
    }
    return { message_id: messageId };
  },
};
