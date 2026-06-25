/**
 * T069 — HTTP-Tests für Chat-Nachrichten (Wirt-Token + Staff-Cookie).
 *
 * Mock-Pool wie webchat-http.test.ts (T068). SSE-Stream (GET /:token/events) wird
 * nur im 404-Pfad getestet (der 200-Pfad hijackt die Verbindung) — der Emit-Pfad
 * ist im DB-Integrationstest abgedeckt.
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
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-4466554400cc',
    tenant_id: TENANT_UUID,
    session_id: SESSION_UUID,
    sender_type: 'customer',
    sender_user_id: null,
    body: 'hallo',
    beleg_id: null,
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

interface MockOpts {
  sessionByToken?: Record<string, unknown> | null;
  /** getChatSessionById-Rückgabe (Staff-Pfad). null = nicht gefunden (404). */
  sessionById?: Record<string, unknown> | null;
  messages?: Record<string, unknown>[];
  chats?: Record<string, unknown>[];
}

function makeMockPool(opts: MockOpts = {}) {
  const session = opts.sessionByToken === undefined ? makeSession() : opts.sessionByToken;
  const sessionById = opts.sessionById === undefined ? makeSession() : opts.sessionById;
  const messages = opts.messages ?? [makeMessage()];
  const chats = opts.chats ?? [
    { id: SESSION_UUID, status: 'active', unread_count: 1, last_message_at: null },
  ];

  const mockClient = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO chat_messages')) return { rows: [makeMessage()] };
      if (sql.includes('UPDATE chat_messages')) return { rows: [] };
      if (sql.includes('UPDATE chat_sessions')) return { rows: [] };
      if (sql.includes('FROM chat_messages WHERE session_id')) return { rows: messages };
      if (sql.includes('FROM chat_sessions') && sql.includes('WHERE id = $1'))
        return { rows: sessionById ? [sessionById] : [] };
      if (sql.includes('last_activity_at DESC')) return { rows: chats };
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

// ── Wirt: POST /:token/messages ──────────────────────────────────────────────
describe('POST /api/v1/chat/:token/messages (Wirt)', () => {
  it('201 bei gültigem Text', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/messages`,
      payload: { text: 'Hallo ProzessPilot' },
    });
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body).message.sender_type).toBe('customer');
  });

  it('422 bei leerem Text', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/messages`,
      payload: { text: '   ' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('404 bei unbekanntem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: null });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/messages`,
      payload: { text: 'Hallo' },
    });
    expect(r.statusCode).toBe(404);
  });

  it('410 bei widerrufenem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'revoked' }) });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/${TOKEN}/messages`,
      payload: { text: 'Hallo' },
    });
    expect(r.statusCode).toBe(410);
  });
});

// ── Wirt: GET /:token/messages + /events ─────────────────────────────────────
describe('GET /api/v1/chat/:token/messages + /events (Wirt)', () => {
  it('200 liefert den Verlauf', async () => {
    currentApp = await buildTestApp({
      messages: [makeMessage(), makeMessage({ sender_type: 'staff' })],
    });
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/chat/${TOKEN}/messages` });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).messages).toHaveLength(2);
  });

  it('/events: 404 bei unbekanntem Token (Resolve vor Stream)', async () => {
    currentApp = await buildTestApp({ sessionByToken: null });
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/chat/${TOKEN}/events` });
    expect(r.statusCode).toBe(404);
  });
});

// ── Staff: GET /sessions ─────────────────────────────────────────────────────
describe('GET /api/v1/chat/sessions (Staff)', () => {
  it('200 liefert die Chat-Liste (statische Route schlägt /:token)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/chat/sessions',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(r.body).chats)).toBe(true);
  });

  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/chat/sessions',
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
  });
});

// ── Staff: Thread lesen + antworten ──────────────────────────────────────────
describe('GET /sessions/:id/messages + POST /sessions/:id/reply (Staff)', () => {
  it('Thread: 200 bei vorhandener Session', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/messages`,
      cookies: { pp_auth: makeToken('support') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
  });

  it('Thread: 404 bei fremder/unbekannter Session', async () => {
    currentApp = await buildTestApp({ sessionById: null });
    const r = await currentApp.inject({
      method: 'GET',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/messages`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(404);
  });

  it('Reply: 201 — Rolle support DARF antworten', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/reply`,
      cookies: { pp_auth: makeToken('support') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: { text: 'Wir kümmern uns drum.' },
    });
    expect(r.statusCode).toBe(201);
    // Mock liefert eine generische Nachricht zurück → hier nur „Nachricht existiert"
    // prüfen. Dass Staff-Nachrichten sender_type='staff' tragen, deckt der echte
    // DB-Integrationstest ab (webchat-messages.test.ts).
    expect(JSON.parse(r.body).message).toBeDefined();
  });

  it('Reply: 409 in widerrufene Session (Wirt erreicht sie nicht mehr)', async () => {
    currentApp = await buildTestApp({ sessionById: makeSession({ status: 'revoked' }) });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/reply`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: { text: 'Hallo?' },
    });
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error).toBe('session_not_active');
  });

  it('Reply: 422 bei leerem Text', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/reply`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: { text: '' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('Reply: 401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/reply`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: { text: 'Hi' },
    });
    expect(r.statusCode).toBe(401);
  });
});

// ── Wirt: POST /:token/belege (T070, Route-Wiring) ───────────────────────────
describe('POST /api/v1/chat/:token/belege (Wirt — Upload)', () => {
  it('404 bei unbekanntem Token (Resolve vor Datei-Parse)', async () => {
    currentApp = await buildTestApp({ sessionByToken: null });
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/chat/${TOKEN}/belege` });
    expect(r.statusCode).toBe(404);
  });

  it('410 bei widerrufenem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'revoked' }) });
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/chat/${TOKEN}/belege` });
    expect(r.statusCode).toBe(410);
  });
});
