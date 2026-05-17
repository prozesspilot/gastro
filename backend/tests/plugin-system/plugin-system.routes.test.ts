/**
 * Plugin-System — Routes Smoke-Tests
 *
 * Stub-Tests die sicherstellen, dass das Modul korrekt in die App registriert
 * ist und die Endpunkte erreichbar sind.
 *
 * Diese Tests laufen ohne echte DB-Verbindung — DB-Fehler sind erwartet.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

describe('Plugin-System — Routes (Smoke)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Modul geladen: GET /api/v1/plugins antwortet (kein 404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins',
      headers: { 'x-tenant-id': 'test-tenant-id' },
    });
    expect(res.statusCode).not.toBe(404);
  });

  it('POST /api/v1/plugins antwortet (kein 404)', async () => {
    // DECISION: Body kann leer/minimal sein — wir testen nur Routing, kein Inhalt
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins',
      headers: { 'content-type': 'application/json', 'x-tenant-id': 'test-tenant-id' },
      payload: {},
    });
    expect(res.statusCode).not.toBe(404);
  });

  it('Auth-Bypass aktiv (PP_AUTH_DISABLED=1): kein 401 bei Endpunkten', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins',
      headers: { 'x-tenant-id': 'test-tenant-id' },
    });
    expect(res.statusCode).not.toBe(401);
  });
});
