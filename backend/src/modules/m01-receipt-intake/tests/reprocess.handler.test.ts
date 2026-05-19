/**
 * T007/M01 — Tests für POST /api/v1/belege/:id/reprocess.
 *
 * Strategie:
 *   * Fastify-Test-App mit gemocktem DB-Pool und gemockter OCR-Queue.
 *   * M14-JWT-Cookie wird per signM14Token erzeugt (echter Auth-Hook).
 *
 * Deckt ab:
 *   - 401 ohne Auth-Cookie
 *   - 400 bei ungültiger Beleg-ID
 *   - 404 wenn Beleg nicht existiert
 *   - 409 wenn Beleg in extracting
 *   - 202 Happy-Path: Job wird enqueued
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { belegeRoutes } from '../belege.routes';

// Auto-Enqueue ist gemockt — wir prüfen den Call.
vi.mock('../../../core/queue/ocr-queue', () => ({
  enqueueOcrJob: vi.fn(async () => undefined),
}));

import { enqueueOcrJob } from '../../../core/queue/ocr-queue';
import { signM14Token } from '../../m14-auth/m14-jwt';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const BELEG_UUID = '550e8400-e29b-41d4-a716-446655440001';
const STAFF_UUID = '550e8400-e29b-41d4-a716-446655440099';

function makeStaffToken(role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter') {
  return signM14Token({
    userId: STAFF_UUID,
    discordId: 'discord-test',
    role,
    displayName: 'Test',
  });
}

function makeBelegRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BELEG_UUID,
    tenant_id: TENANT_UUID,
    status: 'received',
    file_object_key: 'key.jpg',
    file_mime_type: 'image/jpeg',
    file_size_bytes: 1024,
    file_sha256: 'a'.repeat(64),
    payload: {},
    supplier_name: null,
    document_date: null,
    total_gross: null,
    currency: 'EUR',
    category: null,
    source_channel: 'manual_upload',
    source_external_id: null,
    received_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Pool-Mock, der BEGIN/COMMIT + set_config + SELECT belege ausführt.
 * `belegRow`=null simuliert „Beleg nicht gefunden".
 */
function makeMockPool(belegRow: Record<string, unknown> | null) {
  const mockClient = {
    query: vi.fn(async (sql: string) => {
      // tenant_exists wird vor allem in upload genutzt — hier nicht relevant.
      if (sql.includes('SELECT * FROM belege')) {
        return { rows: belegRow ? [belegRow] : [] };
      }
      // BEGIN, COMMIT, set_config liefern keine Rows
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    connect: vi.fn(async () => mockClient),
    query: vi.fn().mockResolvedValue({ rows: [] }),
  } as unknown as Pool;
}

async function buildTestApp(belegRow: Record<string, unknown> | null) {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool(belegRow));
  app.decorate('s3', { send: vi.fn() } as unknown as import('@aws-sdk/client-s3').S3Client);
  await app.register(fastifyCookie);
  await app.register(belegeRoutes, { prefix: '/api/v1/belege' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

let currentApp: Awaited<ReturnType<typeof buildTestApp>> | null = null;
afterEach(async () => {
  if (currentApp) {
    await currentApp.close();
    currentApp = null;
  }
});

describe('POST /api/v1/belege/:id/reprocess', () => {
  it('401 ohne Auth-Cookie', async () => {
    currentApp = await buildTestApp(makeBelegRow());

    const response = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/reprocess`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(401);
    expect(enqueueOcrJob).not.toHaveBeenCalled();
  });

  it('400 bei ungültiger UUID', async () => {
    currentApp = await buildTestApp(null);

    const response = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/belege/not-a-uuid/reprocess',
      cookies: { pp_auth: makeStaffToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('invalid_id');
    expect(enqueueOcrJob).not.toHaveBeenCalled();
  });

  it('404 wenn Beleg nicht existiert', async () => {
    currentApp = await buildTestApp(null);

    const response = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/reprocess`,
      cookies: { pp_auth: makeStaffToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(404);
    expect(enqueueOcrJob).not.toHaveBeenCalled();
  });

  it('409 wenn Beleg in extracting', async () => {
    currentApp = await buildTestApp(makeBelegRow({ status: 'extracting' }));

    const response = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/reprocess`,
      cookies: { pp_auth: makeStaffToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe('already_processing');
    expect(enqueueOcrJob).not.toHaveBeenCalled();
  });

  it('202 Happy-Path: error-Beleg wird enqueued', async () => {
    currentApp = await buildTestApp(makeBelegRow({ status: 'error' }));

    const response = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/reprocess`,
      cookies: { pp_auth: makeStaffToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.queued).toBe(true);
    expect(body.beleg_id).toBe(BELEG_UUID);
    expect(enqueueOcrJob).toHaveBeenCalledWith({
      tenantId: TENANT_UUID,
      belegId: BELEG_UUID,
      reason: 'reprocess',
    });
  });

  it('202 auch wenn requires_review-Beleg neu prozessiert wird', async () => {
    currentApp = await buildTestApp(makeBelegRow({ status: 'requires_review' }));

    const response = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/belege/${BELEG_UUID}/reprocess`,
      cookies: { pp_auth: makeStaffToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });

    expect(response.statusCode).toBe(202);
    expect(enqueueOcrJob).toHaveBeenCalledTimes(1);
  });
});
