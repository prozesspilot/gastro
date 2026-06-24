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
