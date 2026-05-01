/**
 * D9 — Integration-Tests Routing-Routes
 *
 * Repository und n8n-Client werden gemockt — kein n8n nötig.
 * Postgres wird wie bei D8 genutzt (docker compose up -d).
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── n8n-Client mocken ─────────────────────────────────────────────────────────

vi.mock('../../src/core/n8n/client', () => ({
  triggerWebhook: vi.fn().mockResolvedValue({ ok: true }),
}));

import { buildApp } from '../../src/app';

// ── Test-Setup ────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let tenantId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(async () => {
  const { rows } = await app.db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
    [`test-routing-${Date.now()}`, 'Routing-Test-Mandant'],
  );
  tenantId = rows[0].id;
});

afterEach(async () => {
  await app.db.query(`DELETE FROM routing_jobs WHERE tenant_id = $1`, [tenantId]);
  await app.db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  vi.clearAllMocks();
});

// ── Hilfsfunktion: Job anlegen ────────────────────────────────────────────────

async function createJob(payload: Record<string, unknown> = {}) {
  const { rows } = await app.db.query<{ id: string }>(
    `
    INSERT INTO routing_jobs (tenant_id, payload)
    VALUES ($1, $2)
    RETURNING id
    `,
    [tenantId, JSON.stringify(payload)],
  );
  return rows[0].id;
}

// ── GET /api/v1/routing/jobs ──────────────────────────────────────────────────

describe('GET /api/v1/routing/jobs', () => {
  it('gibt leere Liste zurück wenn keine Jobs vorhanden', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/routing/jobs',
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it('gibt 400 ohne x-pp-tenant-id zurück', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/routing/jobs',
    });
    expect(res.statusCode).toBe(400);
  });

  it('gibt paginierte Liste zurück', async () => {
    await createJob({ type: 'test-a' });
    await createJob({ type: 'test-b' });

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/routing/jobs?page=1&limit=10',
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.pagination.page).toBe(1);
  });

  it('filtert nach Status', async () => {
    const jobId = await createJob();
    // Status auf 'done' setzen
    await app.db.query(
      `UPDATE routing_jobs SET status = 'done' WHERE id = $1`,
      [jobId],
    );

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/routing/jobs?status=done',
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.every((j: { status: string }) => j.status === 'done')).toBe(true);
  });

  it('gibt 422 bei ungültigem Status zurück', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/routing/jobs?status=invalid',
      headers: { 'x-pp-tenant-id': tenantId },
    });
    expect(res.statusCode).toBe(422);
  });
});

// ── GET /api/v1/routing/jobs/:id ──────────────────────────────────────────────

describe('GET /api/v1/routing/jobs/:id', () => {
  it('gibt Job zurück wenn vorhanden', async () => {
    const jobId = await createJob({ test: true });

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/routing/jobs/${jobId}`,
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(jobId);
    expect(res.json().data.tenant_id).toBe(tenantId);
  });

  it('gibt 404 zurück wenn nicht vorhanden', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/routing/jobs/00000000-0000-0000-0000-000000000000',
      headers: { 'x-pp-tenant-id': tenantId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('gibt 422 bei ungültiger UUID zurück', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/routing/jobs/not-a-uuid',
      headers: { 'x-pp-tenant-id': tenantId },
    });
    expect(res.statusCode).toBe(422);
  });

  it('gibt 400 ohne x-pp-tenant-id zurück', async () => {
    const jobId = await createJob();
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/routing/jobs/${jobId}`,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /api/v1/routing/jobs/:id/retry ──────────────────────────────────────

describe('POST /api/v1/routing/jobs/:id/retry', () => {
  it('stellt failed-Job wieder in Warteschlange', async () => {
    const jobId = await createJob();
    await app.db.query(
      `UPDATE routing_jobs SET status = 'failed', attempts = 2 WHERE id = $1`,
      [jobId],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/routing/jobs/${jobId}/retry`,
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('queued');
  });

  it('stellt dead-Job wieder in Warteschlange', async () => {
    const jobId = await createJob();
    await app.db.query(
      `UPDATE routing_jobs SET status = 'dead', attempts = 3 WHERE id = $1`,
      [jobId],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/routing/jobs/${jobId}/retry`,
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
  });

  it('gibt 409 wenn Job noch nicht failed/dead', async () => {
    const jobId = await createJob(); // status = 'queued'

    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/routing/jobs/${jobId}/retry`,
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(409);
  });

  it('gibt 409 wenn Job nicht gefunden', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/routing/jobs/00000000-0000-0000-0000-000000000000/retry',
      headers: { 'x-pp-tenant-id': tenantId },
    });
    expect(res.statusCode).toBe(409);
  });

  it('gibt 400 ohne x-pp-tenant-id zurück', async () => {
    const jobId = await createJob();
    const res = await app.inject({
      method: 'POST',
      url:    `/api/v1/routing/jobs/${jobId}/retry`,
    });
    expect(res.statusCode).toBe(400);
  });
});
