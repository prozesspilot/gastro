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

  it('GET /health → 200 oder 503 mit korrekter Body-Struktur', async () => {
    // DECISION: /health gibt 503 wenn DB nicht erreichbar (Docker nicht aktiv in CI).
    // Wir prüfen nur die Body-Struktur, nicht den Status-Code.
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect([200, 503]).toContain(res.statusCode);

    const body = res.json<{ ok: boolean; version: string; uptime: number }>();
    expect(typeof body.ok).toBe('boolean');
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });
});

describe('Smoke — /metrics (B2: Prometheus-Scrape)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics → 200 mit Prometheus-Format', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });

    // Metrics-Endpoint muss existieren und Prometheus-Text liefern
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);

    // Muss mind. Default-Metriken enthalten
    const body = res.body;
    expect(body).toContain('pp_');       // ProzessPilot-Namespace
    expect(body).toContain('# HELP');    // Prometheus-Format
    expect(body).toContain('# TYPE');    // Prometheus-Format
  });

  it('GET /metrics enthält HTTP-Request-Metriken', async () => {
    // Erst einen Request machen damit Metriken befüllt werden
    await app.inject({ method: 'GET', url: '/api/v1/health' });

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const body = res.body;

    expect(body).toContain('pp_http_requests_total');
    expect(body).toContain('pp_http_request_duration_seconds');
  });
});
