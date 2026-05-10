/**
 * D3 — HMAC-SHA256-Authentifizierung
 *
 * Jede Anfrage an /api/v1/* muss folgende Header tragen:
 *
 *   x-pp-timestamp   Unix-Sekunden (UTC), z. B. "1717000000"
 *   x-pp-signature   HMAC-SHA256 des kanonischen Strings (hex)
 *
 * Kanonischer String (newline-getrennt):
 *   {METHOD}\n{PATH_WITH_QUERY}\n{TIMESTAMP}\n{SHA256_OF_BODY_HEX}
 *
 * Beispiel:
 *   POST\n/api/v1/customers\n1717000000\ne3b0c44298fc1c...
 *
 * Der Body-Hash ist SHA-256 des rohen Request-Bodys (leerer Body = Hash von "").
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// ── Typen ──────────────────────────────────────────────────────────────────

export type HmacVerifyOk = { ok: true };
export type HmacVerifyError = { ok: false; code: HmacErrorCode; message: string };
export type HmacVerifyResult = HmacVerifyOk | HmacVerifyError;

export type HmacErrorCode =
  | 'MISSING_TIMESTAMP'
  | 'MISSING_SIGNATURE'
  | 'INVALID_TIMESTAMP'
  | 'TIMESTAMP_SKEW'
  | 'INVALID_SIGNATURE';

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

/** SHA-256 eines Buffers oder Strings als Hex-String. */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Baut den kanonischen String, der signiert wird.
 *
 * @param method    HTTP-Methode in Großbuchstaben, z. B. "POST"
 * @param path      Vollständiger Pfad inkl. Query, z. B. "/api/v1/customers?page=1"
 * @param timestamp Unix-Sekunden als String, z. B. "1717000000"
 * @param bodyHash  SHA-256-Hex des rohen Request-Bodys
 */
export function buildCanonicalString(
  method: string,
  path: string,
  timestamp: string,
  bodyHash: string,
): string {
  return [method.toUpperCase(), path, timestamp, bodyHash].join('\n');
}

/**
 * Berechnet die HMAC-SHA256-Signatur des kanonischen Strings.
 *
 * @param secret    PP_HMAC_SECRET (32-Byte-Hex-String)
 * @param canonical Ergebnis von buildCanonicalString()
 */
export function computeSignature(secret: string, canonical: string): string {
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

/**
 * Vergleicht zwei Hex-Strings timing-sicher (verhindert Timing-Angriffe).
 * Gibt false zurück, wenn die Längen unterschiedlich sind.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// ── Haupt-Verifikationsfunktion ────────────────────────────────────────────

export interface HmacVerifyOptions {
  /** PP_HMAC_SECRET — muss 32-Byte-Hex sein */
  secret: string;
  /** Erlaubte Zeitdifferenz in Sekunden (PP_HMAC_TIMESTAMP_SKEW, Standard: 300) */
  maxSkewSeconds: number;
  /** HTTP-Methode (req.method) */
  method: string;
  /** Vollständiger URL-Pfad inkl. Query (req.url) */
  url: string;
  /** Wert des Headers x-pp-timestamp */
  timestamp: string | undefined;
  /** Wert des Headers x-pp-signature */
  signature: string | undefined;
  /** Roher Request-Body als Buffer (kann leer sein) */
  rawBody: Buffer;
  /** Aktueller Unix-Timestamp in Sekunden (injizierbar für Tests) */
  nowSeconds?: number;
}

/**
 * Vollständige HMAC-Verifikation einer eingehenden Anfrage.
 *
 * Gibt { ok: true } zurück wenn alles stimmt, sonst { ok: false, code, message }.
 */
export function verifyHmac(opts: HmacVerifyOptions): HmacVerifyResult {
  const {
    secret,
    maxSkewSeconds,
    method,
    url,
    timestamp,
    signature,
    rawBody,
    nowSeconds = Math.floor(Date.now() / 1000),
  } = opts;

  // 1. Header vorhanden?
  if (!timestamp) {
    return { ok: false, code: 'MISSING_TIMESTAMP', message: 'Header x-pp-timestamp fehlt.' };
  }
  if (!signature) {
    return { ok: false, code: 'MISSING_SIGNATURE', message: 'Header x-pp-signature fehlt.' };
  }

  // 2. Timestamp ist eine gültige ganze Zahl?
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || ts <= 0) {
    return {
      ok: false,
      code: 'INVALID_TIMESTAMP',
      message: 'x-pp-timestamp muss ein Unix-Timestamp (Sekunden) sein.',
    };
  }

  // 3. Timestamp liegt im erlaubten Fenster?
  const skew = Math.abs(nowSeconds - ts);
  if (skew > maxSkewSeconds) {
    return {
      ok: false,
      code: 'TIMESTAMP_SKEW',
      message: `Timestamp außerhalb des erlaubten Fensters (Skew: ${skew}s, erlaubt: ${maxSkewSeconds}s).`,
    };
  }

  // 4. Signatur berechnen und vergleichen
  const bodyHash = sha256Hex(rawBody);
  const canonical = buildCanonicalString(method, url, timestamp, bodyHash);
  const expected = computeSignature(secret, canonical);

  if (!safeCompare(expected, signature)) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'Signatur ungültig.' };
  }

  return { ok: true };
}
