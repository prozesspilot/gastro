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
  it('liefert 200 mit ok=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe('number');
    expect(body.version).toBeDefined();
  });
});

describe('GET /ready', () => {
  it('liefert db, redis, migrations Felder', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
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
