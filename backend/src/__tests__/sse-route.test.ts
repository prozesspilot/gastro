/**
 * T074 — Tests für die Auth-/Tenant-Auflösung des SSE-Endpoints (/api/v1/events).
 *
 * Der Erfolgspfad der Route bleibt durch `reply.hijack()` offen und ist damit
 * nicht per `app.inject` testbar. Die Entscheidungslogik (Auth + Tenant) ist
 * deshalb als reine Funktion `resolveSseSubscription` ausgelagert und hier mit
 * echten, signierten M14-Tokens abgedeckt.
 *
 * Liegt unter src/__tests__/ (nicht src/routes/), weil die vitest-include-Liste
 * src/routes/ nicht erfasst — vgl. Memory vitest-include-excludes-cron.
 */

import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { signM14Token } from '../modules/m14-auth/m14-jwt';
import { resolveSseSubscription } from '../routes/sse';

function fakeReq(opts: {
  cookie?: string;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string | string[]>;
}): FastifyRequest {
  return {
    cookies: opts.cookie ? { pp_auth: opts.cookie } : {},
    query: opts.query ?? {},
    headers: opts.headers ?? {},
  } as unknown as FastifyRequest;
}

function validToken(): string {
  return signM14Token({
    userId: '11111111-1111-4111-8111-111111111111',
    discordId: '123456789',
    role: 'mitarbeiter',
    displayName: 'Test Mitarbeiter',
  });
}

const TENANT = '22222222-2222-4222-8222-222222222222';

describe('resolveSseSubscription', () => {
  it('ohne pp_auth-Cookie → 401', () => {
    const r = resolveSseSubscription(fakeReq({ query: { tenant: TENANT } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('mit ungültigem Cookie → 401', () => {
    const r = resolveSseSubscription(fakeReq({ cookie: 'not-a-jwt', query: { tenant: TENANT } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('mit gültigem Cookie + ?tenant= → ok, Tenant aus Query', () => {
    const r = resolveSseSubscription(fakeReq({ cookie: validToken(), query: { tenant: TENANT } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenantId).toBe(TENANT);
  });

  it('mit gültigem Cookie + x-pp-tenant-id-Header (Fallback) → ok', () => {
    const r = resolveSseSubscription(
      fakeReq({ cookie: validToken(), headers: { 'x-pp-tenant-id': TENANT } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenantId).toBe(TENANT);
  });

  it('Query-Param hat Vorrang vor Header', () => {
    const r = resolveSseSubscription(
      fakeReq({
        cookie: validToken(),
        query: { tenant: TENANT },
        headers: { 'x-pp-tenant-id': 'header-tenant' },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenantId).toBe(TENANT);
  });

  it('mit gültigem Cookie, aber ohne Tenant (weder Query noch Header) → 400', () => {
    const r = resolveSseSubscription(fakeReq({ cookie: validToken() }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('MISSING_TENANT');
    }
  });

  it('array-wertiger x-pp-tenant-id-Header nimmt den ersten Wert', () => {
    const r = resolveSseSubscription(
      fakeReq({ cookie: validToken(), headers: { 'x-pp-tenant-id': [TENANT, 'zweiter'] } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenantId).toBe(TENANT);
  });

  it('array-wertiger ?tenant=-Query nimmt den ersten Wert (Symmetrie zum Header)', () => {
    const r = resolveSseSubscription(
      fakeReq({ cookie: validToken(), query: { tenant: [TENANT, 'zweiter'] } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenantId).toBe(TENANT);
  });
});
