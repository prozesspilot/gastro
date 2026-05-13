/**
 * M11 — IMAP Routes Smoke-Tests
 *
 * Stub-Tests die sicherstellen, dass das Modul korrekt in die App registriert
 * ist und die Endpunkte bei fehlendem Auth (PP_AUTH_DISABLED=1 in Tests) erreichbar sind.
 *
 * Diese Tests laufen ohne echte IMAP-Verbindung — DB/IMAP-Fehler sind erwartet.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

describe('M11 — IMAP-Routes (Smoke)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Modul geladen: POST /api/v1/internal/imap/poll antwortet (kein 404)', async () => {
    // DECISION: Wir prüfen nur das Routing (kein 404), nicht den Inhalt.
    // DB-Fehler (500) und fehlende Credentials (400/500) sind erwartet ohne echten Stack.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/imap/poll',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    // 404 wäre ein Hinweis, dass die Route nicht registriert ist
    expect(res.statusCode).not.toBe(404);
  });

  it('Auth-Bypass aktiv (PP_AUTH_DISABLED=1): kein 401 bei fehlenden Credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/imap/poll',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    // Im Test-Modus (PP_AUTH_DISABLED=1) darf kein 401 kommen
    expect(res.statusCode).not.toBe(401);
  });
});
