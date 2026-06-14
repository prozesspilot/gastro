/**
 * T009/M05 — HTTP-Integration-Tests fuer die belege-Lexware-Routes.
 *
 * Wir mocken den exportBelegToLexware-Service via vi.mock — der Handler
 * ist ein duenner Wrapper (Auth + Rolle + UUID-Check + Response-Mapping).
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/belege-lexware-exporter', () => ({
  exportBelegToLexware: vi.fn(),
}));
vi.mock('../services/export-log.repository', () => ({
  findBelegIdsPendingExport: vi.fn(),
}));

import { signM14Token } from '../../m14-auth/m14-jwt';
import { belegeLexwareRoutes } from '../belege-routes';
import { exportBelegToLexware } from '../services/belege-lexware-exporter';
import { findBelegIdsPendingExport } from '../services/export-log.repository';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const BELEG_UUID = '550e8400-e29b-41d4-a716-446655440001';
const STAFF_UUID = '550e8400-e29b-41d4-a716-446655440099';

function makeToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({
    userId: STAFF_UUID,
    discordId: 'discord-test',
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
  app.decorate('s3', { send: vi.fn() } as unknown as import('@aws-sdk/client-s3').S3Client);
  await app.register(fastifyCookie);
  await app.register(belegeLexwareRoutes, { prefix: '/api/v1' });
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

// ── Single-Push ──────────────────────────────────────────────────────────

describe('POST /api/v1/belege/:id/exports/lexware', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/exports/lexware`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
  });

  it('403 fuer Rolle support', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/exports/lexware`,
      cookies: { pp_auth: makeToken('support') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(403);
  });

  it('400 bei ungueltiger UUID', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/belege/not-uuid/exports/lexware',
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(400);
  });

  it('200 + pushed bei Erfolg', async () => {
    (exportBelegToLexware as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'pushed',
      external_id: 'lex-001',
      external_url: 'https://app.lexoffice.de/voucher/lex-001',
      attempts: 1,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/exports/lexware`,
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).status).toBe('pushed');
    expect(JSON.parse(r.body).external_id).toBe('lex-001');
  });

  it('200 + skipped bei Idempotenz-Match', async () => {
    (exportBelegToLexware as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'skipped',
      external_id: 'lex-existing',
      attempts: 1,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/exports/lexware`,
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).status).toBe('skipped');
  });

  it('502 bei Service-Fail', async () => {
    (exportBelegToLexware as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'failed',
      error: 'Lexoffice 401 Unauthorized',
      attempts: 1,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/exports/lexware`,
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(502);
    expect(JSON.parse(r.body).error).toBe('export_failed');
  });

  it('422 wenn Beleg noch nicht kategorisiert (Status-Gate, Review #2)', async () => {
    // 'not_categorized' ist KEIN externer Lexoffice-Fehler → 422, nicht 502.
    (exportBelegToLexware as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'failed',
      error: 'not_categorized',
      attempts: 0,
    });
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/exports/lexware`,
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('not_categorized');
  });
});

// ── Batch ────────────────────────────────────────────────────────────────

describe('POST /api/v1/exports/lexware/batch', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/exports/lexware/batch',
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
  });

  it('403 fuer Rolle mitarbeiter', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/exports/lexware/batch',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(403);
  });

  it('200 + leere Summary wenn nichts pending', async () => {
    (findBelegIdsPendingExport as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/exports/lexware/batch',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ pushed: 0, skipped: 0, failed: 0, results: [] });
  });

  it('200 + Summary mit pushed/skipped/failed', async () => {
    (findBelegIdsPendingExport as ReturnType<typeof vi.fn>).mockResolvedValue([
      'beleg-1',
      'beleg-2',
      'beleg-3',
    ]);
    (exportBelegToLexware as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        beleg_id: 'beleg-1',
        status: 'pushed',
        external_id: 'lex-1',
        attempts: 1,
      })
      .mockResolvedValueOnce({
        beleg_id: 'beleg-2',
        status: 'skipped',
        external_id: 'lex-old',
        attempts: 1,
      })
      .mockResolvedValueOnce({
        beleg_id: 'beleg-3',
        status: 'failed',
        error: 'Lexoffice down',
        attempts: 3,
      });

    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/exports/lexware/batch',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.pushed).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results).toHaveLength(3);
  });

  it('422 bei limit out-of-range', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/exports/lexware/batch',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
      payload: { limit: 9999 }, // max ist 500
    });
    expect(r.statusCode).toBe(422);
  });
});
