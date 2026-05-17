/**
 * M10 — Tests für POST /api/v1/internal/whatsapp/verify
 *
 * Deckt die drei Pflicht-Fälle aus dem Prompt ab:
 *   - gültige Signatur → 200
 *   - ungültige Signatur → 401
 *   - fehlendes Secret  → 401
 *
 * Plus: weitere Branches im webhook-verifier (malformed, leerer Header).
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWhatsAppSignature } from '../services/webhook-verifier';

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('webhook-verifier (M10 §7.1)', () => {
  const secret = 'meta-app-secret-test';
  const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));

  it('akzeptiert eine gültige Signatur', () => {
    const sig = sign(body, secret);
    expect(verifyWhatsAppSignature(body, sig, secret)).toEqual({ ok: true });
  });

  it('lehnt eine manipulierte Signatur ab', () => {
    const sig = sign(body, 'wrong-secret');
    const res = verifyWhatsAppSignature(body, sig, secret);
    expect(res).toEqual({ ok: false, code: 'INVALID_SIGNATURE' });
  });

  it('lehnt manipulierten Body ab (gleicher Sig, andere Bytes)', () => {
    const sig = sign(body, secret);
    const tampered = Buffer.concat([body, Buffer.from('!')]);
    expect(verifyWhatsAppSignature(tampered, sig, secret)).toEqual({
      ok: false,
      code: 'INVALID_SIGNATURE',
    });
  });

  it('lehnt fehlendes Secret ab', () => {
    const sig = sign(body, secret);
    expect(verifyWhatsAppSignature(body, sig, '')).toEqual({
      ok: false,
      code: 'MISSING_SECRET',
    });
  });

  it('lehnt fehlenden Header ab', () => {
    expect(verifyWhatsAppSignature(body, undefined, secret)).toEqual({
      ok: false,
      code: 'INVALID_SIGNATURE',
    });
    expect(verifyWhatsAppSignature(body, '', secret)).toEqual({
      ok: false,
      code: 'INVALID_SIGNATURE',
    });
  });

  it('lehnt malformed Header ab (kein "sha256=" Präfix)', () => {
    expect(verifyWhatsAppSignature(body, 'abc123', secret)).toEqual({
      ok: false,
      code: 'MALFORMED_SIGNATURE',
    });
  });

  it('vergleicht timing-safe (gleiche Hex-Länge, andere Bytes)', () => {
    const sig = `sha256=${'a'.repeat(64)}`;
    expect(verifyWhatsAppSignature(body, sig, secret)).toEqual({
      ok: false,
      code: 'INVALID_SIGNATURE',
    });
  });
});
