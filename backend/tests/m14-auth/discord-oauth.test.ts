/**
 * M14 — Discord-OAuth-Backend Tests
 *
 * Testet:
 *   - GET /api/v1/auth/discord/login  → 302, Location enthält discord.com, State in Redis
 *   - GET /api/v1/auth/discord/callback (gültig) → 302, Cookie pp_auth gesetzt
 *   - GET /api/v1/auth/discord/callback (ungültiger State) → 400
 *   - GET /api/v1/auth/discord/callback (User nicht im Guild) → 403 not_in_guild
 *   - GET /api/v1/auth/discord/callback (Discord-API-Fehler) → 502
 *   - JWT-Token enthält korrekte Claims (sub, discord_id, role, display_name)
 *
 * Mocking-Strategie:
 *   - discord.service.ts-Funktionen werden via vi.mock vollständig gemockt.
 *   - Redis wird als Map-basierter In-Memory-Mock implementiert (kein echter Redis).
 *   - DB (pg Pool) wird gemockt — kein echter DB-Zugriff nötig.
 *   - Fastify wird isoliert gebaut (nicht buildApp()) um externe Abhängigkeiten zu vermeiden.
 *
 * DECISION: Wir bauen eine isolierte Fastify-Instanz statt buildApp() zu nutzen,
 * analog zu sumup-oauth.test.ts. Das verhindert Timeouts durch fehlenden Redis-Server
 * in CI/lokal ohne laufende Infrastruktur.
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Discord-Service-Mock ────────────────────────────────────────────────────
vi.mock('../../src/modules/m14-auth/discord.service', () => ({
  buildDiscordAuthUrl: (state: string) =>
    `https://discord.com/oauth2/authorize?client_id=test&state=${state}`,
  exchangeCodeForTokens: vi.fn(),
  fetchDiscordUser: vi.fn(),
  checkGuildMembership: vi.fn(),
  mapDiscordRoleToInternalRole: vi.fn().mockReturnValue('mitarbeiter'),
  DiscordApiError: class DiscordApiError extends Error {
    httpStatus: number;
    discordErrorBody: string;
    constructor(message: string, httpStatus: number, discordErrorBody: string) {
      super(message);
      this.name = 'DiscordApiError';
      this.httpStatus = httpStatus;
      this.discordErrorBody = discordErrorBody;
    }
  },
}));

// ── users.repository-Mock ───────────────────────────────────────────────────
vi.mock('../../src/modules/m14-auth/users.repository', () => ({
  upsertDiscordUser: vi.fn(),
  getUserById: vi.fn(),
  createAuthSession: vi.fn().mockResolvedValue(undefined),
  logAuthEvent: vi.fn().mockResolvedValue(undefined),
}));

// Nach den mocks importieren
import { discordAuthRoutes } from '../../src/modules/m14-auth/auth.routes';
import {
  type DiscordApiError as DiscordApiErrorType,
  checkGuildMembership,
  exchangeCodeForTokens,
  fetchDiscordUser,
  mapDiscordRoleToInternalRole,
} from '../../src/modules/m14-auth/discord.service';
import { verifyM14Token } from '../../src/modules/m14-auth/m14-jwt';
import { upsertDiscordUser } from '../../src/modules/m14-auth/users.repository';

// ── Test-Fixtures ───────────────────────────────────────────────────────────

const MOCK_DISCORD_USER = {
  id: '123456789012345678',
  username: 'testuser',
  discriminator: '0001',
  avatar: 'abc123',
  global_name: 'Test User',
};

const MOCK_GUILD_MEMBER = {
  user: MOCK_DISCORD_USER,
  roles: ['987654321098765432'], // keine GF-Rolle
  nick: null,
  joined_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_TOKENS = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 604800, // 7 Tage
  token_type: 'Bearer',
  scope: 'identify guilds',
};

const MOCK_DB_USER = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  discord_user_id: MOCK_DISCORD_USER.id,
  discord_username: MOCK_DISCORD_USER.username,
  discord_avatar_url: `https://cdn.discordapp.com/avatars/${MOCK_DISCORD_USER.id}/abc123.png`,
  display_name: 'Test User',
  role: 'mitarbeiter' as const,
  active: true,
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null,
  last_login_method: null,
  preferences: {},
};

// ── In-Memory-Redis-Mock ────────────────────────────────────────────────────

/**
 * Erstellt einen Map-basierten Redis-Mock der die im discord-oauth-Flow
 * benötigten Commands implementiert: set, get, getdel, disconnect.
 * Kein echter Redis-Server erforderlich.
 */
function createMockRedis(): InstanceType<typeof Redis> {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    getdel: vi.fn(async (key: string) => {
      const val = store.get(key) ?? null;
      store.delete(key);
      return val;
    }),
    disconnect: vi.fn(),
    // Expose store for test assertions
    _store: store,
  } as unknown as InstanceType<typeof Redis>;
}

// ── Isolierter App-Builder ──────────────────────────────────────────────────

async function buildTestApp() {
  const app = Fastify({ logger: false });

  // Mock-DB (pg Pool) — alle Queries erfolgreich
  const mockPool = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  } as unknown as Pool;

  // Mock-Redis (Map-basiert, kein echter Redis-Server nötig)
  const mockRedis = createMockRedis();

  app.decorate('db', mockPool);
  app.decorate('redis', mockRedis);

  await app.register(fastifyCookie);
  await app.register(discordAuthRoutes, { prefix: '/api/v1' });

  await app.ready();
  return { app, mockPool, mockRedis };
}

// ── Hilfsfunktion: State in Redis-Mock setzen ───────────────────────────────

async function setValidStateInRedis(
  mockRedis: InstanceType<typeof Redis>,
  state: string,
): Promise<void> {
  // Direkt in den internen Store schreiben (umgeht vi.fn-Tracking)
  (mockRedis as unknown as { _store: Map<string, string> })._store.set(
    `discord:oauth:state:${state}`,
    '1',
  );
}

// ── Setup ───────────────────────────────────────────────────────────────────

let testEnv: Awaited<ReturnType<typeof buildTestApp>>;

beforeEach(async () => {
  vi.clearAllMocks();

  // Standard-Mocks wiederherstellen
  vi.mocked(exchangeCodeForTokens).mockResolvedValue(MOCK_TOKENS);
  vi.mocked(fetchDiscordUser).mockResolvedValue(MOCK_DISCORD_USER);
  vi.mocked(checkGuildMembership).mockResolvedValue(MOCK_GUILD_MEMBER);
  vi.mocked(mapDiscordRoleToInternalRole).mockReturnValue('mitarbeiter');
  vi.mocked(upsertDiscordUser).mockResolvedValue(MOCK_DB_USER);

  // Frische App-Instanz pro Test (isolierter Redis-Store)
  testEnv = await buildTestApp();
});

afterEach(async () => {
  await testEnv.app.close();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/discord/login', () => {
  it('gibt 302-Redirect zu discord.com zurück', async () => {
    const { app } = testEnv;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/login',
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(typeof location).toBe('string');
    expect(location).toContain('discord.com');
  });

  it('enthält state-Parameter in der Location-URL', async () => {
    const { app } = testEnv;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/login',
    });

    const location = res.headers.location as string;
    expect(location).toContain('state=');
    const stateMatch = location.match(/state=([^&]+)/);
    expect(stateMatch).not.toBeNull();
    expect((stateMatch?.[1] ?? '').length).toBeGreaterThan(10);
  });

  it('speichert den State in Redis', async () => {
    const { app, mockRedis } = testEnv;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/login',
    });

    const location = res.headers.location as string;
    const stateMatch = location.match(/state=([^&]+)/);
    const state = stateMatch?.[1] ?? '';

    // set() sollte mit dem State-Key aufgerufen worden sein
    expect(mockRedis.set).toHaveBeenCalledWith(`discord:oauth:state:${state}`, '1', 'EX', 300);
  });
});

describe('GET /api/v1/auth/discord/callback — gültiger Flow', () => {
  it('gibt 302-Redirect zurück und setzt pp_auth-Cookie', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'valid-test-state-abc123';
    await setValidStateInRedis(mockRedis, state);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);

    const cookieHeader = res.headers['set-cookie'];
    expect(cookieHeader).toBeDefined();
    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : (cookieHeader ?? '');
    expect(cookieStr).toContain('pp_auth=');
    expect(cookieStr).toContain('HttpOnly');
    // sameSite: 'lax' ist Pflicht für OAuth-Redirects (#66, Discord-OAuth-Loop-Fix).
    // 'strict' würde das pp_auth-Cookie beim Redirect von Discord nicht senden.
    expect(cookieStr).toContain('SameSite=Lax');
  });

  it('löscht State aus Redis nach Verwendung (einmalig-use)', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'one-time-state-xyz789';
    await setValidStateInRedis(mockRedis, state);

    await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    // getdel() wurde aufgerufen (atomar: GET + DELETE)
    expect(mockRedis.getdel).toHaveBeenCalledWith(`discord:oauth:state:${state}`);
    // State sollte aus dem Store gelöscht sein
    const store = (mockRedis as unknown as { _store: Map<string, string> })._store;
    expect(store.has(`discord:oauth:state:${state}`)).toBe(false);
  });

  it('JWT-Token im Cookie enthält korrekte Claims', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'jwt-claims-test-state';
    await setValidStateInRedis(mockRedis, state);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    const cookieHeader = res.headers['set-cookie'];
    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader ?? '');
    const tokenMatch = cookieStr.match(/pp_auth=([^;]+)/);
    expect(tokenMatch).not.toBeNull();
    const token = tokenMatch?.[1] ?? '';

    const result = verifyM14Token(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe(MOCK_DB_USER.id);
      expect(result.payload.discord_id).toBe(MOCK_DISCORD_USER.id);
      expect(result.payload.role).toBe('mitarbeiter');
      expect(result.payload.display_name).toBe('Test User');
      expect(result.payload.jti).toBeTruthy();
    }
  });

  it('redirectet zu / als Standard-Ziel', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'redirect-default-state';
    await setValidStateInRedis(mockRedis, state);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    expect(res.headers.location).toBe('/');
  });

  it('redirectet zu sicherer relativer URL wenn redirect-Param gesetzt', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'redirect-custom-state';
    await setValidStateInRedis(mockRedis, state);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}&redirect=/dashboard`,
    });

    expect(res.headers.location).toBe('/dashboard');
  });

  it('ignoriert unsichere absolute Redirect-URLs (verhindert Open-Redirect)', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'redirect-unsafe-state';
    await setValidStateInRedis(mockRedis, state);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}&redirect=https://evil.com`,
    });

    // Soll auf / umleiten, nicht zu evil.com
    expect(res.headers.location).toBe('/');
  });
});

describe('GET /api/v1/auth/discord/callback — ungültiger State', () => {
  it('gibt 400 zurück bei unbekanntem State', async () => {
    const { app } = testEnv;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/callback?code=some-code&state=unknown-state',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toBe('invalid_state');
  });

  it('gibt 400 zurück bei abgelaufenem State', async () => {
    const { app } = testEnv;
    // Abgelaufener State: nicht in Mock-Redis gesetzt (simuliert TTL-Ablauf)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/callback?code=some-code&state=expired-state-12345',
    });

    expect(res.statusCode).toBe(400);
  });

  it('gibt 400 zurück wenn code fehlt', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'missing-code-state';
    await setValidStateInRedis(mockRedis, state);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?state=${state}`,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toBe('missing_params');
  });

  it('gibt 400 zurück bei Discord-error-Param', async () => {
    const { app } = testEnv;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/callback?error=access_denied&error_description=User+denied+access',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; message: string };
    expect(body.error).toBe('access_denied');
    expect(body.message).toContain('denied');
  });
});

describe('GET /api/v1/auth/discord/callback — User nicht im Guild', () => {
  it('gibt 403 mit not_in_guild zurück', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'not-in-guild-state';
    await setValidStateInRedis(mockRedis, state);

    // checkGuildMembership gibt null zurück (nicht im Guild)
    vi.mocked(checkGuildMembership).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string; message: string };
    expect(body.error).toBe('not_in_guild');
    expect(body.message).toContain('ProzessPilot-Team-Server');
  });
});

describe('GET /api/v1/auth/discord/callback — Discord-API-Fehler', () => {
  it('gibt 502 zurück wenn Token-Exchange fehlschlägt', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'token-error-state';
    await setValidStateInRedis(mockRedis, state);

    // DiscordApiError importieren (gemockte Klasse)
    const { DiscordApiError } = await import('../../src/modules/m14-auth/discord.service');
    vi.mocked(exchangeCodeForTokens).mockRejectedValueOnce(
      new DiscordApiError('Token fehlgeschlagen', 400, '{"error":"invalid_grant"}'),
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=bad-code&state=${state}`,
    });

    expect(res.statusCode).toBe(502);
    const body = res.json() as { error: string };
    expect(body.error).toBe('discord_error');
  });

  it('gibt 502 zurück wenn User-Info-Abruf fehlschlägt', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'user-info-error-state';
    await setValidStateInRedis(mockRedis, state);

    const { DiscordApiError } = await import('../../src/modules/m14-auth/discord.service');
    vi.mocked(fetchDiscordUser).mockRejectedValueOnce(
      new DiscordApiError('User-Info Fehler', 401, '{"message": "401: Unauthorized"}'),
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    expect(res.statusCode).toBe(502);
  });

  it('gibt 502 zurück wenn Guild-Check fehlschlägt', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'guild-error-state';
    await setValidStateInRedis(mockRedis, state);

    const { DiscordApiError } = await import('../../src/modules/m14-auth/discord.service');
    vi.mocked(checkGuildMembership).mockRejectedValueOnce(
      new DiscordApiError('Guild-Check Fehler', 403, '{"message": "Missing Access"}'),
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    expect(res.statusCode).toBe(502);
  });
});

describe('GET /api/v1/auth/discord/callback — Account deaktiviert', () => {
  it('gibt 403 mit account_disabled zurück', async () => {
    const { app, mockRedis } = testEnv;
    const state = 'disabled-account-state';
    await setValidStateInRedis(mockRedis, state);

    // User ist inaktiv
    vi.mocked(upsertDiscordUser).mockResolvedValueOnce({
      ...MOCK_DB_USER,
      active: false,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/discord/callback?code=valid-code&state=${state}`,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('account_disabled');
  });
});

describe('verifyM14Token — JWT-Validierung', () => {
  it('verifiziert einen gültigen Token erfolgreich', async () => {
    const { signM14Token } = await import('../../src/modules/m14-auth/m14-jwt');
    const token = signM14Token({
      userId: 'test-uuid-1234',
      discordId: '987654321',
      role: 'geschaeftsfuehrer',
      displayName: 'Steve',
    });

    const result = verifyM14Token(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('test-uuid-1234');
      expect(result.payload.discord_id).toBe('987654321');
      expect(result.payload.role).toBe('geschaeftsfuehrer');
      expect(result.payload.display_name).toBe('Steve');
      expect(result.payload.jti).toBeTruthy();
      // exp sollte ~24h in der Zukunft liegen
      const nowSeconds = Math.floor(Date.now() / 1000);
      expect(result.payload.exp).toBeGreaterThan(nowSeconds + 86000);
      expect(result.payload.exp).toBeLessThan(nowSeconds + 87000);
    }
  });

  it('lehnt einen manipulierten Token ab', async () => {
    const { signM14Token } = await import('../../src/modules/m14-auth/m14-jwt');
    const token = signM14Token({
      userId: 'test-uuid',
      discordId: '123',
      role: 'mitarbeiter',
      displayName: 'Test',
    });

    // Token manipulieren: mittleren Teil (Payload) verändern
    const parts = token.split('.');
    const tamperedPayload = Buffer.from('{"sub":"hacker"}').toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = verifyM14Token(tamperedToken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID');
    }
  });

  it('lehnt einen abgelaufenen Token ab', async () => {
    const { config } = await import('../../src/core/config');
    const jwtLib = await import('jsonwebtoken');
    const secret =
      config.JWT_SECRET.length >= 32
        ? config.JWT_SECRET
        : 'dev-jwt-secret-do-not-use-in-production-padding-padding';
    const pastExp = Math.floor(Date.now() / 1000) - 3600;

    // biome-ignore lint/suspicious/noExplicitAny: Test-Util — direktes JWT-Sign mit exp in Payload
    const expiredToken = (jwtLib as any).default.sign(
      {
        sub: 'test-id',
        discord_id: '123',
        role: 'mitarbeiter',
        display_name: 'Test',
        jti: 'test-jti',
        iat: pastExp - 86400,
        exp: pastExp,
      },
      secret,
      { algorithm: 'HS256' },
    );

    const result = verifyM14Token(expiredToken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('EXPIRED');
    }
  });
});
