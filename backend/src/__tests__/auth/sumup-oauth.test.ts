/**
 * T004 — M15 SumUp OAuth-Flow + Token-Storage Tests
 *
 * Testet:
 *   1. sumup.service.ts — exchangeCodeForTokens, refreshAccessToken, fetchSumUpUserInfo, buildSumUpAuthUrl
 *   2. pos-token-helper.ts — getSumUpAccessToken (null-Fälle, cached, refresh, refresh-fail)
 *   3. Route /m15/oauth/sumup/callback — State-Validierung, Happy-Path → DB-Insert + Redirect
 *
 * Kein echter DB- oder Redis-Zugriff — alle Calls gemockt (vi.spyOn + Pool-Mock).
 * Pattern analog zu notfall.test.ts und bootstrap.test.ts.
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../core/config';
import { signM14Token } from '../../modules/m14-auth/m14-jwt';
import { getSumUpAccessToken } from '../../modules/m15-pos-connector/pos-token-helper';
import {
  getPosCredentials,
  markPosInactive,
  updatePosTokens,
  upsertPosCredentials,
} from '../../modules/m15-pos-connector/pos.repository';
import {
  SUMUP_REQUIRED_SCOPES,
  SumUpApiError,
  buildSumUpAuthUrl,
  exchangeCodeForTokens,
  fetchSumUpUserInfo,
  refreshAccessToken,
} from '../../modules/m15-pos-connector/sumup.service';

// ── Config-Backup ─────────────────────────────────────────────────────────

const ORIGINAL_SUMUP_CLIENT_ID = config.SUMUP_CLIENT_ID;
const ORIGINAL_SUMUP_CLIENT_SECRET = config.SUMUP_CLIENT_SECRET;
const ORIGINAL_SUMUP_REDIRECT_URI = config.SUMUP_REDIRECT_URI;
const ORIGINAL_SUMUP_API_BASE_URL = config.SUMUP_API_BASE_URL;
const ORIGINAL_PGCRYPTO_KEY = config.PP_PGCRYPTO_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  (config as { SUMUP_CLIENT_ID: string }).SUMUP_CLIENT_ID = ORIGINAL_SUMUP_CLIENT_ID;
  (config as { SUMUP_CLIENT_SECRET: string }).SUMUP_CLIENT_SECRET = ORIGINAL_SUMUP_CLIENT_SECRET;
  (config as { SUMUP_REDIRECT_URI: string }).SUMUP_REDIRECT_URI = ORIGINAL_SUMUP_REDIRECT_URI;
  (config as { SUMUP_API_BASE_URL: string }).SUMUP_API_BASE_URL = ORIGINAL_SUMUP_API_BASE_URL;
  (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = ORIGINAL_PGCRYPTO_KEY;
});

// ── Hilfsfunktionen ──────────────────────────────────────────────────────

function mockFetchOk(body: unknown): void {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

function mockFetchError(status: number, bodyText: string): void {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => bodyText,
  } as Response);
}

const MOCK_TOKEN_RESPONSE = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'Bearer' as const,
  scope: 'transactions.history.read user.profile_readonly',
};

const MOCK_USER_INFO = {
  merchant_profile: {
    merchant_code: 'MC123456',
    company_name: 'Müller Bistro',
  },
};

// ── 1. exchangeCodeForTokens ──────────────────────────────────────────────

describe('exchangeCodeForTokens', () => {
  beforeEach(() => {
    (config as { SUMUP_CLIENT_ID: string }).SUMUP_CLIENT_ID = 'test-client-id';
    (config as { SUMUP_CLIENT_SECRET: string }).SUMUP_CLIENT_SECRET = 'test-client-secret';
    (config as { SUMUP_REDIRECT_URI: string }).SUMUP_REDIRECT_URI = 'http://localhost/callback';
    (config as { SUMUP_API_BASE_URL: string }).SUMUP_API_BASE_URL = 'https://api.sumup.com';
  });

  it('gibt Tokens zurück bei erfolgreicher Antwort', async () => {
    mockFetchOk(MOCK_TOKEN_RESPONSE);

    const result = await exchangeCodeForTokens('auth-code-123');

    expect(result.access_token).toBe('test-access-token');
    expect(result.refresh_token).toBe('test-refresh-token');
    expect(result.expires_in).toBe(3600);
    expect(result.token_type).toBe('Bearer');
  });

  it('wirft SumUpApiError bei 4xx-Antwort mit korrektem statusCode', async () => {
    mockFetchError(401, '{"error":"invalid_client"}');

    let caught: unknown;
    try {
      await exchangeCodeForTokens('bad-code');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SumUpApiError);
    expect((caught as SumUpApiError).statusCode).toBe(401);
  });

  it('wirft SumUpApiError bei 5xx-Antwort mit korrektem statusCode', async () => {
    mockFetchError(500, 'Internal Server Error');

    let caught: unknown;
    try {
      await exchangeCodeForTokens('some-code');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SumUpApiError);
    expect((caught as SumUpApiError).statusCode).toBe(500);
  });
});

// ── 2. refreshAccessToken ─────────────────────────────────────────────────

describe('refreshAccessToken', () => {
  beforeEach(() => {
    (config as { SUMUP_CLIENT_ID: string }).SUMUP_CLIENT_ID = 'test-client-id';
    (config as { SUMUP_CLIENT_SECRET: string }).SUMUP_CLIENT_SECRET = 'test-client-secret';
    (config as { SUMUP_API_BASE_URL: string }).SUMUP_API_BASE_URL = 'https://api.sumup.com';
  });

  it('gibt neue Tokens zurück bei Erfolg', async () => {
    const refreshed = { ...MOCK_TOKEN_RESPONSE, access_token: 'new-access-token' };
    mockFetchOk(refreshed);

    const result = await refreshAccessToken('old-refresh-token');
    expect(result.access_token).toBe('new-access-token');
  });

  it('wirft SumUpApiError bei abgelaufenem Refresh-Token (400)', async () => {
    mockFetchError(400, '{"error":"invalid_grant"}');

    await expect(refreshAccessToken('expired-refresh-token')).rejects.toThrow(SumUpApiError);
    await expect(refreshAccessToken('expired-refresh-token')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('wirft SumUpApiError bei widerrufenem Refresh-Token (401)', async () => {
    mockFetchError(401, '{"error":"unauthorized"}');

    await expect(refreshAccessToken('revoked-token')).rejects.toThrow(SumUpApiError);
  });
});

// ── 3. fetchSumUpUserInfo ─────────────────────────────────────────────────

describe('fetchSumUpUserInfo', () => {
  beforeEach(() => {
    (config as { SUMUP_API_BASE_URL: string }).SUMUP_API_BASE_URL = 'https://api.sumup.com';
  });

  it('gibt UserInfo mit merchant_code zurück', async () => {
    mockFetchOk(MOCK_USER_INFO);

    const result = await fetchSumUpUserInfo('some-access-token');
    expect(result.merchant_profile.merchant_code).toBe('MC123456');
    expect(result.merchant_profile.company_name).toBe('Müller Bistro');
  });

  it('wirft SumUpApiError bei ungültigem Token', async () => {
    mockFetchError(401, '{"error":"unauthorized"}');

    await expect(fetchSumUpUserInfo('invalid-token')).rejects.toThrow(SumUpApiError);
  });
});

// ── 4. buildSumUpAuthUrl ──────────────────────────────────────────────────

describe('buildSumUpAuthUrl', () => {
  beforeEach(() => {
    (config as { SUMUP_CLIENT_ID: string }).SUMUP_CLIENT_ID = 'my-client-id';
    (config as { SUMUP_REDIRECT_URI: string }).SUMUP_REDIRECT_URI =
      'https://api.prozesspilot.net/api/v1/m15/oauth/sumup/callback';
    (config as { SUMUP_API_BASE_URL: string }).SUMUP_API_BASE_URL = 'https://api.sumup.com';
  });

  it('enthält client_id in der URL', () => {
    const url = buildSumUpAuthUrl('test-state-123');
    expect(url).toContain('client_id=my-client-id');
  });

  it('enthält redirect_uri in der URL', () => {
    const url = buildSumUpAuthUrl('test-state-123');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain(encodeURIComponent('https://api.prozesspilot.net'));
  });

  it('enthält alle erforderlichen Scopes', () => {
    const url = buildSumUpAuthUrl('test-state-123');
    for (const scope of SUMUP_REQUIRED_SCOPES) {
      expect(url).toContain(encodeURIComponent(scope));
    }
  });

  it('enthält den übergebenen State', () => {
    const url = buildSumUpAuthUrl('my-csrf-state');
    expect(url).toContain('state=my-csrf-state');
  });

  it('startet mit der richtigen Base-URL', () => {
    const url = buildSumUpAuthUrl('state');
    expect(url).toMatch(/^https:\/\/api\.sumup\.com\/authorize/);
  });
});

// ── 5. getSumUpAccessToken ────────────────────────────────────────────────

describe('getSumUpAccessToken', () => {
  // Pool-Mock — nur query() relevant
  function makePool(queryFn: (sql: string) => unknown) {
    return {
      query: vi.fn(async (sql: string) => queryFn(sql)),
    } as unknown as Pool;
  }

  it('gibt null zurück wenn keine Credentials vorhanden', async () => {
    // Kein Spy nötig: Pool-Mock liefert { rows: [] } → getPosCredentials gibt null zurück →
    // getSumUpAccessToken gibt null zurück. Der Spy auf ein lokales Objekt wäre ohnehin
    // ein toter Spy (greift nicht in das importierte Modul ein).
    const pool = makePool(() => ({ rows: [], rowCount: 0 }));
    const result = await getSumUpAccessToken(pool, 'tenant-uuid-1');
    expect(result).toBeNull();
  });

  it('gibt null zurück wenn Credentials inactive', async () => {
    // getPosCredentials gibt inactive Credentials zurück
    const inactiveCreds = {
      id: 'cred-id',
      tenant_id: 'tenant-1',
      pos_system: 'sumup_lite' as const,
      pos_account_id: 'MC123',
      access_token: 'old-token',
      refresh_token: 'old-refresh',
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1h noch gültig
      scopes: null,
      active: false, // inactive!
      created_at: new Date(),
      updated_at: new Date(),
      inactive_reason: null,
      last_used_at: null,
    };

    vi.spyOn(
      await import('../../modules/m15-pos-connector/pos.repository'),
      'getPosCredentials',
    ).mockResolvedValueOnce(inactiveCreds);

    const pool = makePool(() => ({ rows: [], rowCount: 0 }));
    const result = await getSumUpAccessToken(pool, 'tenant-1');
    expect(result).toBeNull();
  });

  it('gibt cached Token zurück wenn nicht abgelaufen', async () => {
    const activeCreds = {
      id: 'cred-id',
      tenant_id: 'tenant-1',
      pos_system: 'sumup_lite' as const,
      pos_account_id: 'MC123',
      access_token: 'valid-access-token',
      refresh_token: 'valid-refresh-token',
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1h noch gültig
      scopes: null,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
      inactive_reason: null,
      last_used_at: null,
    };

    vi.spyOn(
      await import('../../modules/m15-pos-connector/pos.repository'),
      'getPosCredentials',
    ).mockResolvedValueOnce(activeCreds);

    const pool = makePool(() => ({ rows: [], rowCount: 0 }));
    const result = await getSumUpAccessToken(pool, 'tenant-1');
    expect(result).toBe('valid-access-token');
  });

  it('refresht Token wenn expires < now+5min und gibt neuen Token zurück', async () => {
    const nearlyExpiredCreds = {
      id: 'cred-id',
      tenant_id: 'tenant-1',
      pos_system: 'sumup_lite' as const,
      pos_account_id: 'MC123',
      access_token: 'old-access-token',
      refresh_token: 'old-refresh-token',
      token_expires_at: new Date(Date.now() + 2 * 60 * 1000), // nur 2min verbleibend
      scopes: null,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
      inactive_reason: null,
      last_used_at: null,
    };

    const posRepo = await import('../../modules/m15-pos-connector/pos.repository');
    vi.spyOn(posRepo, 'getPosCredentials').mockResolvedValueOnce(nearlyExpiredCreds);
    vi.spyOn(posRepo, 'updatePosTokens').mockResolvedValueOnce(undefined);

    const newTokenResponse = {
      ...MOCK_TOKEN_RESPONSE,
      access_token: 'refreshed-access-token',
      refresh_token: 'new-refresh-token',
    };
    mockFetchOk(newTokenResponse);

    const pool = makePool(() => ({ rows: [], rowCount: 0 }));
    const result = await getSumUpAccessToken(pool, 'tenant-1');
    expect(result).toBe('refreshed-access-token');
  });

  it('markiert als inactive bei Refresh-Fehler (401) und gibt null zurück', async () => {
    const nearlyExpiredCreds = {
      id: 'cred-id',
      tenant_id: 'tenant-1',
      pos_system: 'sumup_lite' as const,
      pos_account_id: 'MC123',
      access_token: 'old-access-token',
      refresh_token: 'revoked-refresh-token',
      token_expires_at: new Date(Date.now() + 1 * 60 * 1000), // 1min — unter Schwellwert
      scopes: null,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
      inactive_reason: null,
      last_used_at: null,
    };

    const posRepo = await import('../../modules/m15-pos-connector/pos.repository');
    vi.spyOn(posRepo, 'getPosCredentials').mockResolvedValueOnce(nearlyExpiredCreds);
    const markInactiveSpy = vi.spyOn(posRepo, 'markPosInactive').mockResolvedValueOnce(undefined);

    // Audit-Log mocken (logAuthEvent ist fire-and-forget)
    const usersRepo = await import('../../modules/m14-auth/users.repository');
    vi.spyOn(usersRepo, 'logAuthEvent').mockResolvedValueOnce(undefined);

    // Refresh schlägt mit 401 fehl
    mockFetchError(401, '{"error":"unauthorized"}');

    const pool = makePool(() => ({ rows: [], rowCount: 0 }));
    const result = await getSumUpAccessToken(pool, 'tenant-1');

    expect(result).toBeNull();
    expect(markInactiveSpy).toHaveBeenCalledWith(expect.anything(), 'cred-id', 'refresh_failed');
  });
});

// ── 6. Route /m15/oauth/sumup/callback ───────────────────────────────────

describe('Route GET /m15/oauth/sumup/callback', () => {
  // Minimale Fastify-Instanz mit gemocktem db + redis
  async function buildTestApp() {
    const app = Fastify({ logger: false });

    // Pool-Mock
    const mockPool = {
      query: vi.fn(async () => ({ rows: [{ id: 'new-cred-id' }], rowCount: 1 })),
    } as unknown as Pool;

    // Redis-Mock
    const mockRedis = {
      getdel: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as InstanceType<typeof Redis>;

    app.decorate('db', mockPool);
    app.decorate('redis', mockRedis);

    await app.register(fastifyCookie);

    const { sumupOauthRoutes } = await import('../../modules/m15-pos-connector/oauth.routes');
    await app.register(sumupOauthRoutes, { prefix: '/api/v1' });

    return { app, mockPool, mockRedis };
  }

  it('gibt 400 zurück bei fehlendem State', async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/callback?code=some-code',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('missing_params');
  });

  it('gibt 400 zurück bei fehlendem Code', async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/callback?state=some-state',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('missing_params');
  });

  it('gibt 400 zurück bei ungültigem State (nicht in Redis)', async () => {
    const { app, mockRedis } = await buildTestApp();

    // Redis gibt null zurück → State nicht vorhanden
    (mockRedis.getdel as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/callback?code=some-code&state=invalid-state',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('invalid_state');
  });

  it('führt Happy-Path durch: State OK → Tokens → UserInfo → DB-Insert → Redirect', async () => {
    const { app, mockRedis } = await buildTestApp();

    // Redis gibt State-JSON zurück (nach B1-Fix: JSON statt reiner tenant_id)
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    (mockRedis.getdel as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      JSON.stringify({ tenant_id: tenantId, staff_user_id: 'staff-uuid-1' }),
    );

    // fetch: Token-Exchange
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MOCK_TOKEN_RESPONSE,
        text: async () => JSON.stringify(MOCK_TOKEN_RESPONSE),
      } as Response)
      // fetch: User-Info
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MOCK_USER_INFO,
        text: async () => JSON.stringify(MOCK_USER_INFO),
      } as Response);

    // upsertPosCredentials mocken (vermeidet echten DB-Call)
    const posRepo = await import('../../modules/m15-pos-connector/pos.repository');
    vi.spyOn(posRepo, 'upsertPosCredentials').mockResolvedValueOnce({ id: 'new-cred-id' });

    // logAuthEvent mocken
    const usersRepo = await import('../../modules/m14-auth/users.repository');
    const logSpy = vi.spyOn(usersRepo, 'logAuthEvent').mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/callback?code=valid-code&state=valid-state',
    });

    // Redirect zu Frontend
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain(tenantId);
    expect(response.headers.location).toContain('pos_connected=sumup');

    // Audit-Log wurde aufgerufen mit pos_connected
    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'pos_connected' }),
    );
  });

  it('gibt 502 zurück wenn SumUp Token-Exchange fehlschlägt', async () => {
    const { app, mockRedis } = await buildTestApp();

    const tenantId = '550e8400-e29b-41d4-a716-446655440001';
    (mockRedis.getdel as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      JSON.stringify({ tenant_id: tenantId, staff_user_id: 'staff-uuid-2' }),
    );

    // Token-Exchange schlägt fehl
    mockFetchError(400, '{"error":"invalid_grant"}');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/callback?code=bad-code&state=valid-state',
    });

    expect(response.statusCode).toBe(502);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('sumup_error');
  });
});

// ── 7. Encryption-Pattern-Test ────────────────────────────────────────────

describe('upsertPosCredentials — Encryption-Pattern', () => {
  it('verwendet pgp_sym_encrypt wenn PP_PGCRYPTO_KEY gesetzt', async () => {
    (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = 'test-key-32-bytes-padding-padding';

    const querySpy = vi.fn(async () => ({ rows: [{ id: 'test-id' }], rowCount: 1 }));
    const pool = { query: querySpy } as unknown as Pool;

    await upsertPosCredentials(pool, {
      tenantId: 'tenant-uuid',
      posSystem: 'sumup_lite',
      posAccountId: 'MC999',
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      scopes: ['transactions.history.read'],
    });

    const firstCall = querySpy.mock.calls[0] as unknown as [string, ...unknown[]];
    expect(firstCall[0]).toContain('pgp_sym_encrypt');
  });

  it('verwendet leeres BYTEA wenn PP_PGCRYPTO_KEY nicht gesetzt', async () => {
    (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = '';

    const querySpy = vi.fn(async () => ({ rows: [{ id: 'test-id' }], rowCount: 1 }));
    const pool = { query: querySpy } as unknown as Pool;

    await upsertPosCredentials(pool, {
      tenantId: 'tenant-uuid',
      posSystem: 'sumup_lite',
      posAccountId: 'MC999',
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      scopes: ['transactions.history.read'],
    });

    const firstCall = querySpy.mock.calls[0] as unknown as [string, ...unknown[]];
    expect(firstCall[0]).toContain("''::bytea");
    expect(firstCall[0]).not.toContain('pgp_sym_encrypt');
  });
});

// ── 8. Route GET /m15/oauth/sumup/start ──────────────────────────────────

describe('Route GET /m15/oauth/sumup/start', () => {
  async function buildStartApp() {
    const app = Fastify({ logger: false });

    const mockPool = {
      query: vi.fn(async () => ({ rows: [{ id: 'tenant-uuid' }], rowCount: 1 })),
    } as unknown as Pool;

    const mockRedis = {
      set: vi.fn(async () => 'OK'),
      get: vi.fn(),
      getdel: vi.fn(),
      del: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as InstanceType<typeof Redis>;

    app.decorate('db', mockPool);
    app.decorate('redis', mockRedis);
    await app.register(fastifyCookie);

    const { sumupOauthRoutes } = await import('../../modules/m15-pos-connector/oauth.routes');
    await app.register(sumupOauthRoutes, { prefix: '/api/v1' });

    return { app, mockPool, mockRedis };
  }

  it('gibt 401 zurück ohne Cookie', async () => {
    const { app } = await buildStartApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/start?tenant_id=550e8400-e29b-41d4-a716-446655440000',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('gibt 403 zurück bei Rolle mitarbeiter', async () => {
    const { app } = await buildStartApp();

    const token = signM14Token({
      userId: 'user-uuid-1',
      discordId: 'discord-123',
      role: 'mitarbeiter',
      displayName: 'Max Mustermann',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/start?tenant_id=550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('forbidden');
  });

  it('gibt 400 zurück bei ungültiger tenant_id (kein UUID)', async () => {
    const { app } = await buildStartApp();

    const token = signM14Token({
      userId: 'user-uuid-1',
      discordId: 'discord-123',
      role: 'geschaeftsfuehrer',
      displayName: 'Chef',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/start?tenant_id=kein-uuid',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('invalid_request');
  });

  it('gibt 404 zurück wenn Tenant nicht existiert', async () => {
    const { app, mockPool } = await buildStartApp();

    // Tenant-Query gibt keine Ergebnisse zurück
    (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const token = signM14Token({
      userId: 'user-uuid-1',
      discordId: 'discord-123',
      role: 'geschaeftsfuehrer',
      displayName: 'Chef',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/start?tenant_id=550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('tenant_not_found');
  });

  it('gibt 302 Redirect zu SumUp zurück und speichert State in Redis', async () => {
    const { app, mockRedis } = await buildStartApp();

    const token = signM14Token({
      userId: 'user-uuid-gf',
      discordId: 'discord-456',
      role: 'geschaeftsfuehrer',
      displayName: 'Chef',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/start?tenant_id=550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('sumup.com');
    expect(response.headers.location).toContain('state=');

    // Redis-Set wurde aufgerufen (State-Speicherung)
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('sumup:oauth:state:'),
      expect.stringContaining('"tenant_id"'),
      'EX',
      300,
    );
  });

  it('State-JSON enthält tenant_id und staff_user_id', async () => {
    const { app, mockRedis } = await buildStartApp();
    const staffUserId = 'user-uuid-gf-2';

    const token = signM14Token({
      userId: staffUserId,
      discordId: 'discord-789',
      role: 'support',
      displayName: 'Support',
    });

    await app.inject({
      method: 'GET',
      url: '/api/v1/m15/oauth/sumup/start?tenant_id=550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    // State-Payload prüfen
    const setCall = (mockRedis.set as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const stateJson = setCall[1] as string;
    const statePayload = JSON.parse(stateJson) as { tenant_id: string; staff_user_id: string };
    expect(statePayload.tenant_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(statePayload.staff_user_id).toBe(staffUserId);
  });
});

// ── 9. Route POST /m15/sumup/disconnect/:tenantId ────────────────────────

describe('Route POST /m15/sumup/disconnect/:tenantId', () => {
  async function buildDisconnectApp() {
    const app = Fastify({ logger: false });

    const mockPool = {
      query: vi.fn(async () => ({ rows: [{ id: 'cred-id' }], rowCount: 1 })),
    } as unknown as Pool;

    const mockRedis = {
      set: vi.fn(),
      get: vi.fn(),
      getdel: vi.fn(),
      del: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as InstanceType<typeof Redis>;

    app.decorate('db', mockPool);
    app.decorate('redis', mockRedis);
    await app.register(fastifyCookie);

    const { sumupOauthRoutes } = await import('../../modules/m15-pos-connector/oauth.routes');
    await app.register(sumupOauthRoutes, { prefix: '/api/v1' });

    return { app, mockPool, mockRedis };
  }

  it('gibt 401 zurück ohne Cookie', async () => {
    const { app } = await buildDisconnectApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/disconnect/550e8400-e29b-41d4-a716-446655440000',
    });

    expect(response.statusCode).toBe(401);
  });

  it('gibt 403 zurück bei Rolle mitarbeiter', async () => {
    const { app } = await buildDisconnectApp();

    const token = signM14Token({
      userId: 'user-1',
      discordId: 'discord-1',
      role: 'mitarbeiter',
      displayName: 'Mitarbeiter',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/disconnect/550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('forbidden');
  });

  it('gibt 400 zurück bei ungültiger tenantId (kein UUID)', async () => {
    const { app } = await buildDisconnectApp();

    const token = signM14Token({
      userId: 'user-1',
      discordId: 'discord-1',
      role: 'geschaeftsfuehrer',
      displayName: 'Chef',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/disconnect/kein-uuid',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(400);
  });

  it('gibt 404 zurück wenn Tenant nicht existiert', async () => {
    const { app, mockPool } = await buildDisconnectApp();

    // Tenant-Query gibt keine Ergebnisse zurück
    (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const token = signM14Token({
      userId: 'user-1',
      discordId: 'discord-1',
      role: 'geschaeftsfuehrer',
      displayName: 'Chef',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/disconnect/550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('tenant_not_found');
  });

  it('gibt 200 zurück bei erfolgreichem Disconnect und Audit-Log wird VOR Delete geschrieben', async () => {
    const { app, mockPool } = await buildDisconnectApp();

    // Calls: 1) Tenant-Check → exists, 2) logAuthEvent (audit), 3) deletePosCredentials
    const callOrder: string[] = [];
    (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      if ((sql as string).includes('tenants')) {
        callOrder.push('tenant_check');
        return { rows: [{ id: 'tenant-id' }], rowCount: 1 };
      }
      if ((sql as string).includes('auth_audit_log')) {
        callOrder.push('audit_log');
        return { rows: [], rowCount: 0 };
      }
      if ((sql as string).includes('DELETE')) {
        callOrder.push('delete');
        return { rows: [{ id: 'cred-id' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const token = signM14Token({
      userId: 'user-gf',
      discordId: 'discord-gf',
      role: 'geschaeftsfuehrer',
      displayName: 'Chef',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/disconnect/550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Audit-Log muss VOR Delete stehen
    const auditIdx = callOrder.indexOf('audit_log');
    const deleteIdx = callOrder.indexOf('delete');
    expect(auditIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeLessThan(deleteIdx);
  });

  it('gibt 404 zurück wenn keine Credentials vorhanden', async () => {
    const { app, mockPool } = await buildDisconnectApp();

    (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      if ((sql as string).includes('tenants')) {
        return { rows: [{ id: 'tenant-id' }], rowCount: 1 };
      }
      if ((sql as string).includes('DELETE')) {
        // Keine Credentials vorhanden
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const token = signM14Token({
      userId: 'user-gf',
      discordId: 'discord-gf',
      role: 'geschaeftsfuehrer',
      displayName: 'Chef',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/disconnect/550e8400-e29b-41d4-a716-446655440000',
      cookies: { pp_auth: token },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('not_found');
  });
});
