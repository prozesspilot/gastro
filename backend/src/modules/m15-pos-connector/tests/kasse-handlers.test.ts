/**
 * T005/M15 — HTTP-Integration-Tests fuer Kasse + SumUp-Sync-Routes.
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sumup-sync.service', () => ({
  syncDay: vi.fn(),
}));
vi.mock('../kasse-transactions.repository', () => ({
  listKasseTransactions: vi.fn(),
}));

import { signM14Token } from '../../m14-auth/m14-jwt';
import { listKasseTransactions } from '../kasse-transactions.repository';
import { kasseRoutes } from '../kasse.routes';
import { syncDay } from '../sumup-sync.service';

const TENANT = '550e8400-e29b-41d4-a716-446655440000';
const STAFF = '550e8400-e29b-41d4-a716-446655440099';

function makeToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'geschaeftsfuehrer') {
  return signM14Token({
    userId: STAFF,
    discordId: 'd-1',
    role,
    displayName: 'Test',
  });
}

function makeMockPool() {
  const mockClient = {
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  } as unknown as PoolClient;
  return {
    connect: vi.fn(async () => mockClient),
    query: vi.fn(async () => ({ rows: [] })),
  } as unknown as Pool;
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool());
  app.decorate('redis', { quit: vi.fn() } as unknown as import('ioredis').default);
  await app.register(fastifyCookie);
  await app.register(kasseRoutes, { prefix: '/api/v1/m15' });
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

// ── POST /sumup/sync ─────────────────────────────────────────────────────

describe('POST /api/v1/m15/sumup/sync', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/sync',
      headers: { 'x-pp-tenant-id': TENANT },
    });
    expect(r.statusCode).toBe(401);
  });

  it('403 fuer Rolle mitarbeiter', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/sync',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT },
    });
    expect(r.statusCode).toBe(403);
  });

  it('422 bei ungueltigem date', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/sync',
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT, 'content-type': 'application/json' },
      payload: { date: '18.05.2026' }, // falsches Format
    });
    expect(r.statusCode).toBe(422);
  });

  it('200 Happy-Path mit explizitem date', async () => {
    (syncDay as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenant_id: TENANT,
      business_date: '2026-05-18',
      status: 'synced',
      transaction_count: 5,
      total_brutto: 120,
      attempts: 1,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/sync',
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT, 'content-type': 'application/json' },
      payload: { date: '2026-05-18' },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).status).toBe('synced');
    expect(syncDay).toHaveBeenCalled();
  });

  it('409 wenn skipped_no_token', async () => {
    (syncDay as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenant_id: TENANT,
      business_date: '2026-05-18',
      status: 'skipped_no_token',
      transaction_count: 0,
      total_brutto: 0,
      attempts: 1,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/sync',
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT, 'content-type': 'application/json' },
      payload: { date: '2026-05-18' },
    });
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error).toBe('no_active_sumup_token');
  });

  it('502 wenn failed', async () => {
    (syncDay as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenant_id: TENANT,
      business_date: '2026-05-18',
      status: 'failed',
      transaction_count: 0,
      total_brutto: 0,
      error: 'SumUp 503',
      attempts: 3,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/m15/sumup/sync',
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT, 'content-type': 'application/json' },
      payload: { date: '2026-05-18' },
    });
    expect(r.statusCode).toBe(502);
    expect(JSON.parse(r.body).error).toBe('sync_failed');
  });
});

// ── GET /kasse/transactions ─────────────────────────────────────────────

describe('GET /api/v1/m15/kasse/transactions', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/m15/kasse/transactions',
      headers: { 'x-pp-tenant-id': TENANT },
    });
    expect(r.statusCode).toBe(401);
  });

  it('200 Happy-Path mit Pagination-Defaults', async () => {
    (listKasseTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        {
          id: 'kt-1',
          tenant_id: TENANT,
          pos_system: 'sumup_lite',
          business_date: '2026-05-18',
          total_brutto: 120,
        },
      ],
      total: 1,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/m15/kasse/transactions',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.items).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('422 bei ungueltigem from-Datum', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/m15/kasse/transactions?from=invalid',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT },
    });
    expect(r.statusCode).toBe(422);
  });
});
