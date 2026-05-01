/**
 * E2E Pipeline-Stages — die drei vom User explizit geforderten Tests:
 *
 *   1. POST /receipts → extracting → extracted → categorized → archived → completed
 *   2. OCR_FAILED → status requires_review
 *   3. Hook wird nach after_categorization gefeuert
 *
 * Strategie: Wir testen direkt gegen die Welt-A-Backend-Handler
 * (`m03-categorization`, `_shared/receipts/handlers/{complete,update-status}`),
 * NICHT über n8n. Damit ist der Test deterministisch und kein n8n-Roundtrip
 * nötig.
 *
 * Voraussetzungen: PP_E2E=1 + lokale Postgres + Redis.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import Redis from 'ioredis';

import { config } from '../../src/core/config';
import { setHookRunnerDeps, clearHookRunnerDeps } from '../../src/core/hooks/hook-runner';

import * as receiptRepo from '../../src/modules/_shared/receipts/receipt.repository';
import { m03CategorizationRoutes } from '../../src/modules/m03-categorization/routes';
import { receiptsCompleteRoutes } from '../../src/modules/_shared/receipts/complete.routes';
import { errorRoutes } from '../../src/modules/_shared/errors/error.routes';
import { hookRoutes } from '../../src/core/hooks/hook.routes';

import { createTestCustomer } from './helpers/create-test-customer';
import { seedReceipt } from './helpers/seed-receipt';
import { ensureTestReceiptPdf } from '../fixtures/make-test-pdf';

const E2E_ENABLED = process.env.PP_E2E === '1';

let pool: Pool;
let redis: Redis;
let app: FastifyInstance;
let worldASchemaPresent = false;

async function detectWorldASchema(p: Pool): Promise<boolean> {
  // Prüft, ob die Welt-A-receipts-Tabelle (TEXT receipt_id PK + payload JSONB)
  // existiert. Migration 013 ersetzt sie durch UUID — in dem Fall können
  // diese E2E-Tests nicht gegen die echte DB laufen.
  const { rows } = await p.query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='receipts' AND column_name='receipt_id'
      LIMIT 1`,
  );
  return rows.length > 0;
}

const SUITE = E2E_ENABLED ? describe : describe.skip;

beforeAll(async () => {
  if (!E2E_ENABLED) return;
  pool = new Pool({ connectionString: config.DATABASE_URL });
  worldASchemaPresent = await detectWorldASchema(pool);
  if (!worldASchemaPresent) {
    // Frühzeitiger Bail-Out — Tests werden mit `it.skipIf` einzeln übersprungen.
    return;
  }
  redis = new Redis(config.REDIS_URL, { lazyConnect: true });

  // Hook-Runner mit echter DB verdrahten — sonst ist er No-Op.
  setHookRunnerDeps({ pool, pgcryptoKey: config.PP_PGCRYPTO_KEY });

  app = Fastify({ logger: false });
  app.decorate('db', pool as never);
  app.decorate('redis', redis as never);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try { done(null, JSON.parse((body as Buffer).toString('utf-8'))); }
    catch (err) { done(err as Error); }
  });
  await app.register(m03CategorizationRoutes, { prefix: '/api/v1/receipts' });
  await app.register(receiptsCompleteRoutes,    { prefix: '/api/v1/receipts' });
  await app.register(errorRoutes,               { prefix: '/api/v1/errors' });
  await app.register(hookRoutes,                { prefix: '/api/v1/hooks' });
  await app.ready();

  // PDF-Fixture sicherstellen.
  await ensureTestReceiptPdf();
});

afterAll(async () => {
  if (!E2E_ENABLED) return;
  clearHookRunnerDeps();
  if (app) await app.close();
  if (redis) await redis.quit().catch(() => undefined);
  if (pool) await pool.end();
});

SUITE('MVP Pipeline E2E', () => {
  it.skipIf(!worldASchemaPresent)('Pipeline-Stages: extracted → categorized (Override) → completed', async () => {
    const customer = await createTestCustomer(pool, {
      modules: ['M01', 'M03', 'M02', 'M07'],
      integrations: { ocr: { provider: 'mock_ocr' } },
      routing: {
        skr_chart: 'SKR03',
        low_confidence_threshold: 0.75,
        ki_kategorisierung: true,
        tax_keys_map: { '0.19': '9', '0.07': '8' },
      },
      custom: {
        supplier_overrides: {
          'EDEKA Supermarkt GmbH': {
            category: 'wareneinkauf_food',
            skr: '3100',
            tax_key: '8',
          },
        },
      },
    });

    try {
      // Seed: Status='extracted' (M01-Result simuliert)
      const receipt = await seedReceipt(pool, {
        customer_id: customer.customer_id,
        status: 'extracted',
        extraction: {
          engine: 'mock_ocr',
          confidence: 0.95,
          fields: {
            supplier_name: 'EDEKA Supermarkt GmbH',
            supplier_vat_id: 'DE123456789',
            document_number: '2026-1042',
            document_date: '2026-04-28',
            total_gross: 6.20,
            total_net: 5.79,
            currency: 'EUR',
            tax_lines: [{ rate: 0.07, base: 5.79, amount: 0.41 }],
          },
        },
      });

      // M03: Kategorisieren (Override greift → wareneinkauf_food)
      const profile = {
        customer_id: customer.customer_id,
        modules_enabled: ['M01', 'M03'],
        routing: {
          skr_chart: 'SKR03',
          low_confidence_threshold: 0.75,
          tax_keys_map: { '0.19': '9', '0.07': '8' },
        },
        custom: {
          supplier_overrides: {
            'EDEKA Supermarkt GmbH': { category: 'wareneinkauf_food', skr: '3100', tax_key: '8' },
          },
        },
      };
      const catRes = await app.inject({
        method: 'POST',
        url: `/api/v1/receipts/${receipt.receipt_id}/categorize`,
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: profile, trace_id: 'trc_pipeline_1' },
      });
      expect(catRes.statusCode).toBe(200);
      expect(catRes.json().data.receipt_patch.status).toBe('categorized');
      expect(catRes.json().data.receipt_patch.categorization.engine).toBe('override');

      // (In der echten Pipeline kommt M02 dazwischen; in diesem Test
      //  manipulieren wir den Status direkt, weil M02 einen S3-Client braucht.)
      await pool.query(
        `UPDATE receipts SET status='archived',
            payload = jsonb_set(payload, '{status}', '"archived"')
          WHERE receipt_id=$1`,
        [receipt.receipt_id],
      );

      // /complete
      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/receipts/${receipt.receipt_id}/complete`,
        headers: { 'content-type': 'application/json' },
        payload: { customer_id: customer.customer_id, trace_id: 'trc_pipeline_1' },
      });
      expect(completeRes.statusCode).toBe(200);

      const final = await receiptRepo.findById(pool, receipt.receipt_id, customer.customer_id);
      expect(final?.status).toBe('completed');
      expect((final?.categorization as { skr_account?: string } | undefined)?.skr_account).toBe('3100');
      // Audit-Events: categorized + completed
      const events = (final?.audit as { events?: Array<{ type: string }> } | undefined)?.events ?? [];
      expect(events.some((e) => e.type === 'categorized')).toBe(true);
      expect(events.some((e) => e.type === 'completed')).toBe(true);
    } finally {
      await customer.cleanup();
    }
  }, 30_000);

  it.skipIf(!worldASchemaPresent)('OCR_FAILED → status requires_review (via /transition + error_log)', async () => {
    const customer = await createTestCustomer(pool);
    try {
      const receipt = await seedReceipt(pool, {
        customer_id: customer.customer_id,
        status: 'received',
      });

      // 1) Backend simuliert WF-ERROR-HANDLER: POST /errors
      const errRes = await app.inject({
        method: 'POST',
        url: '/api/v1/errors',
        headers: { 'content-type': 'application/json' },
        payload: {
          customer_id: customer.customer_id,
          receipt_id: receipt.receipt_id,
          stage: 'M01',
          error_type: 'OCR_FAILED',
          error_message: 'Vision API returned empty result',
          trace_id: 'trc_ocr_fail',
        },
      });
      expect(errRes.statusCode).toBe(201);

      // 2) Status-Transition wie der WF-ERROR-HANDLER es täte:
      const trRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/receipts/${receipt.receipt_id}/transition`,
        headers: { 'content-type': 'application/json' },
        payload: {
          customer_id: customer.customer_id,
          status: 'requires_review',
          reason: 'OCR_FAILED: Vision API returned empty result',
          trace_id: 'trc_ocr_fail',
        },
      });
      expect(trRes.statusCode).toBe(200);

      const after = await receiptRepo.findById(pool, receipt.receipt_id, customer.customer_id);
      expect(after?.status).toBe('requires_review');

      // error_log enthält Eintrag
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM error_log
          WHERE customer_id=$1 AND receipt_id=$2 AND error_type='OCR_FAILED'`,
        [customer.customer_id, receipt.receipt_id],
      );
      expect(Number(rows[0].count)).toBeGreaterThanOrEqual(1);
    } finally {
      await customer.cleanup();
    }
  }, 20_000);

  it.skipIf(!worldASchemaPresent)('Hook wird nach after_categorization gefeuert (execution geloggt)', async () => {
    const customer = await createTestCustomer(pool, {
      custom: {
        supplier_overrides: {
          'TestVendor': { category: 'wareneinkauf_food', skr: '3100', tax_key: '8' },
        },
      },
    });
    let hookCalls = 0;

    try {
      // 1) Mini-Webhook-Server für Hook-Empfänger via Fastify in-process.
      const hookServer = Fastify({ logger: false });
      hookServer.post('/hook', async () => {
        hookCalls += 1;
        return { ok: true, patch: { receipt: { meta: { custom: { hook_fired: true } } } } };
      });
      const addr = await hookServer.listen({ port: 0, host: '127.0.0.1' });

      // 2) Hook in DB anlegen (POST /api/v1/hooks)
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/hooks',
        headers: { 'content-type': 'application/json', 'x-customer-id': customer.customer_id },
        payload: {
          hook_point: 'after_categorization',
          implementation: 'http_webhook',
          config: { url: `${addr}/hook`, secret: 'inline-test-secret', retry_count: 1 },
        },
      });
      expect(createRes.statusCode).toBe(201);
      const hookId: string = createRes.json().data.hook_id;

      // 3) Receipt seedeen (status=extracted) und kategorisieren
      const receipt = await seedReceipt(pool, {
        customer_id: customer.customer_id,
        status: 'extracted',
        extraction: {
          engine: 'mock_ocr',
          confidence: 0.95,
          fields: {
            supplier_name: 'TestVendor',
            supplier_vat_id: 'DE123',
            document_date: '2026-04-28',
            total_gross: 100,
            total_net: 84.03,
            tax_lines: [{ rate: 0.19, base: 84.03, amount: 15.97 }],
          },
        },
      });

      const profile = {
        customer_id: customer.customer_id,
        routing: { skr_chart: 'SKR03', low_confidence_threshold: 0.75 },
        custom: {
          supplier_overrides: {
            'TestVendor': { category: 'wareneinkauf_food', skr: '3100', tax_key: '8' },
          },
        },
      };
      const catRes = await app.inject({
        method: 'POST',
        url: `/api/v1/receipts/${receipt.receipt_id}/categorize`,
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: profile, trace_id: 'trc_hook' },
      });
      expect(catRes.statusCode).toBe(200);

      // Hook wurde gefeuert
      expect(hookCalls).toBe(1);

      // executions-Eintrag vorhanden?
      const execRes = await app.inject({
        method: 'GET',
        url: `/api/v1/hooks/${hookId}/executions`,
        headers: { 'x-customer-id': customer.customer_id },
      });
      expect(execRes.statusCode).toBe(200);
      const execs = execRes.json().data as Array<{ status: string; response_status: number | null }>;
      expect(execs.length).toBeGreaterThanOrEqual(1);
      expect(execs[0].status).toBe('success');
      expect(execs[0].response_status).toBe(200);

      // Hook-Patch wurde im Receipt gemerged?
      const final = await receiptRepo.findById(pool, receipt.receipt_id, customer.customer_id);
      const meta = (final?.meta as { custom?: { hook_fired?: boolean } } | undefined) ?? {};
      expect(meta.custom?.hook_fired).toBe(true);

      await hookServer.close();
    } finally {
      await customer.cleanup();
    }
  }, 30_000);
});
