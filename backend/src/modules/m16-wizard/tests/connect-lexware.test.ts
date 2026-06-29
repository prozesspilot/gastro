/**
 * T084 — HTTP-Tests für POST /api/v1/wizard/:token/connect/lexware.
 *
 * Mockt den Live-Check (lexware-validate.service) + den Token-Speicher
 * (booking-credentials.repository), damit weder echtes Lexware-HTTP noch pgcrypto
 * nötig sind. Mock-Pool liefert die Session für get_onboarding_session_by_token.
 */
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wizardPublicRoutes } from '../wizard.routes';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_UUID = '550e8400-e29b-41d4-a716-4466554400a0';
const TOKEN = 'Xa9Kp2nM4vQ7sR8tV1wY3zB6cD0eF5gH';

// Mutierbares Validierungs-Ergebnis (pro Test umstellbar) + Spy auf den Token-Speicher.
const h = vi.hoisted(() => ({
  validation: { ok: true, companyName: 'Pizzeria Bella GmbH' } as
    | { ok: true; companyName: string | null }
    | { ok: false; reason: 'rejected' | 'unreachable'; message: string },
  upsertSpy: vi.fn(async (..._args: unknown[]) => ({ id: 'cred-1' })),
}));

vi.mock('../services/lexware-validate.service', () => ({
  validateLexwareToken: vi.fn(async () => h.validation),
}));
vi.mock('../../m05-lexoffice/services/booking-credentials.repository', () => ({
  upsertBookingCredential: (...args: unknown[]) => h.upsertSpy(...(args as [])),
}));

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_UUID,
    tenant_id: TENANT_UUID,
    token: TOKEN,
    status: 'started',
    current_step: 3,
    step_data: {},
    premium_setup_requested: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    completed_at: null,
    last_activity_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockPool(sessionByToken: Record<string, unknown> | null | undefined) {
  const session = sessionByToken === undefined ? makeSession() : sessionByToken;
  return {
    connect: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('get_onboarding_session_by_token'))
        return { rows: session ? [session] : [] };
      return { rows: [] };
    }),
  } as unknown as Pool;
}

async function buildTestApp(sessionByToken?: Record<string, unknown> | null) {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool(sessionByToken));
  app.decorate('redis', { set: vi.fn(), getdel: vi.fn() } as never);
  await app.register(wizardPublicRoutes, { prefix: '/api/v1/wizard' });
  await app.ready();
  return app;
}

let currentApp: Awaited<ReturnType<typeof buildTestApp>> | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  h.validation = { ok: true, companyName: 'Pizzeria Bella GmbH' };
});
afterEach(async () => {
  if (currentApp) {
    await currentApp.close();
    currentApp = null;
  }
});

const url = `/api/v1/wizard/${TOKEN}/connect/lexware`;

describe('POST /api/v1/wizard/:token/connect/lexware', () => {
  it('404 bei unbekanntem Token', async () => {
    currentApp = await buildTestApp(null);
    const r = await currentApp.inject({
      method: 'POST',
      url,
      payload: { api_token: 'tokenabcdef' },
    });
    expect(r.statusCode).toBe(404);
    expect(h.upsertSpy).not.toHaveBeenCalled();
  });

  it('410 bei abgelaufener Session', async () => {
    currentApp = await buildTestApp(
      makeSession({ expires_at: new Date(Date.now() - 86400_000).toISOString() }),
    );
    const r = await currentApp.inject({
      method: 'POST',
      url,
      payload: { api_token: 'tokenabcdef' },
    });
    expect(r.statusCode).toBe(410);
  });

  it('409 wenn Session bereits abgeschlossen', async () => {
    currentApp = await buildTestApp(makeSession({ status: 'completed' }));
    const r = await currentApp.inject({
      method: 'POST',
      url,
      payload: { api_token: 'tokenabcdef' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('422 bei zu kurzem Token (Schema)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({ method: 'POST', url, payload: { api_token: 'kurz' } });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('validation_error');
    expect(h.upsertSpy).not.toHaveBeenCalled();
  });

  it('422 wenn der Body ein tenant_id schmuggeln will (.strict — Isolation festgenagelt)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url,
      payload: { api_token: 'tokenabcdef', tenant_id: '00000000-0000-0000-0000-000000000999' },
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('validation_error');
    // Der Tenant kommt AUSSCHLIESSLICH aus der Session, nie aus dem Body → nichts gespeichert.
    expect(h.upsertSpy).not.toHaveBeenCalled();
  });

  it('422 token_rejected wenn Lexware den Key ablehnt', async () => {
    h.validation = { ok: false, reason: 'rejected', message: 'abgelehnt' };
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url,
      payload: { api_token: 'tokenabcdef' },
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('token_rejected');
    // Bei abgelehntem Token wird NICHTS gespeichert.
    expect(h.upsertSpy).not.toHaveBeenCalled();
  });

  it('502 lexware_unreachable bei Netz-/Serverproblem', async () => {
    h.validation = { ok: false, reason: 'unreachable', message: 'nicht erreichbar' };
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url,
      payload: { api_token: 'tokenabcdef' },
    });
    expect(r.statusCode).toBe(502);
    expect(JSON.parse(r.body).error).toBe('lexware_unreachable');
    expect(h.upsertSpy).not.toHaveBeenCalled();
  });

  it('200 Happy-Path: speichert verschlüsselt (Customer-Actor) + gibt company_name zurück', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url,
      payload: { api_token: 'gueltigertoken123', display_name: 'Kanzlei Müller' },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.ok).toBe(true);
    expect(body.company_name).toBe('Pizzeria Bella GmbH');
    // Der Klartext-Token darf NICHT zurückgespiegelt werden.
    expect(r.body).not.toContain('gueltigertoken123');

    expect(h.upsertSpy).toHaveBeenCalledTimes(1);
    const arg = h.upsertSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(arg.tenantId).toBe(TENANT_UUID);
    expect(arg.provider).toBe('lexware_office');
    expect(arg.apiTokenPlaintext).toBe('gueltigertoken123');
    expect(arg.actor).toEqual({ type: 'customer', id: null });
  });
});
