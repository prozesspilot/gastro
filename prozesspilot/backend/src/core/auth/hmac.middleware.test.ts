/**
 * Tests für die Dual-Auth HMAC-Middleware
 *
 * Prüft alle sechs relevanten Pfade:
 *  1. PP_AUTH_DISABLED=1 → immer durchgelassen
 *  2. Gültiger Bearer-Token → authUser gesetzt, keine HMAC-Prüfung
 *  3. Ungültiger Bearer-Token → 401 UNAUTHORIZED, kein HMAC-Fallback
 *  4. Abgelaufener Bearer-Token → 401 TOKEN_EXPIRED, kein HMAC-Fallback
 *  5. Gültige HMAC-Header (kein Bearer) → durchgelassen
 *  6. Ungültige HMAC-Header (kein Bearer) → 401 mit HMAC-Fehlercode
 */

import { createHmac, createHash } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from './jwt';
import { hmacMiddleware } from './hmac.middleware';

// ── Hilfs-Konstante für HMAC-Tests ────────────────────────────────────────
// Muss 64 Hex-Zeichen sein (32 Byte), wie config.PP_HMAC_SECRET es erwartet
const TEST_HMAC_SECRET = 'a'.repeat(64);
const TEST_SKEW = 300;

/** Berechnet einen gültigen HMAC-Signature-Header für einen GET-Request. */
function buildValidHmacHeaders(url: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = createHash('sha256').update(Buffer.alloc(0)).digest('hex');
  const canonical = ['GET', url, timestamp, bodyHash].join('\n');
  const signature = createHmac('sha256', TEST_HMAC_SECRET).update(canonical).digest('hex');
  return {
    'x-pp-timestamp': timestamp,
    'x-pp-signature': signature,
  };
}

/** Baut eine minimale Fastify-App mit hmacMiddleware als preHandler. */
function buildApp() {
  const app = Fastify({ logger: false });
  app.addHook('preHandler', hmacMiddleware);
  app.get('/api/v1/test', async (req) => ({
    ok: true,
    authUser: (req as { authUser?: unknown }).authUser ?? null,
  }));
  return app;
}

// ── Config mocken ──────────────────────────────────────────────────────────
// vi.mock wird nach oben gehoisted — Inline-Literale verwenden (keine Vars).
vi.mock('../config', () => ({
  config: {
    PP_AUTH_DISABLED: false,
    PP_HMAC_SECRET: 'a'.repeat(64), // muss 64 Hex-Zeichen (32 Byte) sein
    PP_HMAC_TIMESTAMP_SKEW: 300,
    // JWT_SECRET muss vorhanden sein, da jwt.ts getSecret() es liest
    JWT_SECRET: 'test-jwt-secret-minimum-32-chars-padding-here',
    JWT_ACCESS_TTL_SECONDS: 900,
  },
}));

describe('hmacMiddleware — Dual-Auth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Dev-Bypass ──────────────────────────────────────────────────────
  describe('PP_AUTH_DISABLED=1', () => {
    beforeEach(async () => {
      const configMod = await import('../config');
      (configMod.config as Record<string, unknown>).PP_AUTH_DISABLED = true;
    });
    afterEach(async () => {
      const configMod = await import('../config');
      (configMod.config as Record<string, unknown>).PP_AUTH_DISABLED = false;
    });

    it('lässt Requests ohne jegliche Auth-Header durch', async () => {
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v1/test' });
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it('lässt Requests mit ungültigem Bearer durch', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/test',
        headers: { authorization: 'Bearer totally-invalid' },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  // ── 2. Gültiger Bearer-Token ───────────────────────────────────────────
  it('gültiger Bearer: req.authUser gesetzt, HMAC übersprungen', async () => {
    const app = buildApp();
    const token = signAccessToken({
      userId: 'usr_test_dual',
      tenantId: 'tnt_abc',
      permissions: ['receipts.read'],
      preset: 'operator',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: { authorization: `Bearer ${token}` },
      // Absichtlich KEINE HMAC-Header — würde sonst fehlschlagen
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; authUser: { sub: string; tenant_id: string } };
    expect(body.authUser).not.toBeNull();
    expect(body.authUser.sub).toBe('usr_test_dual');
    expect(body.authUser.tenant_id).toBe('tnt_abc');
    await app.close();
  });

  // ── 3. Ungültiger Bearer-Token → 401, KEIN HMAC-Fallback ──────────────
  it('ungültiger Bearer: 401 UNAUTHORIZED, kein HMAC-Fallback', async () => {
    const app = buildApp();
    // Gültige HMAC-Header beilegen — dürfen NICHT helfen wenn Bearer vorhanden aber invalid
    const hmacHeaders = buildValidHmacHeaders('/api/v1/test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: {
        authorization: 'Bearer this.is.not.a.valid.jwt',
        ...hmacHeaders,
      },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    await app.close();
  });

  it('Bearer ohne Payload ("Bearer ") → keine Bearer-Verarbeitung, fällt zu HMAC', async () => {
    const app = buildApp();
    const hmacHeaders = buildValidHmacHeaders('/api/v1/test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: {
        // Leerzeichen nach Bearer ohne Token → wird als "kein Bearer" behandelt
        authorization: 'Bearer ',
        ...hmacHeaders,
      },
    });
    // Kein Bearer erkannt → HMAC-Pfad → gültige HMAC-Header → 200
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  // ── 4. Abgelaufener Bearer-Token → 401 TOKEN_EXPIRED ──────────────────
  it('abgelaufener Bearer: 401 TOKEN_EXPIRED', async () => {
    // Wir erzeugen einen Token mit sehr kurzem TTL und warten kurz
    // Einfacherer Ansatz: jwt.verify direkt mocken über vi.mock
    // Stattdessen: direktes Mocken von verifyAccessToken
    const jwtMod = await import('./jwt');
    const spy = vi.spyOn(jwtMod, 'verifyAccessToken').mockReturnValue({
      ok: false,
      code: 'EXPIRED',
      message: 'Access-Token abgelaufen',
    });

    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: { authorization: 'Bearer some.fake.expired.token' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('TOKEN_EXPIRED');

    spy.mockRestore();
    await app.close();
  });

  // ── 5. Gültige HMAC-Header (kein Bearer) → durchgelassen ──────────────
  it('gültige HMAC-Header ohne Bearer: Request durchgelassen', async () => {
    const app = buildApp();
    const hmacHeaders = buildValidHmacHeaders('/api/v1/test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: hmacHeaders,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  // ── 6. Ungültige HMAC-Header (kein Bearer) → 401 HMAC-Fehlercode ──────
  it('fehlende HMAC-Header ohne Bearer: 401 MISSING_TIMESTAMP', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/test' });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('MISSING_TIMESTAMP');
    await app.close();
  });

  it('falsche HMAC-Signatur ohne Bearer: 401 INVALID_SIGNATURE', async () => {
    const app = buildApp();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: {
        'x-pp-timestamp': timestamp,
        'x-pp-signature': 'a'.repeat(64), // falsche Signatur (korrekte Länge, falscher Wert)
      },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_SIGNATURE');
    await app.close();
  });
});
