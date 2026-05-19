/**
 * T015 — HTTP-Integration-Tests fuer PATCH/DELETE /api/v1/belege/:id.
 *
 * Pattern uebernommen aus existierender belege-upload.test.ts: minimale
 * Fastify-Instanz, Pool-Mock mit BEGIN/COMMIT-Sequenz.
 */

import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signM14Token } from '../../m14-auth/m14-jwt';
import { belegeRoutes } from '../belege.routes';

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

function makeBelegRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BELEG_UUID,
    tenant_id: TENANT_UUID,
    status: 'extracted',
    source_channel: 'manual_upload',
    source_external_id: null,
    received_at: new Date('2026-05-18T10:00:00Z'),
    file_object_key: 'tenant-001/orig.jpg',
    file_mime_type: 'image/jpeg',
    file_size_bytes: 1024,
    file_sha256: 'a'.repeat(64),
    payload: { extraction: { fields: {} } },
    supplier_name: 'Alt GmbH',
    document_date: new Date('2026-05-17'),
    total_gross: 100,
    currency: 'EUR',
    category: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

function makeMockPool(opts: { belegRow?: Record<string, unknown> | null } = {}) {
  const belegRow = opts.belegRow === undefined ? makeBelegRow() : opts.belegRow;
  const mockClient = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM belege')) {
        return { rows: belegRow ? [belegRow] : [] };
      }
      if (sql.startsWith('UPDATE belege')) {
        return { rows: belegRow ? [belegRow] : [] };
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

async function buildTestApp(opts: { belegRow?: Record<string, unknown> | null } = {}) {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool(opts));
  app.decorate('s3', { send: vi.fn() } as unknown as import('@aws-sdk/client-s3').S3Client);
  await app.register(fastifyCookie);
  await app.register(belegeRoutes, { prefix: '/api/v1/belege' });
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

// ── PATCH ──────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/belege/:id', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/belege/${BELEG_UUID}`,
      payload: { supplier_name: 'Neu' },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('403 fuer Rolle support', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/belege/${BELEG_UUID}`,
      payload: { supplier_name: 'Neu' },
      cookies: { pp_auth: makeToken('support') },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('400 bei invalider UUID', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'PATCH',
      url: '/api/v1/belege/not-uuid',
      payload: { supplier_name: 'Neu' },
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('422 bei ungueltigem Datum-Format', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/belege/${BELEG_UUID}`,
      payload: { document_date: '17.05.2026' },
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('404 wenn Beleg nicht existiert', async () => {
    currentApp = await buildTestApp({ belegRow: null });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/belege/${BELEG_UUID}`,
      payload: { supplier_name: 'Neu' },
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(404);
  });

  it('422 wenn category=bewirtung aber Anlass/Teilnehmer fehlen', async () => {
    currentApp = await buildTestApp({ belegRow: makeBelegRow({ category: null }) });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/belege/${BELEG_UUID}`,
      payload: { category: 'bewirtung_kunden' },
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error).toBe('bewirtung_fields_required');
  });

  it('200 Happy-Path: supplier_name korrigieren', async () => {
    currentApp = await buildTestApp({
      belegRow: makeBelegRow({ supplier_name: 'Korrigiert GmbH' }),
    });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/belege/${BELEG_UUID}`,
      payload: { supplier_name: 'Korrigiert GmbH' },
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).beleg.supplier_name).toBe('Korrigiert GmbH');
  });

  it('200 bei Bewirtung wenn beide Pflichtfelder im Patch sind', async () => {
    currentApp = await buildTestApp({
      belegRow: makeBelegRow({ category: 'bewirtung_kunden' }),
    });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/belege/${BELEG_UUID}`,
      payload: {
        category: 'bewirtung_kunden',
        bewirtung_anlass: 'Geschaeftsessen',
        bewirtung_teilnehmer: 'Max Mueller, Anna Schmidt',
      },
      cookies: { pp_auth: makeToken() },
      headers: { 'x-pp-tenant-id': TENANT_UUID, 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(200);
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────────

describe('DELETE /api/v1/belege/:id', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'DELETE',
      url: `/api/v1/belege/${BELEG_UUID}`,
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(401);
  });

  it('403 fuer Rolle mitarbeiter (nur geschaeftsfuehrer)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'DELETE',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: makeToken('mitarbeiter') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(403);
  });

  it('400 bei invalider UUID', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'DELETE',
      url: '/api/v1/belege/not-uuid',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(400);
  });

  it('404 wenn Beleg nicht existiert', async () => {
    currentApp = await buildTestApp({ belegRow: null });
    const r = await currentApp.inject({
      method: 'DELETE',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(404);
  });

  it('200 Happy-Path: gibt deleted_at zurueck', async () => {
    const deletedRow = makeBelegRow({ deleted_at: new Date('2026-05-19T12:00:00Z') });
    currentApp = await buildTestApp({ belegRow: deletedRow });
    const r = await currentApp.inject({
      method: 'DELETE',
      url: `/api/v1/belege/${BELEG_UUID}`,
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      headers: { 'x-pp-tenant-id': TENANT_UUID },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.beleg_id).toBe(BELEG_UUID);
    expect(body.deleted_at).toBeTruthy();
  });
});
