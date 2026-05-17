/**
 * M10 — Object-Key-Konstruktion
 *
 * Aus M10 §8.1 Schritt 7:
 *   s3://{bucket}/{customer_id}/originals/{yyyy}/{mm}/{ulid}.{ext}
 *
 * - ULID-ähnlicher Bezeichner (Crockford Base32, 26 Zeichen, monoton).
 * - Mime → Dateiendung-Mapping mit Fallback "bin".
 *
 * Wir generieren ULIDs ohne externe Abhängigkeit; Crockford-Alphabet:
 *   0123456789ABCDEFGHJKMNPQRSTVWXYZ
 */

import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Erzeugt einen ULID (Crockford Base32).
 *  - 48 Bit Timestamp (ms seit Epoch) → 10 Zeichen
 *  - 80 Bit Zufall                    → 16 Zeichen
 */
export function ulid(now = Date.now()): string {
  // Timestamp 10 Zeichen
  let ts = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = ALPHABET[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  // 80 Bit (10 Bytes) Zufall → 16 Zeichen
  const buf = randomBytes(10);
  let bits = 0;
  let bitCount = 0;
  let rand = '';
  for (let i = 0; i < 10; i++) {
    bits = (bits << 8) | buf[i];
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      rand += ALPHABET[(bits >> bitCount) & 0x1f];
    }
  }
  return ts + rand.slice(0, 16);
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/tiff': 'tiff',
  'application/pdf': 'pdf',
  'application/octet-stream': 'bin',
};

export function extensionForMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? 'bin';
}

/**
 * Baut den Object-Key gemäß M10 §8.1 Schritt 7.
 *
 *   {customerId}/originals/{yyyy}/{mm}/{ULID}.{ext}
 */
export function buildObjectKey(customerId: string, mime: string, now = new Date()): string {
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const ext = extensionForMime(mime);
  return `${customerId}/originals/${yyyy}/${mm}/${ulid(now.getTime())}.${ext}`;
}
