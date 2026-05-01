import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('Smoke — /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 { ok: true, version: string, uptime: number }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);

    const body = res.json<{ ok: boolean; version: string; uptime: number }>();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });
});
