/**
 * T016 — HTTP-Tests für den Onboarding-Wizard (Staff + öffentliche Token-Routen).
 *
 * Muster wie update-delete.handler.test.ts: minimale Fastify-Instanz, Mock-Pool
 * mit BEGIN/COMMIT-Sequenz. Mail läuft im Test im Dry-Run (kein SMTP konfiguriert).
 * Die SQL-/RLS-Korrektheit selbst deckt der echte-DB-Integrationstest ab
 * (src/__tests__/integration/onboarding-wizard.test.ts).
 */
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signM14Token } from '../../m14-auth/m14-jwt';
import { wizardPublicRoutes, wizardStaffRoutes } from '../wizard.routes';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const STAFF_UUID = '550e8400-e29b-41d4-a716-446655440099';
const SESSION_UUID = '550e8400-e29b-41d4-a716-4466554400a0';
const TOKEN = 'Xa9Kp2nM4vQ7sR8tV1wY3zB6cD0eF5gH';

function makeToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({ userId: STAFF_UUID, discordId: 'discord-test', role, displayName: 'Test' });
}

function makeSession(overrides: Record<string, unknown> = {}) {
  const inThirtyDays = new Date(Date.now() + 30 * 86400_000).toISOString();
  return {
    id: SESSION_UUID,
    tenant_id: TENANT_UUID,
    token: TOKEN,
    status: 'started',
    current_step: 1,
    step_data: {},
    premium_setup_requested: false,
    created_at: new Date().toISOString(),
    expires_at: inThirtyDays,
    completed_at: null,
    last_activity_at: new Date().toISOString(),
    ...overrides,
  };
}

interface MockOpts {
  /** Rückgabe für get_onboarding_session_by_token (null = nicht gefunden). */
  sessionByToken?: Record<string, unknown> | null;
  tenantContact?: {
    display_name: string;
    legal_name: string | null;
    contact_email: string | null;
  } | null;
  /** Optionaler Spy: bekommt jedes ausgeführte SQL (für Query-Assertions). */
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

  const mockClient = {
    query: vi.fn(async (sql: string) => {
      opts.onQuery?.(sql);
      if (sql.includes('FROM tenants WHERE id')) return { rows: tenant ? [tenant] : [] };
      if (sql.includes('INSERT INTO onboarding_sessions')) return { rows: [makeSession()] };
      if (sql.includes('UPDATE onboarding_sessions')) {
        // Spiegelt den jeweiligen Statuswechsel grob wider.
        if (sql.includes("status = 'completed'"))
          return { rows: [makeSession({ status: 'completed' })] };
        if (sql.includes("status = 'premium_handoff'"))
          return {
            rows: [makeSession({ status: 'premium_handoff', premium_setup_requested: true })],
          };
        return { rows: [makeSession({ current_step: 2 })] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  const pool = {
    connect: vi.fn(async () => mockClient),
    query: vi.fn(async (sql: string) => {
      opts.onQuery?.(sql);
      if (sql.includes('get_onboarding_session_by_token'))
        return { rows: session ? [session] : [] };
      return { rows: [] };
    }),
  } as unknown as Pool;
  return pool;
}

async function buildTestApp(opts: MockOpts = {}) {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool(opts));
  await app.register(fastifyCookie);
  await app.register(wizardStaffRoutes, { prefix: '/api/v1/wizard' });
  await app.register(wizardPublicRoutes, { prefix: '/api/v1/wizard' });
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
describe('POST /api/v1/wizard/sessions (staff)', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/wizard/sessions',
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(401);
  });

  it('403 für Rolle support', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/wizard/sessions',
      cookies: { pp_auth: makeToken('support') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(403);
  });

  it('422 wenn weder Body-Email noch contact_email vorhanden', async () => {
    currentApp = await buildTestApp({
      tenantContact: { display_name: 'X', legal_name: null, contact_email: null },
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/wizard/sessions',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('missing_recipient');
  });

  it('201 Happy-Path: Session + Magic-Link + Mail(dry-run)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/wizard/sessions',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
      payload: {},
    });
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body);
    // Magic-Link endet auf /<token> (Token-Format Base64URL).
    expect(body.magic_link_url).toMatch(/\/[A-Za-z0-9_-]+$/);
    // Mail ist best-effort (Dry-Run lokal vs. CI uneinheitlich) → nur prüfen, dass
    // der Endpoint sie anstößt; Versand/Dry-Run selbst deckt mail.service.test.ts ab.
    expect(body.mail).toBeDefined();
    expect(body.session.status).toBe('started');
  });
});

// ── Öffentlich: GET /:token ──────────────────────────────────────────────────
describe('GET /api/v1/wizard/:token (public)', () => {
  it('404 bei unbekanntem Token', async () => {
    currentApp = await buildTestApp({ sessionByToken: null });
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/wizard/${TOKEN}` });
    expect(r.statusCode).toBe(404);
  });

  it('410 bei abgelaufenem Token', async () => {
    currentApp = await buildTestApp({
      sessionByToken: makeSession({ expires_at: new Date(Date.now() - 86400_000).toISOString() }),
    });
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/wizard/${TOKEN}` });
    expect(r.statusCode).toBe(410);
    expect(JSON.parse(r.body).error).toBe('expired');
  });

  it('200 bei gültiger Session — Token wird NICHT zurückgespiegelt', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({ method: 'GET', url: `/api/v1/wizard/${TOKEN}` });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.session.current_step).toBe(1);
    expect(body.session.token).toBeUndefined();
  });
});

// ── Öffentlich: POST /:token/step/:n ─────────────────────────────────────────
describe('POST /api/v1/wizard/:token/step/:n (public)', () => {
  const validStep1 = {
    firmenname: 'Pizzeria Bella',
    rechtsform: 'einzelunternehmen',
    inhaber: 'Mario Rossi',
    strasse: 'Hauptstr. 1',
    plz: '29614',
    stadt: 'Soltau',
    steuernummer: '11/123/45678',
    telefon: '0151 1234567',
    email: 'mario@bella.de',
    branche: 'restaurant',
    mitarbeiter_anzahl: 5,
    belegvolumen_monat: 120,
  };

  it('400 bei Step außerhalb 1–7', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/wizard/${TOKEN}/step/9`,
      payload: validStep1,
    });
    expect(r.statusCode).toBe(400);
  });

  it('422 bei ungültigen Step-1-Daten (PLZ falsch)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/wizard/${TOKEN}/step/1`,
      payload: { ...validStep1, plz: 'abc' },
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('validation_error');
  });

  it('409 wenn Session nicht mehr editierbar (completed)', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'completed' }) });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/wizard/${TOKEN}/step/1`,
      payload: validStep1,
    });
    expect(r.statusCode).toBe(409);
  });

  it('200 bei gültigem Step 1', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/wizard/${TOKEN}/step/1`,
      payload: validStep1,
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.current_step).toBe(2);
  });

  it('T066: Step 1 löst UPDATE tenants … onboarding_status=activated aus', async () => {
    const seen: string[] = [];
    currentApp = await buildTestApp({ onQuery: (s) => seen.push(s) });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/wizard/${TOKEN}/step/1`,
      payload: validStep1,
    });
    expect(r.statusCode).toBe(200);
    const activated = seen.some(
      (s) => /update\s+tenants/i.test(s) && /onboarding_status\s*=\s*'activated'/i.test(s),
    );
    expect(activated).toBe(true);
  });
});

// ── Öffentlich: complete + premium ───────────────────────────────────────────
describe('POST /api/v1/wizard/:token/complete + /premium (public)', () => {
  it('complete: 200 + Status completed', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/wizard/${TOKEN}/complete` });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.status).toBe('completed');
  });

  it('complete: idempotent wenn bereits completed', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'completed' }) });
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/wizard/${TOKEN}/complete` });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).session.status).toBe('completed');
  });

  it('premium: 200 + Status premium_handoff', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/wizard/${TOKEN}/premium` });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.session.status).toBe('premium_handoff');
    expect(body.session.premium_setup_requested).toBe(true);
  });

  it('premium: 409 wenn bereits completed', async () => {
    currentApp = await buildTestApp({ sessionByToken: makeSession({ status: 'completed' }) });
    const r = await currentApp.inject({ method: 'POST', url: `/api/v1/wizard/${TOKEN}/premium` });
    expect(r.statusCode).toBe(409);
  });
});
