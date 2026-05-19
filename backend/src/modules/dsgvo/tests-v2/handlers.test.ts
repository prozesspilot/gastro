/**
 * T010/M12 — HTTP-Integration-Tests fuer die DSGVO-V2-Handler.
 *
 * Test-App mit gemocktem DB-Pool + Redis. enqueueDsgvoZipJob ist gemockt
 * (kein BullMQ in Tests).
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../core/queue/dsgvo-queue', () => ({
  enqueueDsgvoZipJob: vi.fn(async () => undefined),
}));
vi.mock('../services/email.service', () => ({
  sendAuskunftReadyMail: vi.fn(async () => true),
  sendLoeschungConfirmMail: vi.fn(async () => true),
}));

import { enqueueDsgvoZipJob } from '../../../core/queue/dsgvo-queue';
import { signM14Token } from '../../m14-auth/m14-jwt';
import { dsgvoV2Routes } from '../dsgvo-v2.routes';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const REQUEST_UUID = '660e8400-e29b-41d4-a716-446655440000';
const USER_UUID = '770e8400-e29b-41d4-a716-446655440099';

function makeGfToken() {
  return signM14Token({
    userId: USER_UUID,
    discordId: 'discord-test',
    role: 'geschaeftsfuehrer',
    displayName: 'GF Test',
  });
}

function makeStaffToken(role: 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({
    userId: USER_UUID,
    discordId: 'discord-test',
    role,
    displayName: 'Staff Test',
  });
}

/**
 * DB-Pool-Mock mit konfigurierbarem Query-Verhalten.
 * `dsgvoRow`=null simuliert „kein Request gefunden".
 */
function makeMockPool(opts: {
  dsgvoRow?: Record<string, unknown> | null;
  recentCount?: number;
  insertedId?: string;
}) {
  const recentCount = opts.recentCount ?? 0;
  const insertedId = opts.insertedId ?? REQUEST_UUID;
  const dsgvoRow = opts.dsgvoRow;

  const mockClient = {
    query: vi.fn(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM dsgvo_requests')) {
        return { rows: dsgvoRow ? [dsgvoRow] : [] };
      }
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ count: String(recentCount) }] };
      }
      if (sql.includes('INSERT INTO dsgvo_requests')) {
        return {
          rows: [
            {
              id: insertedId,
              tenant_id: TENANT_UUID,
              type: 'auskunft',
              status: 'pending',
              subject_email: 'subject@example.com',
              subject_description: null,
              requested_by_user_id: USER_UUID,
              export_object_key: null,
              export_password_hash: null,
              soft_deleted_count: 0,
              hard_deleted_count: 0,
              error_message: null,
              created_at: new Date(),
              updated_at: new Date(),
              completed_at: null,
              expires_at: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT status, type FROM dsgvo_requests')) {
        return { rows: dsgvoRow ? [{ status: dsgvoRow.status, type: dsgvoRow.type }] : [] };
      }
      if (sql.includes('UPDATE dsgvo_requests')) {
        return { rows: dsgvoRow ? [dsgvoRow] : [] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  return {
    connect: vi.fn(async () => mockClient),
    query: vi.fn(async () => ({ rows: [] })),
  } as unknown as Pool;
}

function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  } as unknown as import('ioredis').default;
}

async function buildTestApp(poolOpts: Parameters<typeof makeMockPool>[0] = {}) {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool(poolOpts));
  app.decorate('redis', makeFakeRedis());
  app.decorate('s3', { send: vi.fn() } as unknown as import('@aws-sdk/client-s3').S3Client);
  await app.register(fastifyCookie);
  await app.register(dsgvoV2Routes, { prefix: '/api/v1/dsgvo' });
  await app.ready();
  return app;
}

let currentApp: Awaited<ReturnType<typeof buildTestApp>> | null = null;
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(async () => {
  if (currentApp) {
    await currentApp.close();
    currentApp = null;
  }
});

// ── /auskunft ─────────────────────────────────────────────────────────────

describe('POST /api/v1/dsgvo/auskunft', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/auskunft',
      payload: { email: 'subject@example.com' },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
    expect(enqueueDsgvoZipJob).not.toHaveBeenCalled();
  });

  it('403 fuer Rolle mitarbeiter', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/auskunft',
      payload: { email: 'subject@example.com' },
      cookies: { pp_auth: makeStaffToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(403);
    expect(JSON.parse(r.body).error).toBe('forbidden');
  });

  it('422 bei ungueltiger Email', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/auskunft',
      payload: { email: 'not-an-email' },
      cookies: { pp_auth: makeGfToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(422);
  });

  it('429 wenn Rate-Limit erreicht', async () => {
    currentApp = await buildTestApp({ recentCount: 5 });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/auskunft',
      payload: { email: 'subject@example.com' },
      cookies: { pp_auth: makeGfToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(429);
    expect(JSON.parse(r.body).error).toBe('rate_limit');
    expect(enqueueDsgvoZipJob).not.toHaveBeenCalled();
  });

  it('202 Happy-Path mit Queue-Enqueue', async () => {
    currentApp = await buildTestApp({ recentCount: 0 });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/auskunft',
      payload: { email: 'subject@example.com', description: 'Anfrage vom 19.05.2026' },
      cookies: { pp_auth: makeGfToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(202);
    const body = JSON.parse(r.body);
    expect(body.request_id).toBe(REQUEST_UUID);
    expect(body.type).toBe('auskunft');
    expect(enqueueDsgvoZipJob).toHaveBeenCalledWith({
      request_id: REQUEST_UUID,
      tenant_id: TENANT_UUID,
    });
  });
});

// ── /loeschung ─────────────────────────────────────────────────────────────

describe('POST /api/v1/dsgvo/loeschung', () => {
  it('403 fuer Rolle support', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/loeschung',
      payload: { email: 'subject@example.com' },
      cookies: { pp_auth: makeStaffToken('support') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(403);
  });

  it('202 + Status confirming + Mail wurde gerufen', async () => {
    const { sendLoeschungConfirmMail } = await import('../services/email.service');
    currentApp = await buildTestApp({ recentCount: 0 });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/loeschung',
      payload: { email: 'subject@example.com' },
      cookies: { pp_auth: makeGfToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(202);
    const body = JSON.parse(r.body);
    expect(body.status).toBe('confirming');
    expect(sendLoeschungConfirmMail).toHaveBeenCalledTimes(1);
  });
});

// ── /loeschung/confirm ─────────────────────────────────────────────────────

describe('POST /api/v1/dsgvo/loeschung/confirm', () => {
  it('OEFFENTLICH (kein Cookie) — 400 bei ungueltigem Token-Format', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/loeschung/confirm',
      payload: { token: 'too-short', email: 'subject@example.com' },
    });
    expect(r.statusCode).toBe(422); // schema-level
  });

  it('400 bei nicht existierendem Token', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/dsgvo/loeschung/confirm',
      payload: { token: '0'.repeat(32), email: 'subject@example.com' },
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toBe('invalid_token');
  });
});

// ── /auskunft/:id ──────────────────────────────────────────────────────────

describe('GET /api/v1/dsgvo/auskunft/:id', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: `/api/v1/dsgvo/auskunft/${REQUEST_UUID}`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
  });

  it('400 bei ungueltiger UUID', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/dsgvo/auskunft/not-a-uuid',
      cookies: { pp_auth: makeGfToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(400);
  });

  it('404 wenn Request nicht existiert', async () => {
    currentApp = await buildTestApp({ dsgvoRow: null });
    const r = await currentApp.inject({
      method: 'GET',
      url: `/api/v1/dsgvo/auskunft/${REQUEST_UUID}`,
      cookies: { pp_auth: makeGfToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(404);
  });

  it('200 mit Status-Daten', async () => {
    currentApp = await buildTestApp({
      dsgvoRow: {
        id: REQUEST_UUID,
        tenant_id: TENANT_UUID,
        type: 'auskunft',
        status: 'pending',
        subject_email: 'subject@example.com',
        subject_description: null,
        requested_by_user_id: USER_UUID,
        export_object_key: null,
        export_password_hash: null,
        soft_deleted_count: 0,
        hard_deleted_count: 0,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
        expires_at: null,
      },
    });

    const r = await currentApp.inject({
      method: 'GET',
      url: `/api/v1/dsgvo/auskunft/${REQUEST_UUID}`,
      cookies: { pp_auth: makeGfToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.request_id).toBe(REQUEST_UUID);
    expect(body.status).toBe('pending');
  });
});
