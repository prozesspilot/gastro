/**
 * Tests für /health und /ready.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('liefert korrekte Body-Struktur (200 wenn DB aktiv, 503 sonst)', async () => {
    // DECISION: /health gibt 503 wenn DB nicht erreichbar (kein Docker in CI).
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect([200, 503]).toContain(res.statusCode);
    const body = res.json();
    expect(typeof body.ok).toBe('boolean');
    expect(typeof body.uptime).toBe('number');
    expect(body.version).toBeDefined();
  });
});

describe('GET /ready', () => {
  it('liefert db, redis, migrations Felder', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    // Auch wenn Redis nicht erreichbar — Body muss korrekt strukturiert sein
    const body = res.json();
    expect(body.db).toBeDefined();
    expect(body.db.connected).toBeDefined();
    expect(body.redis).toBeDefined();
    expect(body.redis.connected).toBeDefined();
    expect(body.migrations).toBeDefined();
    expect('last_applied' in body.migrations).toBe(true);
    expect(typeof body.migrations.total).toBe('number');
  });
});
