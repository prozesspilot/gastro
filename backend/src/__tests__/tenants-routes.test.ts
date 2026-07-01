/**
 * T058/A3 — Handler-Tests für GET /api/v1/tenants.
 * DB-Pool gemockt (kein echtes Postgres); m14-JWT signiert.
 * (Liegt in src/__tests__/, weil der vitest-include src/routes/ nicht erfasst.)
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signM14Token } from '../modules/m14-auth/m14-jwt';
import { tenantsRoutes } from '../routes/tenants.routes';

const STAFF_UUID = '550e8400-e29b-41d4-a716-446655440099';

function makeToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({ userId: STAFF_UUID, discordId: 'discord-test', role, displayName: 'Test' });
}

const SAMPLE = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'almaz',
    display_name: 'Almaz Gastro',
    package: 'standard',
    deletion_status: 'active',
    onboarding_status: 'activated',
  },
];

function makePool(rows: unknown[]): Pool {
  return { query: vi.fn(async () => ({ rows })) } as unknown as Pool;
}

async function buildApp(rows: unknown[]) {
  const app = Fastify({ logger: false });
  app.decorate('db', makePool(rows));
  await app.register(fastifyCookie);
  await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
  await app.ready();
  return app;
}

let current: Awaited<ReturnType<typeof buildApp>> | null = null;
afterEach(async () => {
  if (current) {
    await current.close();
    current = null;
  }
});

describe('GET /api/v1/tenants', () => {
  it('401 ohne Cookie', async () => {
    current = await buildApp(SAMPLE);
    const r = await current.inject({ method: 'GET', url: '/api/v1/tenants' });
    expect(r.statusCode).toBe(401);
  });

  it('200 + Mandanten-Liste mit gültigem Cookie', async () => {
    current = await buildApp(SAMPLE);
    const r = await current.inject({
      method: 'GET',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken() },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].slug).toBe('almaz');
    expect(body.data[0].display_name).toBe('Almaz Gastro');
    expect(body.data[0].onboarding_status).toBe('activated');
  });

  it('200 + leere Liste, wenn keine Mandanten existieren', async () => {
    current = await buildApp([]);
    const r = await current.inject({
      method: 'GET',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken() },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body).toEqual({ ok: true, data: [] });
  });

  it('liest über die SECURITY-DEFINER-Funktion, nicht direkt aus tenants', async () => {
    current = await buildApp(SAMPLE);
    const pool = current.db as unknown as { query: ReturnType<typeof vi.fn> };
    await current.inject({
      method: 'GET',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
    });
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('list_tenants_for_staff()');
    expect(sql).not.toMatch(/FROM\s+tenants\b/i);
  });
});

// ── T093: POST /api/v1/tenants (Mandanten-Anlage) ────────────────────────────

/** Pool, dessen query() frei steuerbar ist (Row liefern / Fehler werfen). */
function buildAppWithQuery(
  queryImpl: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>,
) {
  const pool = { query: vi.fn(queryImpl) } as unknown as Pool;
  const app = Fastify({ logger: false });
  app.decorate('db', pool);
  return { app, pool: pool as unknown as { query: ReturnType<typeof vi.fn> } };
}

async function readyApp(app: ReturnType<typeof buildAppWithQuery>['app']) {
  await app.register(fastifyCookie);
  await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
  await app.ready();
  return app;
}

/** create_tenant_for_staff-Row spiegelt den übergebenen Slug (params[0]) zurück. */
function tenantRowFor(slug: string) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    slug,
    display_name: 'Neuer Wirt',
    package: 'standard',
    deletion_status: 'active',
    onboarding_status: 'pending',
  };
}

describe('POST /api/v1/tenants', () => {
  it('401 ohne Cookie', async () => {
    const { app } = buildAppWithQuery(async () => ({ rows: [] }));
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { display_name: 'Neuer Wirt' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('403 für Support-Rolle (read-only)', async () => {
    const { app } = buildAppWithQuery(async () => ({ rows: [] }));
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('support') },
      payload: { display_name: 'Neuer Wirt' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('422 bei zu kurzem Firmennamen', async () => {
    const { app, pool } = buildAppWithQuery(async () => ({ rows: [] }));
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      payload: { display_name: 'ab' },
    });
    expect(r.statusCode).toBe(422);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('422 bei ungültiger E-Mail', async () => {
    const { app } = buildAppWithQuery(async () => ({ rows: [] }));
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      payload: { display_name: 'Zur Post', contact_email: 'keine-mail' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('201 + generierter Slug aus dem Namen, Anlage über create_tenant_for_staff()', async () => {
    const { app, pool } = buildAppWithQuery(async (_sql, params) => ({
      rows: [tenantRowFor(params[0] as string)],
    }));
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      payload: { display_name: 'Pizzeria Bella Italia', package: 'pro' },
    });
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body);
    expect(body.ok).toBe(true);
    expect(body.data.slug).toBe('pizzeria-bella-italia');
    // Schreibt über die DEFINER-Funktion, nicht per direktem INSERT.
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('create_tenant_for_staff(');
    expect(sql).not.toMatch(/INSERT\s+INTO\s+tenants/i);
    // Package landet als 6. Parameter.
    expect(pool.query.mock.calls[0][1][5]).toBe('pro');
  });

  it('nutzt einen explizit angegebenen Slug unverändert', async () => {
    const { app, pool } = buildAppWithQuery(async (_sql, params) => ({
      rows: [tenantRowFor(params[0] as string)],
    }));
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      payload: { display_name: 'Irgendwas Anderes', slug: 'mein-wunsch-slug' },
    });
    expect(r.statusCode).toBe(201);
    expect(pool.query.mock.calls[0][1][0]).toBe('mein-wunsch-slug');
  });

  it('hängt bei Slug-Kollision (auto) einen Suffix an und legt dann an', async () => {
    let call = 0;
    const { app, pool } = buildAppWithQuery(async (_sql, params) => {
      call += 1;
      if (call === 1) {
        // erster Versuch kollidiert (UNIQUE-Verletzung)
        const err = new Error('duplicate key') as Error & { code: string };
        err.code = '23505';
        throw err;
      }
      return { rows: [tenantRowFor(params[0] as string)] };
    });
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      payload: { display_name: 'Doppelname' },
    });
    expect(r.statusCode).toBe(201);
    expect(pool.query).toHaveBeenCalledTimes(2);
    const secondSlug = pool.query.mock.calls[1][1][0] as string;
    expect(secondSlug).toBe('doppelname-2');
  });

  it('409, wenn ein EXPLIZITER Slug bereits vergeben ist (kein Auto-Suffix)', async () => {
    const { app, pool } = buildAppWithQuery(async () => {
      const err = new Error('duplicate key') as Error & { code: string };
      err.code = '23505';
      throw err;
    });
    current = await readyApp(app);
    const r = await current.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      payload: { display_name: 'Zur Post', slug: 'belegt' },
    });
    expect(r.statusCode).toBe(409);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
