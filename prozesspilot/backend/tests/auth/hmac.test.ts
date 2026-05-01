/**
 * D3 — Unit-Tests für HMAC-SHA256-Authentifizierung
 *
 * Kein laufender Server oder Infra-Service notwendig.
 */

import { describe, expect, it } from 'vitest';
import {
  buildCanonicalString,
  computeSignature,
  safeCompare,
  sha256Hex,
  verifyHmac,
} from '../../src/core/auth/hmac';

const SECRET    = 'a'.repeat(64); // 32-Byte-Hex-String (64 Hex-Zeichen)
const TIMESTAMP = '1717000000';
const NOW       = 1717000000;     // identisch → Skew = 0

function makeOpts(overrides: Partial<Parameters<typeof verifyHmac>[0]> = {}) {
  const rawBody = Buffer.from('{"test":true}');
  const bodyHash = sha256Hex(rawBody);
  const canonical = buildCanonicalString('POST', '/api/v1/customers', TIMESTAMP, bodyHash);
  const signature = computeSignature(SECRET, canonical);

  return {
    secret:         SECRET,
    maxSkewSeconds: 300,
    method:         'POST',
    url:            '/api/v1/customers',
    timestamp:      TIMESTAMP,
    signature,
    rawBody,
    nowSeconds:     NOW,
    ...overrides,
  };
}

// ── sha256Hex ──────────────────────────────────────────────────────────────
describe('sha256Hex', () => {
  it('gibt den korrekten Hash für einen leeren Buffer zurück', () => {
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('gibt den korrekten Hash für einen String zurück', () => {
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

// ── buildCanonicalString ───────────────────────────────────────────────────
describe('buildCanonicalString', () => {
  it('verbindet die Felder mit Newlines', () => {
    const result = buildCanonicalString('GET', '/api/v1/test', '1000', 'abc123');
    expect(result).toBe('GET\n/api/v1/test\n1000\nabc123');
  });

  it('normalisiert die Methode auf Großbuchstaben', () => {
    const result = buildCanonicalString('get', '/api/v1/test', '1000', 'abc123');
    expect(result).toBe('GET\n/api/v1/test\n1000\nabc123');
  });
});

// ── safeCompare ────────────────────────────────────────────────────────────
describe('safeCompare', () => {
  it('gibt true für gleiche Strings zurück', () => {
    expect(safeCompare('abc', 'abc')).toBe(true);
  });

  it('gibt false für unterschiedliche Strings zurück', () => {
    expect(safeCompare('abc', 'xyz')).toBe(false);
  });

  it('gibt false bei unterschiedlicher Länge zurück', () => {
    expect(safeCompare('abc', 'abcd')).toBe(false);
  });
});

// ── verifyHmac ─────────────────────────────────────────────────────────────
describe('verifyHmac', () => {
  it('akzeptiert eine korrekte Signatur', () => {
    const result = verifyHmac(makeOpts());
    expect(result.ok).toBe(true);
  });

  it('akzeptiert Anfragen innerhalb des Zeitfensters (Skew < maxSkew)', () => {
    const result = verifyHmac(makeOpts({ nowSeconds: NOW + 299 }));
    expect(result.ok).toBe(true);
  });

  it('lehnt fehlenden Timestamp-Header ab', () => {
    const result = verifyHmac(makeOpts({ timestamp: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MISSING_TIMESTAMP');
  });

  it('lehnt fehlenden Signature-Header ab', () => {
    const result = verifyHmac(makeOpts({ signature: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MISSING_SIGNATURE');
  });

  it('lehnt einen ungültigen Timestamp ab (kein Integer)', () => {
    const result = verifyHmac(makeOpts({ timestamp: 'not-a-number' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_TIMESTAMP');
  });

  it('lehnt einen negativen Timestamp ab', () => {
    const result = verifyHmac(makeOpts({ timestamp: '-1' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_TIMESTAMP');
  });

  it('lehnt Anfragen außerhalb des Zeitfensters ab (Skew > maxSkew)', () => {
    const result = verifyHmac(makeOpts({ nowSeconds: NOW + 301 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TIMESTAMP_SKEW');
  });

  it('lehnt eine falsche Signatur ab', () => {
    const result = verifyHmac(makeOpts({ signature: 'deadbeef'.repeat(8) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_SIGNATURE');
  });

  it('lehnt eine Signatur mit falschem Secret ab', () => {
    const wrongSecret = 'b'.repeat(64);
    const rawBody  = Buffer.from('{"test":true}');
    const bodyHash = sha256Hex(rawBody);
    const canonical = buildCanonicalString('POST', '/api/v1/customers', TIMESTAMP, bodyHash);
    const wrongSig  = computeSignature(wrongSecret, canonical);

    const result = verifyHmac(makeOpts({ signature: wrongSig }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_SIGNATURE');
  });

  it('lehnt ab wenn der Body verändert wurde', () => {
    const tamperedBody = Buffer.from('{"test":false}'); // anderer Inhalt
    const result = verifyHmac(makeOpts({ rawBody: tamperedBody }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_SIGNATURE');
  });

  it('akzeptiert GET-Anfragen mit leerem Body', () => {
    const rawBody  = Buffer.alloc(0);
    const bodyHash = sha256Hex(rawBody);
    const canonical = buildCanonicalString('GET', '/api/v1/customers', TIMESTAMP, bodyHash);
    const signature = computeSignature(SECRET, canonical);

    const result = verifyHmac({
      secret: SECRET, maxSkewSeconds: 300,
      method: 'GET', url: '/api/v1/customers',
      timestamp: TIMESTAMP, signature,
      rawBody, nowSeconds: NOW,
    });
    expect(result.ok).toBe(true);
  });
});
