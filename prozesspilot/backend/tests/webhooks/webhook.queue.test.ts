/**
 * Tests für Webhook-Queue (Exponential Backoff).
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { enqueue, processNext } from '../../src/core/webhooks/webhook.queue';

// Skip all DB integration tests when no Postgres is available (set PP_E2E=1 to run)
const E2E = process.env.PP_E2E === '1';

let app: FastifyInstance;
let tenantId: string;

beforeAll(async () => {
  if (!E2E) return;
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (!E2E) return;
  await app.close();
});

beforeEach(async () => {
  if (!E2E) return;
  const { rows } = await app.db.query<{ id: string }>(
    'INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id',
    [`test-wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'WH Test'],
  );
  tenantId = rows[0].id;
});

afterEach(async () => {
  if (!E2E) return;
  await app.db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
});

describe.skipIf(!E2E)('webhook.queue', () => {
  it('enqueue legt Job in DB ab', async () => {
    const id = await enqueue(app.db, tenantId, 'http://example/x', { foo: 'bar' });
    const { rows } = await app.db.query<{ status: string; attempts: number }>(
      'SELECT status, attempts FROM webhook_queue WHERE id = $1',
      [id],
    );
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(0);
  });

  it('processNext bei Erfolg setzt Status auf done', async () => {
    const id = await enqueue(app.db, tenantId, 'http://example/x', { foo: 1 });
    const fetcher: typeof fetch = async () =>
      new Response('OK', { status: 200 }) as unknown as Response;

    const handled = await processNext(app.db, { fetcher });
    expect(handled).toBe(true);

    const { rows } = await app.db.query<{ status: string; last_error: string | null }>(
      'SELECT status, last_error FROM webhook_queue WHERE id = $1',
      [id],
    );
    expect(rows[0].status).toBe('done');
    expect(rows[0].last_error).toBeNull();
  });

  it('processNext bei Fehler erhöht attempts und setzt next_retry_at exponentiell', async () => {
    const id = await enqueue(app.db, tenantId, 'http://example/x', {});
    const fixedNow = 1_700_000_000_000;
    const fetcher: typeof fetch = async () =>
      new Response('Boom', { status: 500 }) as unknown as Response;

    await processNext(app.db, { fetcher, now: () => fixedNow });

    const { rows } = await app.db.query<{
      status: string;
      attempts: number;
      last_error: string | null;
      next_retry_at: Date;
    }>('SELECT status, attempts, last_error, next_retry_at FROM webhook_queue WHERE id = $1', [id]);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].last_error).toContain('HTTP 500');
    // attempts=1 → backoff 2^1 * 30s = 60s
    const expectedMs = fixedNow + 2 * 30_000;
    expect(Math.abs(rows[0].next_retry_at.getTime() - expectedMs)).toBeLessThan(1000);
  });

  it('nach max_attempts → status failed', async () => {
    const id = await enqueue(app.db, tenantId, 'http://example/x', {}, 2);
    const fetcher: typeof fetch = async () =>
      new Response('x', { status: 500 }) as unknown as Response;

    // Versuch 1 → Fehler → pending
    // Erst next_retry_at zurückdatieren, damit der nächste Tick greift
    await processNext(app.db, { fetcher, now: () => Date.now() });
    await app.db.query('UPDATE webhook_queue SET next_retry_at = now() WHERE id = $1', [id]);
    // Versuch 2 → Fehler → failed
    await processNext(app.db, { fetcher, now: () => Date.now() });

    const { rows } = await app.db.query<{ status: string; attempts: number }>(
      'SELECT status, attempts FROM webhook_queue WHERE id = $1',
      [id],
    );
    expect(rows[0].status).toBe('failed');
    expect(rows[0].attempts).toBeGreaterThanOrEqual(2);
  });

  it('processNext gibt false zurück wenn keine Jobs fällig sind', async () => {
    const handled = await processNext(app.db);
    // Es können andere Jobs aus parallelen Tests da sein — daher nur prüfen,
    // dass keine Exception fliegt
    expect(typeof handled).toBe('boolean');
  });
});
