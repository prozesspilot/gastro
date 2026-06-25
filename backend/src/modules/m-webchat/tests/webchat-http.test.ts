/**
 * T068 — HTTP-Tests für das Web-Chat-Widget (Staff + öffentliche Token-Routen).
 *
 * Muster wie wizard-http.test.ts: minimale Fastify-Instanz, Mock-Pool mit
 * BEGIN/COMMIT-Sequenz. Mail läuft im Test im Dry-Run (kein SMTP konfiguriert).
 * Die SQL-/RLS-Korrektheit selbst deckt der echte-DB-Integrationstest ab
 * (src/__tests__/integration/webchat-sessions.test.ts).
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
    expires_at: null, // unbefristet (dauerhafter Kanal)
    revoked_at: null,
    last_activity_at: new Date().toISOString(),
    ...overrides,
  };
}

interface MockOpts {
  /** Rückgabe für get_chat_session_by_token (null = nicht gefunden). */
  sessionByToken?: Record<string, unknown> | null;
  /** Bereits aktive Session des Tenants (Idempotenz-Pfad in createChatSession). */
  existingActive?: Record<string, unknown> | null;
  /** Rückgabe des UPDATE … status='revoked' (null = nicht gefunden / schon revoked). */
  revokedSession?: Record<string, unknown> | null;
  tenantContact?: {
    display_name: string;
    legal_name: string | null;
    contact_email: string | null;
  } | null;
  onQuery?: (sql: string) => void;
}

function makeMockPool(opts: MockOpts = {}) {
  const session = opts.sessionByToken === undefined ? makeSession() : opts.sessionByToken;
  const tenant =
    opts.tenantContact === undefined
      ? {
          display_name: 'Pizzeria Bella',
          legal_name: 'Bella GmbH',
          contact_email: 'wirt@example.com',
        }
      : opts.tenantContact;
  const revoked =
    opts.revokedSession === undefined ? makeSession({ status: 'revoked' }) : opts.revokedSession;

  const mockClient = {
    query: vi.fn(async (sql: string) => {
      opts.onQuery?.(sql);
      if (sql.includes('INSERT INTO chat_sessions')) return { rows: [makeSession()] };
      if (sql.includes('UPDATE chat_sessions')) return { rows: revoked ? [revoked] : [] };
      if (sql.includes('FROM chat_sessions') && sql.includes("status = 'active'"))
        return { rows: opts.existingActive ? [opts.existingActive] : [] };
      if (sql.includes('FROM tenants WHERE id')) return { rows: tenant ? [tenant] : [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  const pool = {
    connect: vi.fn(async () => mockClient),
    query: vi.fn(async (sql: string) => {
      opts.onQuery?.(sql);
      if (sql.includes('get_chat_session_by_token')) return { rows: session ? [session] : [] };
      return { rows: [] };
    }),
  } as unknown as Pool;
  return pool;
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

// ── Staff: POST /sessions ────────────────────────────────────────────────────
describe('POST /api/v1/chat/sessions (staff)', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/chat/sessions',
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(401);
  });

  it('201 Happy-Path: neue Session + Magic-Link + Mail(dry-run), created=true', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/chat/sessions',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body);
    expect(body.created).toBe(true);
    expect(body.magic_link_url).toMatch(/\/[A-Za-z0-9_-]+$/);
    expect(body.mail).toBeDefined();
    expect(body.session.status).toBe('active');
  });

  it('Rolle support DARF einen Chat eröffnen (201) — anders als der Wizard', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/chat/sessions',
      cookies: { pp_auth: makeToken('support') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(201);
  });

  it('200 idempotent: existiert bereits ein aktiver Link → created=false', async () => {
    currentApp = await buildTestApp({ existingActive: makeSession() });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/chat/sessions',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).created).toBe(false);
  });

  it('422 wenn weder Body-Email noch contact_email vorhanden', async () => {
    currentApp = await buildTestApp({
      tenantContact: { display_name: 'X', legal_name: null, contact_email: null },
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/chat/sessions',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('missing_recipient');
  });
});

// ── Staff: POST /sessions/:id/revoke ─────────────────────────────────────────
describe('POST /api/v1/chat/sessions/:id/revoke (staff)', () => {
  it('200 + status revoked', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/revoke`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.status).toBe('revoked');
  });

  it('404 wenn Session nicht gefunden / bereits revoked', async () => {
    currentApp = await buildTestApp({ revokedSession: null });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/revoke`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(404);
  });

  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/chat/sessions/${SESSION_UUID}/revoke`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
  });
});

// ── Öffentlich: GET /:token ──────────────────────────────────────────────────
describe('GET /api/v1/chat/:token (public)', () => {
  it('404 bei unbekanntem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: null });
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/chat/${TOKEN}` });
    expect(r.statusCode).toBe(404);
  });

  it('410 bei widerrufenem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'revoked' }) });
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/chat/${TOKEN}` });
    expect(r.statusCode).toBe(410);
    expect(JSON.parse(r.body).error).toBe('revoked');
  });

  it('410 bei abgelaufenem (gesetztem) expires_at', async () => {
    currentApp = await buildTestApp({
      sessionByToken: makeSession({ expires_at: new Date(Date.now() - 86400_000).toISOString() }),
    });
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/chat/${TOKEN}` });
    expect(r.statusCode).toBe(410);
    expect(JSON.parse(r.body).error).toBe('expired');
  });

  it('200 bei gültiger (unbefristeter) Session — Token wird NICHT zurückgespiegelt', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/chat/${TOKEN}` });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.session.status).toBe('active');
    expect(body.session.expires_at).toBeNull();
    expect(body.session.token).toBeUndefined();
  });
});
