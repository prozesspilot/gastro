/**
 * sevDesk REST Client (M06).
 *
 * Auth: API-Token im Header "Authorization: <token>" (KEIN Bearer-Prefix!).
 * Basis-URL: SEVDESK_API_BASE (default: https://my.sevdesk.de/api/v1)
 * Timeout: SEVDESK_DEFAULT_TIMEOUT_MS (default: 15000ms)
 * Rate-Limit: 250 req/min Token-Bucket (in-memory)
 * Retry: 3× exponential bei 5xx/429
 */

import { logger } from '../../../logger';
import type {
  SevDeskAccountingType,
  SevDeskSaveVoucherResponse,
  SevDeskTaxRule,
  SevDeskTempFile,
  SevDeskVoucherFactory,
} from './types';

// ── Error-Klassen ─────────────────────────────────────────────────────────────

export class SevDeskApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'SevDeskApiError';
  }
}

// ── Token-Bucket Rate-Limiter (in-memory, 250/min) ────────────────────────────

const RATE_LIMIT_PER_MINUTE = 250;
const RATE_LIMIT_INTERVAL_MS = 60_000;

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

const rateBuckets = new Map<string, TokenBucket>();

function acquireRateToken(clientId: string): void {
  const now = Date.now();
  let bucket = rateBuckets.get(clientId);

  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_PER_MINUTE, lastRefillAt: now };
    rateBuckets.set(clientId, bucket);
  }

  // Auffüllen seit letztem Refill
  const elapsed = now - bucket.lastRefillAt;
  if (elapsed >= RATE_LIMIT_INTERVAL_MS) {
    bucket.tokens = RATE_LIMIT_PER_MINUTE;
    bucket.lastRefillAt = now;
  } else if (elapsed > 0) {
    const refill = Math.floor((elapsed / RATE_LIMIT_INTERVAL_MS) * RATE_LIMIT_PER_MINUTE);
    bucket.tokens = Math.min(RATE_LIMIT_PER_MINUTE, bucket.tokens + refill);
    bucket.lastRefillAt = now;
  }

  if (bucket.tokens <= 0) {
    // Rate-Limit überschritten — wir warnen, blockieren aber nicht async
    logger.warn({ clientId }, 'sevDesk Rate-Limit annähernd überschritten');
  }

  bucket.tokens -= 1;
}

// ── Client ────────────────────────────────────────────────────────────────────

export interface SevDeskClientOpts {
  apiToken: string;
  customerId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SevDeskClient {
  private readonly apiToken: string;
  private readonly customerId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: SevDeskClientOpts) {
    this.apiToken = opts.apiToken;
    this.customerId = opts.customerId;
    this.baseUrl = opts.baseUrl ?? process.env.SEVDESK_API_BASE ?? 'https://my.sevdesk.de/api/v1';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.SEVDESK_DEFAULT_TIMEOUT_MS ?? '15000');
  }

  // ── Public Methods ─────────────────────────────────────────────────────────

  async saveVoucher(payload: SevDeskVoucherFactory): Promise<SevDeskSaveVoucherResponse> {
    return this.requestJson<SevDeskSaveVoucherResponse>(
      'POST',
      '/Voucher/Factory/saveVoucher',
      payload,
    );
  }

  async uploadTempFile(fileBytes: Buffer, fileName: string): Promise<SevDeskTempFile> {
    const url = `${this.baseUrl}/Voucher/Factory/uploadTempFile`;
    const formData = new FormData();
    const blob = new Blob([fileBytes as unknown as ArrayBuffer], {
      type: 'application/pdf',
    });
    formData.append('file', blob, fileName);

    const res = await this.requestWithRetry('POST', url, formData);
    return res as SevDeskTempFile;
  }

  async attachFileToVoucher(voucherId: number, filename: string): Promise<void> {
    await this.requestJson('PUT', `/Voucher/${voucherId}/attachDocument`, {
      filename,
    });
  }

  async getAccountingTypes(): Promise<SevDeskAccountingType[]> {
    const res = await this.requestJson<
      { objects: SevDeskAccountingType[] } | SevDeskAccountingType[]
    >('GET', '/AccountingType');
    if (Array.isArray(res)) return res;
    return (res as { objects: SevDeskAccountingType[] }).objects ?? [];
  }

  async getTaxRules(): Promise<SevDeskTaxRule[]> {
    const res = await this.requestJson<{ objects: SevDeskTaxRule[] } | SevDeskTaxRule[]>(
      'GET',
      '/TaxRule',
    );
    if (Array.isArray(res)) return res;
    return (res as { objects: SevDeskTaxRule[] }).objects ?? [];
  }

  async testConnection(): Promise<{ ok: boolean; organizationName?: string }> {
    try {
      const res = await this.requestJson<{ objects?: { organizationName?: string } }>(
        'GET',
        '/SevUser',
      );
      const orgName = (res as { objects?: Array<{ organizationName?: string }> })?.objects?.[0]
        ?.organizationName;
      return { ok: true, organizationName: orgName };
    } catch (err) {
      logger.warn({ err }, 'sevDesk connection test fehlgeschlagen');
      return { ok: false };
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    return this.requestWithRetry(method, url, body) as Promise<T>;
  }

  private async requestWithRetry(method: string, url: string, body?: unknown): Promise<unknown> {
    const RETRY_DELAYS_MS = [500, 2000, 8000];
    let attempt = 0;
    let lastErr: unknown = null;

    while (attempt <= RETRY_DELAYS_MS.length) {
      acquireRateToken(this.customerId);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let res: Response;
      try {
        const init = this.buildRequestInit(method, body, controller.signal);
        res = await this.fetchImpl(url, init);
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (attempt >= RETRY_DELAYS_MS.length) break;
        await sleep(RETRY_DELAYS_MS[attempt]);
        attempt += 1;
        continue;
      }
      clearTimeout(timer);

      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        const waitMs = retryAfter ?? RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        if (attempt >= RETRY_DELAYS_MS.length) {
          const txt = await res.text().catch(() => '');
          throw new SevDeskApiError(429, `sevDesk 429 Rate-Limit — ${txt}`);
        }
        await sleep(waitMs);
        attempt += 1;
        continue;
      }

      if (res.status >= 500) {
        if (attempt >= RETRY_DELAYS_MS.length) {
          const txt = await res.text().catch(() => '');
          throw new SevDeskApiError(res.status, `sevDesk 5xx — ${txt}`);
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
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
        throw new SevDeskApiError(res.status, `sevDesk ${res.status}`, parsed);
      }

      // 2xx
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        return res.json();
      }
      const txt = await res.text().catch(() => '');
      return txt ? JSON.parse(txt) : {};
    }

    throw lastErr ?? new SevDeskApiError(0, 'sevDesk request failed after retries');
  }

  private buildRequestInit(method: string, body: unknown, signal: AbortSignal): RequestInit {
    if (body instanceof FormData) {
      return {
        method,
        headers: this.headers(),
        body,
        signal,
      };
    }
    if (body !== undefined) {
      return {
        method,
        headers: this.headers('application/json'),
        body: JSON.stringify(body),
        signal,
      };
    }
    return { method, headers: this.headers(), signal };
  }

  private headers(contentType?: string): Record<string, string> {
    // sevDesk: Authorization ist KEIN Bearer-Token — roh-Token ohne Prefix!
    const h: Record<string, string> = {
      Authorization: this.apiToken,
      Accept: 'application/json',
    };
    if (contentType) h['Content-Type'] = contentType;
    return h;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) resolve();
    else setTimeout(resolve, ms);
  });
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return Math.max(0, n * 1000);
  const t = Date.parse(value);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return null;
}
