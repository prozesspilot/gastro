/**
 * M05 — Lexoffice REST Client.
 *
 * Implementiert exakt die in M05-Spec §6/§9 benötigten Endpunkte:
 *   - createVoucher   (POST /v1/vouchers)
 *   - uploadVoucherFile (POST /v1/vouchers/{id}/files, multipart/form-data)
 *   - listCategories  (GET /v1/categories)
 *   - findContactByVatId (GET /v1/contacts?vatRegistrationId=...)
 *   - createContact   (POST /v1/contacts)
 *
 * Auth: Bearer-Header (API-Key, kind='lexoffice_api_key').
 * Rate-Limit: max 2 Req/s pro Customer (Token-Bucket in Redis).
 * Retry: 3× exponential bei 5xx + 429 (Retry-After Header berücksichtigt).
 */

import type Redis from 'ioredis';
import type { Pool } from 'pg';

import { logger } from '../../../logger';
import type {
  LexofficeCategory,
  LexofficeCreateResponse,
  LexofficeUuid,
  LexofficeVoucher,
} from './lexoffice.types';
import { acquireToken } from './rate-limiter';

export interface LexofficeClientOpts {
  apiKey: string;
  customerId: string;
  baseUrl?: string;
  redis?: Redis | null;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
  /**
   * Anzahl der Retries bei 5xx/429/Netzwerkfehler. Default 3 (Export-Pfad, robust).
   * Für UI-synchrone Aufrufe (z. B. der Wizard-Live-Check) auf 0 setzen → fail-fast
   * statt bis zu ~70 s Wartezeit durch Backoff-Sleeps.
   */
  maxRetries?: number;
}

const RETRY_DELAYS_MS = [500, 2000, 8000];

export class LexofficeApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'LexofficeApiError';
  }
}

export class LexofficeClient {
  private readonly apiKey: string;
  private readonly customerId: string;
  private readonly baseUrl: string;
  private readonly redis: Redis | null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: LexofficeClientOpts) {
    this.apiKey = opts.apiKey;
    this.customerId = opts.customerId;
    this.baseUrl = opts.baseUrl ?? process.env.LEXOFFICE_API_BASE ?? 'https://api.lexoffice.io';
    this.redis = opts.redis ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs =
      opts.defaultTimeoutMs ?? Number(process.env.LEXOFFICE_DEFAULT_TIMEOUT_MS ?? '15000');
    this.maxRetries = opts.maxRetries ?? RETRY_DELAYS_MS.length;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Legt einen Voucher an. `idempotencyKey` (optional) wird als
   * `Idempotency-Key`-Header gesendet — Lexoffice dedupliziert serverseitig,
   * sodass Retries (interner Client-Retry bei 5xx UND der aeussere Exporter-
   * Retry) keinen doppelten Buchungsbeleg erzeugen. Schluessel muss pro Beleg
   * stabil sein (z.B. SHA256(tenant:beleg:target)).
   */
  async createVoucher(
    voucher: LexofficeVoucher,
    idempotencyKey?: string,
  ): Promise<LexofficeCreateResponse> {
    const extraHeaders = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined;
    return this.requestJson<LexofficeCreateResponse>('POST', '/v1/vouchers', voucher, extraHeaders);
  }

  async uploadVoucherFile(
    voucherId: LexofficeUuid,
    fileBytes: Buffer,
    filename: string,
    contentType = 'application/pdf',
  ): Promise<void> {
    const url = `${this.baseUrl}/v1/vouchers/${voucherId}/files`;
    const formData = new FormData();
    const blob = new Blob([fileBytes as unknown as ArrayBuffer], { type: contentType });
    formData.append('file', blob, filename);
    formData.append('type', 'voucher');

    await this.requestRaw('POST', url, formData);
  }

  /**
   * GET /v1/profile — leichter Authentifizierungs-Check. Ein gültiger API-Key
   * liefert das Firmenprofil; ein ungültiger Key wirft LexofficeApiError(401).
   * Genutzt für den Live-Token-Check im Onboarding-Wizard (T084).
   */
  async getProfile(): Promise<{ companyName?: string; organizationId?: string }> {
    return this.requestJson<{ companyName?: string; organizationId?: string }>(
      'GET',
      '/v1/profile',
    );
  }

  async listCategories(): Promise<LexofficeCategory[]> {
    const res = await this.requestJson<{ content?: LexofficeCategory[] } | LexofficeCategory[]>(
      'GET',
      '/v1/posting-categories',
    );
    if (Array.isArray(res)) return res;
    return res.content ?? [];
  }

  async findContactByVatId(vatId: string): Promise<{ id: LexofficeUuid } | null> {
    const url = `/v1/contacts?vatRegistrationId=${encodeURIComponent(vatId)}`;
    const res = await this.requestJson<{ content?: Array<{ id: LexofficeUuid }> }>('GET', url);
    const first = res.content?.[0];
    return first ? { id: first.id } : null;
  }

  async createContact(data: { name: string; vatId?: string }): Promise<{ id: LexofficeUuid }> {
    const body = {
      version: 0,
      roles: { vendor: {} },
      company: {
        name: data.name,
        ...(data.vatId ? { vatRegistrationId: data.vatId } : {}),
      },
    };
    const res = await this.requestJson<{ id: LexofficeUuid }>('POST', '/v1/contacts', body);
    return { id: res.id };
  }

  // ── Internal: Request mit Retry + Rate-Limit ─────────────────────────

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: { ...this.headers('application/json'), ...extraHeaders },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    return this.requestRaw(method, url, body, init);
  }

  private async requestRaw<T = unknown>(
    method: string,
    url: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    let _initFinal: RequestInit;
    if (init) {
      _initFinal = init;
    } else if (body instanceof FormData) {
      _initFinal = {
        method,
        headers: this.headers(),
        body,
      };
    } else if (body !== undefined) {
      _initFinal = {
        method,
        headers: this.headers('application/json'),
        body: JSON.stringify(body),
      };
    } else {
      _initFinal = { method, headers: this.headers() };
    }

    const delayFor = (n: number): number =>
      RETRY_DELAYS_MS[Math.min(n, RETRY_DELAYS_MS.length - 1)];
    let attempt = 0;
    let lastErr: unknown = null;

    while (attempt <= this.maxRetries) {
      await acquireToken(this.redis, this.customerId);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { ..._initFinal, signal: controller.signal });
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (attempt >= this.maxRetries) break;
        await sleep(delayFor(attempt));
        attempt += 1;
        continue;
      }
      clearTimeout(timer);

      if (res.status === 429) {
        const wait = parseRetryAfter(res.headers.get('retry-after')) ?? delayFor(attempt);
        if (attempt >= this.maxRetries) {
          const txt = await res.text().catch(() => '');
          throw new LexofficeApiError(429, `Lexoffice 429 (Rate-Limit) — ${txt}`);
        }
        await sleep(wait);
        attempt += 1;
        continue;
      }

      if (res.status >= 500) {
        if (attempt >= this.maxRetries) {
          const txt = await res.text().catch(() => '');
          throw new LexofficeApiError(res.status, `Lexoffice 5xx — ${txt}`);
        }
        await sleep(delayFor(attempt));
        attempt += 1;
        continue;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        let parsed: unknown;
        try {
          parsed = JSON.parse(txt);
        } catch {
          parsed = txt;
        }
        throw new LexofficeApiError(res.status, `Lexoffice ${res.status}`, parsed);
      }

      // 2xx
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        return (await res.json()) as T;
      }
      // Bei file-uploads kommt manchmal 201 ohne Body
      const txt = await res.text().catch(() => '');
      return (txt ? JSON.parse(txt) : ({} as T)) as T;
    }
    throw lastErr ?? new LexofficeApiError(0, 'Lexoffice request failed after retries');
  }

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: 'application/json',
    };
    if (contentType) h['content-type'] = contentType;
    return h;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return Math.max(0, n * 1000);
  // HTTP-Datum?
  const t = Date.parse(value);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) resolve();
    else setTimeout(resolve, ms);
  });
}

// Loosely log unused for tests
void logger;
