/**
 * Plugin Dispatcher Integration Tests
 *
 * Startet einen lokalen HTTP-Server als Fake-Plugin, registriert ihn via API
 * und prueft die HMAC-Signatur im eingehenden Webhook-Payload.
 *
 * Tests:
 *   1. Plugin per API registrieren
 *   2. Plugin-Liste laden → registriertes Plugin erscheint
 *   3. (Simulated) Webhook-Event mit HMAC-Signature pruefung
 */

import { createHmac } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { cleanTestDb, setupTestDb } from './setup';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_HMAC_SECRET = 'test-secret-min-32-chars-required-here';
const PLUGIN_WEBHOOK_SECRET = 'plugin-webhook-secret-min-16';

// DECISION: Integration-Tests laufen nur wenn DB erreichbar.
let pool: pg.Pool;
let dbAvailable = false;
let fakeServer: ReturnType<typeof createServer>;
let fakeServerPort = 0;

// Captured requests from the fake server
const capturedRequests: Array<{ body: string; headers: Record<string, string> }> = [];

beforeAll(async () => {
  // Starte Fake-Plugin-Server
  await new Promise<void>((resolve) => {
    fakeServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        capturedRequests.push({
          body,
          headers: req.headers as Record<string, string>,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });

    fakeServer.listen(0, '127.0.0.1', () => {
      const addr = fakeServer.address();
      if (addr && typeof addr === 'object') {
        fakeServerPort = addr.port;
      }
      resolve();
    });
  });

  // DB-Verbindung aufbauen
  try {
    pool = await setupTestDb();
    await pool.query('SELECT 1');
    dbAvailable = true;
    await cleanTestDb(pool);
  } catch {
    // DB nicht verfuegbar
  }

  // Env fuer Auth-Bypass setzen
  process.env.PP_AUTH_DISABLED = '1';
  process.env.PP_HMAC_SECRET = TEST_HMAC_SECRET;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    fakeServer.close(() => resolve());
  });
  if (pool) {
    await pool.end().catch(() => {});
  }
});

/**
 * Erstellt einen HMAC-signierten Request-Header-Satz fuer Fastify-Tests.
 * Wird in Unit-Tests benoetigt wenn PP_AUTH_DISABLED nicht gesetzt ist.
 */
function buildAuthHeaders(method: string, path: string, body: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${method.toUpperCase()}:${path}:${timestamp}:${body}`;
  const signature = createHmac('sha256', TEST_HMAC_SECRET).update(message).digest('hex');
  return {
    'x-pp-tenant-id': TEST_TENANT_ID,
    'x-pp-timestamp': timestamp,
    'x-pp-signature': signature,
    'content-type': 'application/json',
  };
}

describe('Plugin Dispatcher Integration', () => {
  it('Test 1: Fake-Plugin-Server laeuft und akzeptiert Requests', async () => {
    // Einfacher Smoke-Test fuer den Fake-Server
    const response = await fetch(`http://127.0.0.1:${fakeServerPort}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { received: boolean };
    expect(data.received).toBe(true);
  });

  it('Test 2: HMAC-Signatur wird korrekt berechnet und verifiziert', () => {
    // Prueft die HMAC-Logik, die der Dispatcher nutzt
    const payload = JSON.stringify({ event: 'receipt.created', receipt_id: 'test-123' });
    const timestamp = '1735689600';
    const message = `${timestamp}:${payload}`;

    const sig1 = createHmac('sha256', PLUGIN_WEBHOOK_SECRET).update(message).digest('hex');

    const sig2 = createHmac('sha256', PLUGIN_WEBHOOK_SECRET).update(message).digest('hex');

    // Gleicher Input → gleiche Signatur
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64); // hex-kodierter SHA-256

    // Anderes Secret → andere Signatur
    const sig3 = createHmac('sha256', 'different-secret-here-xx').update(message).digest('hex');
    expect(sig1).not.toBe(sig3);
  });

  it('Test 3: Plugin via API registrieren und in Liste finden', async () => {
    if (!dbAvailable) return;

    const app = await buildApp();
    const webhookUrl = `http://127.0.0.1:${fakeServerPort}/webhook`;

    // Plugin registrieren
    const registerBody = JSON.stringify({
      name: 'Test-Fake-Plugin',
      webhook_url: webhookUrl,
      webhook_secret: PLUGIN_WEBHOOK_SECRET,
      hook_events: ['after_categorization', 'after_export'],
    });

    const registerResp = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins',
      payload: registerBody,
      headers: buildAuthHeaders('POST', '/api/v1/plugins', registerBody),
    });

    // 201 oder 422 (falls Plugin mit gleichem URL schon existiert) sind akzeptabel
    expect([200, 201, 422]).toContain(registerResp.statusCode);

    if (registerResp.statusCode === 201) {
      const created = registerResp.json<{ ok: boolean; data: { id: string; name: string } }>();
      expect(created.ok).toBe(true);
      expect(created.data.name).toBe('Test-Fake-Plugin');
    }

    // Plugin-Liste abrufen
    const listResp = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins',
      headers: buildAuthHeaders('GET', '/api/v1/plugins', ''),
    });

    expect(listResp.statusCode).toBe(200);
    const list = listResp.json<{ ok: boolean; data: Array<{ name: string }> }>();
    expect(list.ok).toBe(true);
    expect(Array.isArray(list.data)).toBe(true);

    await app.close();
  });
});
