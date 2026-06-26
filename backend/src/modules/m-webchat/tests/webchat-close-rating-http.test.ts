/**
 * T075 — HTTP-Tests für „Chat beenden" + „Bewertung" (Mock-Pool, kein DB).
 *
 * Deckt die Handler-Entscheidungen ab: Wirt-Close (idempotent/404/410), Wirt-
 * Rating (409 nicht-beendet / 409 bereits-bewertet / 422 / 200) und Staff-Close
 * (401/404/409/200). Das echte DB-Verhalten (Audit, DEFINER-Fn, Doppel-Gate)
 * deckt webchat-close-rating.test.ts ab.
 */
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signM14Token } from '../../m14-auth/m14-jwt';
import { chatPublicRoutes, chatStaffRoutes } from '../webchat.routes';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const STAFF_UUID = '550e8400-e29b-41d4-a716-446655440099';
const SESSION_UUID = '550e8400-e29b-41d4-a716-4466554400b0';
const TOKEN = 'Xa9Kp2nM4vQ7sR8tV1wY3zB6cD0eF5gH';

function makeToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({ userId: STAFF_UUID, discordId: 'discord-test', role, displayName: 'Test' });
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_UUID,
    tenant_id: TENANT_UUID,
    token: TOKEN,
    status: 'active',
    trigger_type: 'staff_manual',
    trigger_reference_id: null,
    created_at: new Date().toISOString(),
    expires_at: null,
    revoked_at: null,
    last_activity_at: new Date().toISOString(),
    closed_at: null,
    closed_by: null,
    rating: null,
    rating_comment: null,
    rated_at: null,
    ...overrides,
  };
}

interface MockOpts {
  sessionByToken?: Record<string, unknown> | null;
  sessionById?: Record<string, unknown> | null;
  /** Rückgabe des close-UPDATE (null = kein Row → nicht aktiv). */
  closeUpdateRow?: Record<string, unknown> | null;
  /** Rückgabe des rating-UPDATE (null = kein Row → bereits bewertet/nicht closed). */
  rateUpdateRow?: Record<string, unknown> | null;
}

function makeMockPool(opts: MockOpts = {}) {
  const session = opts.sessionByToken === undefined ? makeSession() : opts.sessionByToken;
  const sessionById = opts.sessionById === undefined ? makeSession() : opts.sessionById;
  const closeRow =
    opts.closeUpdateRow === undefined
      ? makeSession({
          status: 'closed',
          closed_by: 'customer',
          closed_at: new Date().toISOString(),
        })
      : opts.closeUpdateRow;
  const rateRow =
    opts.rateUpdateRow === undefined
      ? makeSession({
          status: 'closed',
          rating: 5,
          rating_comment: 'Top',
          rated_at: new Date().toISOString(),
        })
      : opts.rateUpdateRow;

  const mockClient = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SET status = 'closed'")) return { rows: closeRow ? [closeRow] : [] };
      if (sql.includes('SET rating')) return { rows: rateRow ? [rateRow] : [] };
      if (sql.includes('INSERT INTO audit_log')) return { rows: [] };
      if (sql.includes('FROM chat_sessions') && sql.includes('WHERE id = $1'))
        return { rows: sessionById ? [sessionById] : [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  return {
    connect: vi.fn(async () => mockClient),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('get_chat_session_by_token')) return { rows: session ? [session] : [] };
      return { rows: [] };
    }),
  } as unknown as Pool;
}

async function buildTestApp(opts: MockOpts = {}) {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool(opts));
  await app.register(fastifyCookie);
  await app.register(chatStaffRoutes, { prefix: '/api/v1/chat' });
  await app.register(chatPublicRoutes, { prefix: '/api/v1/chat' });
  await app.ready();
  return app;
}

let currentApp: Awaited<ReturnType<typeof buildTestApp>> | null = null;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  if (currentApp) {
    await currentApp.close();
    currentApp = null;
  }
});

// ── Wirt: POST /:token/close ─────────────────────────────────────────────────
describe('POST /api/v1/chat/:token/close (Wirt)', () => {
  it('200 beendet eine aktive Session (→ status closed)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/chat/${TOKEN}/close` });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.status).toBe('closed');
  });

  it('200 idempotent bei bereits beendeter Session', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'closed' }) });
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/chat/${TOKEN}/close` });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.status).toBe('closed');
  });

  it('404 bei unbekanntem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: null });
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/chat/${TOKEN}/close` });
    expect(r.statusCode).toBe(404);
  });

  it('410 bei widerrufenem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'revoked' }) });
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/chat/${TOKEN}/close` });
    expect(r.statusCode).toBe(410);
  });
});

// ── Wirt: POST /:token/rating ────────────────────────────────────────────────
describe('POST /api/v1/chat/:token/rating (Wirt)', () => {
  it('200 bewertet eine beendete, unbewertete Session', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'closed' }) });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/rating`,
      payload: { stars: 5, comment: 'Top' },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.rating).toBe(5);
  });

  it('409 wenn die Session noch aktiv ist (nicht beendet)', async () => {
    currentApp = await buildTestApp(); // aktive Session
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/rating`,
      payload: { stars: 4 },
    });
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error).toBe('session_not_closed');
  });

  it('409 wenn bereits bewertet', async () => {
    currentApp = await buildTestApp({
      sessionByToken: makeSession({ status: 'closed', rating: 3 }),
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/rating`,
      payload: { stars: 5 },
    });
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error).toBe('already_rated');
  });

  it('422 bei ungültiger Sterne-Zahl', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'closed' }) });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/rating`,
      payload: { stars: 9 },
    });
    expect(r.statusCode).toBe(422);
  });

  it('410 bei widerrufenem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'revoked' }) });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/rating`,
      payload: { stars: 5 },
    });
    expect(r.statusCode).toBe(410);
  });
});

// ── Staff: POST /sessions/:id/close ──────────────────────────────────────────
describe('POST /api/v1/chat/sessions/:id/close (Staff)', () => {
  it('200 beendet eine aktive Session', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/close`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.status).toBe('closed');
  });

  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/close`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
  });

  it('404 bei fremder/unbekannter Session', async () => {
    currentApp = await buildTestApp({ closeUpdateRow: null, sessionById: null });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/close`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(404);
  });

  it('200 idempotent bei bereits beendeter Session', async () => {
    currentApp = await buildTestApp({
      closeUpdateRow: null,
      sessionById: makeSession({ status: 'closed' }),
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/close`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.status).toBe('closed');
  });

  it('409 bei widerrufener Session', async () => {
    currentApp = await buildTestApp({
      closeUpdateRow: null,
      sessionById: makeSession({ status: 'revoked' }),
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/close`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error).toBe('session_not_active');
  });
});
