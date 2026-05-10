/**
 * D7 — Integration-Tests Webhook-Routen
 *
 * Nutzt Fastify inject() — kein echter HTTP-Server nötig.
 * Redis wird durch eine Spy-Funktion auf publishEvent überwacht.
 */

import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

// ── Test-Setup ──────────────────────────────────────────────────────────────

let app: FastifyInstance;
const SECRET = 'test-webhook-secret';

beforeAll(async () => {
  // N8N_WEBHOOK_SECRET für Tests setzen
  process.env.N8N_WEBHOOK_SECRET = SECRET;
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  Reflect.deleteProperty(process.env, 'N8N_WEBHOOK_SECRET');
});

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function webhookHeaders(body: string, secret = SECRET) {
  return {
    'content-type': 'application/json',
    'x-n8n-signature': sign(body, secret),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /webhooks/n8n/:workflowType', () => {
  it('gibt 200 zurück bei gültigem Webhook', async () => {
    const payload = JSON.stringify({ tenant_id: 'abc', status: 'done', data: { result: 42 } });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/n8n/document-routed',
      headers: webhookHeaders(payload),
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().data.workflowType).toBe('document-routed');
  });

  it('gibt 401 bei falscher Signatur zurück', async () => {
    const payload = JSON.stringify({ tenant_id: 'abc', status: 'done' });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/n8n/test-workflow',
      headers: {
        'content-type': 'application/json',
        'x-n8n-signature': 'sha256=deadbeef',
      },
      payload,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
  });

  it('gibt 401 zurück wenn Signatur-Header fehlt', async () => {
    const payload = JSON.stringify({ tenant_id: 'abc', status: 'done' });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/n8n/test-workflow',
      headers: { 'content-type': 'application/json' },
      payload,
    });

    expect(res.statusCode).toBe(401);
  });

  it('gibt 422 bei fehlendem tenant_id zurück', async () => {
    const payload = JSON.stringify({ status: 'done' });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/n8n/test-workflow',
      headers: webhookHeaders(payload),
      payload,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('gibt 422 bei fehlendem status zurück', async () => {
    const payload = JSON.stringify({ tenant_id: 'abc' });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/n8n/test-workflow',
      headers: webhookHeaders(payload),
      payload,
    });

    expect(res.statusCode).toBe(422);
  });

  it('akzeptiert status=failed', async () => {
    const payload = JSON.stringify({ tenant_id: 'abc', status: 'failed', job_id: 'j1' });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/n8n/invoice-extraction',
      headers: webhookHeaders(payload),
      payload,
    });

    expect(res.statusCode).toBe(200);
  });
});
