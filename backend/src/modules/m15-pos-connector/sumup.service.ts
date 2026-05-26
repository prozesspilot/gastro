/**
 * M15 — SumUp API-Adapter
 *
 * Kapselt alle HTTP-Aufrufe zur SumUp REST-API:
 *   - OAuth 2.0 Authorization Code Flow (exchangeCodeForTokens)
 *   - Token-Refresh (refreshAccessToken)
 *   - User-Info-Abruf (fetchSumUpUserInfo)
 *   - OAuth-URL-Builder (buildSumUpAuthUrl)
 *
 * Nutzt native fetch (Node 20 built-in), kein extra HTTP-Client.
 * Timeout: 10 Sekunden pro Request via AbortController.
 * Wirft SumUpApiError bei Non-2xx Responses.
 *
 * Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md §4
 * SumUp API-Docs: https://developer.sumup.com/api
 */

import { config } from '../../core/config';
import { logger } from '../../core/logger';

// ── Konstanten ─────────────────────────────────────────────────────────────

/** Erforderliche OAuth-Scopes für M15. */
export const SUMUP_REQUIRED_SCOPES = [
  'transactions.history.read',
  'user.profile_readonly',
] as const;

/** HTTP-Request-Timeout: 10 Sekunden. */
const REQUEST_TIMEOUT_MS = 10_000;

// ── Fehler-Klasse ──────────────────────────────────────────────────────────

/**
 * Wird geworfen bei Non-2xx Antworten der SumUp API.
 * statusCode: HTTP-Status-Code
 * body: Response-Body als String (nicht geparst — kann HTML/JSON sein)
 */
export class SumUpApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`SumUp API error ${statusCode}: ${body.slice(0, 200)}`);
    this.name = 'SumUpApiError';
  }
}

// ── Response-Types ──────────────────────────────────────────────────────────

export interface SumUpTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Gültigkeitsdauer in Sekunden (SumUp: typisch 3600 oder ~60 Tage) */
  expires_in: number;
  token_type: 'Bearer';
  /** Space-separierte Scopes-Liste */
  scope: string;
}

export interface SumUpUserInfo {
  merchant_profile: {
    /** Eindeutige SumUp-Händler-ID — wird als pos_account_id in DB gespeichert */
    merchant_code: string;
    company_name: string;
  };
}

// ── T005: Transaction-History-Types ─────────────────────────────────────────

/**
 * Subset des SumUp-Transaction-History-Items, das wir tatsaechlich auswerten.
 * SumUp liefert mehr Felder — wir ignorieren sie (raw_data archiviert alles).
 *
 * SumUp-API-Doku: https://developer.sumup.com/api/transactions/historic-transaction
 */
export interface SumUpTransaction {
  /** Transaktions-ID (UUID). Wird zur Idempotenz im business-day-Aggregat genutzt. */
  id: string;
  /** Bei manchen API-Antworten 'transaction_code' statt id. */
  transaction_code?: string;
  /** ISO-8601 Timestamp wann die Transaktion stattfand. */
  timestamp: string;
  /** Brutto-Betrag in EUR (Float, positiv = Einnahme, negativ = Refund). */
  amount: number;
  /** Waehrung — wir erwarten 'EUR'. */
  currency: string;
  /** Status — wir zaehlen NUR 'SUCCESSFUL' fuer Aggregation, REFUND wird separat behandelt. */
  status: 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'PENDING' | 'REFUNDED' | string;
  /** Zahlungsart — 'CARD', 'CASH', 'MOBILE_PAYMENT', ... */
  payment_type?: string;
  /** 'PAYMENT', 'REFUND', 'CHARGE_BACK', ... */
  type?: string;
  /** MwSt-Satz (falls vom Wirt in der Kasse konfiguriert) — 0.07, 0.19, 0.0 */
  vat_rate?: number;
  /** Bei manchen Transaktionen pro Position aufgeschluesselt. */
  products?: Array<{ name?: string; price?: number; vat_rate?: number; quantity?: number }>;
}

export interface SumUpTransactionHistoryResponse {
  items: SumUpTransaction[];
  /** Cursor fuer die naechste Page (falls vorhanden). */
  next_cursor?: string;
  /** Total count laut SumUp (best-effort). */
  total_count?: number;
}

// ── Hilfsfunktion ──────────────────────────────────────────────────────────

/**
 * Führt einen HTTP-Request mit 10s Timeout durch.
 * Wirft SumUpApiError bei Non-2xx.
 * Gibt geparste JSON-Antwort zurück.
 */
async function fetchWithTimeout<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SumUpApiError(0, `Request timeout nach ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '(body nicht lesbar)');
    throw new SumUpApiError(response.status, body);
  }

  return response.json() as Promise<T>;
}

// ── Öffentliche API ────────────────────────────────────────────────────────

/**
 * Tauscht einen Authorization-Code gegen Access- und Refresh-Token.
 * Entspricht Schritt 5b der OAuth-Flow-Beschreibung in M15-Spec §4.2.
 *
 * POST ${SUMUP_API_BASE_URL}/token
 * grant_type=authorization_code
 */
export async function exchangeCodeForTokens(code: string): Promise<SumUpTokenResponse> {
  const url = `${config.SUMUP_API_BASE_URL}/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.SUMUP_CLIENT_ID,
    client_secret: config.SUMUP_CLIENT_SECRET,
    redirect_uri: config.SUMUP_REDIRECT_URI,
    code,
  });

  return fetchWithTimeout<SumUpTokenResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * Erneuert einen abgelaufenen Access-Token via Refresh-Token.
 * Entspricht M15-Spec §4.5.
 *
 * POST ${SUMUP_API_BASE_URL}/token
 * grant_type=refresh_token
 */
export async function refreshAccessToken(refreshToken: string): Promise<SumUpTokenResponse> {
  const url = `${config.SUMUP_API_BASE_URL}/token`;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.SUMUP_CLIENT_ID,
    client_secret: config.SUMUP_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  return fetchWithTimeout<SumUpTokenResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * Ruft User-Info vom SumUp-Account ab.
 * merchant_profile.merchant_code = pos_account_id in DB.
 * Entspricht Schritt 5c in M15-Spec §4.2.
 *
 * GET ${SUMUP_API_BASE_URL}/v0.1/me
 */
export async function fetchSumUpUserInfo(accessToken: string): Promise<SumUpUserInfo> {
  const url = `${config.SUMUP_API_BASE_URL}/v0.1/me`;

  return fetchWithTimeout<SumUpUserInfo>(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
}

/**
 * Baut die SumUp OAuth-Authorization-URL für den initialen Redirect.
 * Entspricht Schritt 2b in M15-Spec §4.2.
 *
 * URL-Form:
 *   https://api.sumup.com/authorize?
 *     response_type=code&
 *     client_id=<CLIENT_ID>&
 *     redirect_uri=<URI>&
 *     scope=<SCOPES>&
 *     state=<CSRF-STATE>
 */
export function buildSumUpAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.SUMUP_CLIENT_ID,
    redirect_uri: config.SUMUP_REDIRECT_URI,
    scope: SUMUP_REQUIRED_SCOPES.join(' '),
    state,
  });

  return `${config.SUMUP_API_BASE_URL}/authorize?${params.toString()}`;
}

/**
 * T005: Pullt alle Transaktionen eines Zeitfensters via SumUp Transaction-History-API.
 *
 * Behandelt Pagination via next_cursor — laedt alle Pages bis kein Cursor mehr
 * zurueck kommt oder bis maxPages erreicht ist (Schutz gegen Infinite-Loop).
 *
 * GET ${SUMUP_API_BASE_URL}/v0.1/me/transactions/history?from=...&to=...&limit=...
 *
 * @param accessToken  Bearer-Token aus kasse_integrations (decrypted)
 * @param fromIso      Start des Zeitfensters (ISO-8601, z.B. "2026-05-18T00:00:00Z")
 * @param toIso        Ende des Zeitfensters (ISO-8601, exclusive)
 * @param maxPages     Schutz vor unendlichem Pagination-Loop (default 50, ~5000 Tx)
 */
export async function fetchTransactionHistory(
  accessToken: string,
  fromIso: string,
  toIso: string,
  maxPages = 50,
): Promise<SumUpTransaction[]> {
  const out: SumUpTransaction[] = [];
  let cursor: string | undefined;
  let page = 0;
  let cursorPending = false;

  while (page < maxPages) {
    const params = new URLSearchParams({
      from: fromIso,
      to: toIso,
      limit: '100',
    });
    if (cursor) params.set('next_cursor', cursor);

    const url = `${config.SUMUP_API_BASE_URL}/v0.1/me/transactions/history?${params.toString()}`;
    const response = await fetchWithTimeout<SumUpTransactionHistoryResponse>(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (Array.isArray(response.items)) out.push(...response.items);
    if (!response.next_cursor) {
      cursorPending = false;
      break;
    }
    cursor = response.next_cursor;
    cursorPending = true;
    page++;
  }

  // T005-Review-Fix: Wenn wir wegen maxPages aufhoeren obwohl noch ein Cursor
  // offen ist, waere der Z-Bon stillschweigend unvollstaendig → Steuerdaten
  // falsch. Daher laut warnen, statt still abzuschneiden.
  if (cursorPending && page >= maxPages) {
    logger.warn(
      { fromIso, toIso, maxPages, fetched: out.length },
      '[sumup] Transaktions-History bei maxPages abgeschnitten — Z-Bon evtl. unvollstaendig',
    );
  }

  return out;
}
