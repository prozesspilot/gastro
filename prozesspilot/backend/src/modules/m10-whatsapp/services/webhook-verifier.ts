/**
 * M10 — WhatsApp-Webhook-Signaturprüfung
 *
 * Meta sendet jeden Webhook mit Header `X-Hub-Signature-256: sha256=<hex>`.
 * Die Signatur ist HMAC-SHA256(raw_body, WHATSAPP_APP_SECRET).
 *
 * Vergleich timing-safe via crypto.timingSafeEqual.
 *
 * Spec-Referenz:
 *   - M10 §7.1
 *   - Foundation_Spec.md §D3 (HMAC-Pattern)
 *   - https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_SIGNATURE' | 'MISSING_SECRET' | 'MALFORMED_SIGNATURE' };

/**
 * Verifiziert die `X-Hub-Signature-256`-Signatur von Meta.
 *
 * @param rawBody  exakt die Bytes, die Meta gesendet hat
 * @param header   Wert des Headers, z. B. "sha256=abcdef..."
 * @param secret   WHATSAPP_APP_SECRET aus den Meta-App-Settings
 */
export function verifyWhatsAppSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): VerifyResult {
  if (!secret) {
    return { ok: false, code: 'MISSING_SECRET' };
  }
  if (!header || typeof header !== 'string') {
    return { ok: false, code: 'INVALID_SIGNATURE' };
  }

  // Erwartetes Format: "sha256=<64-hex>"
  const match = /^sha256=([a-f0-9]{64})$/i.exec(header.trim());
  if (!match) {
    return { ok: false, code: 'MALFORMED_SIGNATURE' };
  }

  const provided = Buffer.from(match[1].toLowerCase(), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();

  // Längen-Check vor timingSafeEqual (sonst wirft die Funktion)
  if (provided.length !== expected.length) {
    return { ok: false, code: 'INVALID_SIGNATURE' };
  }

  return timingSafeEqual(provided, expected)
    ? { ok: true }
    : { ok: false, code: 'INVALID_SIGNATURE' };
}
