/**
 * Hook-Routes — Integrationstest mit Fastify-Inject + Fake-DB.
 *
 * Deckt: GET (list), POST (create), GET (single), PUT (update), DELETE,
 * GET /executions. Plus: 400 bei fehlendem x-customer-id-Header,
 * 404 bei unbekannten Hooks, 422 bei ungültigem Body.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { hookRoutes } from '../../src/core/hooks/hook.routes';

interface FakeHookRow {
  hook_id: string;
  customer_id: string;
  hook_point: string;
  implementation: string;
  config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
}

interface FakeDb {
  hooks: FakeHookRow[];
  executions: Array<{ hook_id: string; customer_id: string; status: string; created_at: Date }>;
  reset(): void;
  query: ReturnType<typeof vi.fn>;
}

const fakeDb: FakeDb = {
  hooks: [],
  executions: [],
  reset() {
    this.hooks = [];
    this.executions = [];
  },
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    // INSERT customer_hooks
    if (/INSERT INTO customer_hooks/i.test(sql)) {
      const [hookId, customerId, hookPoint, implementation, configJson, enabled, priority] =
        params as [string, string, string, string, string, boolean, number];
      const row: FakeHookRow = {
        hook_id: hookId,
        customer_id: customerId,
        hook_point: hookPoint,
        implementation,
        config: JSON.parse(configJson) as Record<string, unknown>,
        enabled,
        priority,
      };
      fakeDb.hooks.push(row);
      return { rows: [row] };
    }
    // UPDATE customer_hooks
    if (/UPDATE customer_hooks/i.test(sql)) {
      const customerId = params[0] as string;
      const hookId = params[1] as string;
      const idx = fakeDb.hooks.findIndex(
        (h) => h.customer_id === customerId && h.hook_id === hookId,
      );
      if (idx === -1) return { rows: [] };
      // Sehr einfacher Patch-Apply: parse alle SET-Ausdrücke
      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
      if (setMatch) {
        const setClauses = setMatch[1].split(',').map((s) => s.trim());
        let p = 2;
        for (const clause of setClauses) {
          const m = clause.match(/^(\w+)\s*=\s*\$(\d+)/);
          if (!m) continue;
          const col = m[1];
          if (col === 'updated_at') continue;
          const v = params[p++];
          if (col === 'config' && typeof v === 'string') {
            (fakeDb.hooks[idx] as Record<string, unknown>)[col] = JSON.parse(v);
          } else {
            (fakeDb.hooks[idx] as Record<string, unknown>)[col] = v;
          }
        }
      }
      return { rows: [fakeDb.hooks[idx]] };
    }
    // DELETE customer_hooks
    if (/DELETE FROM customer_hooks/i.test(sql)) {
      const [customerId, hookId] = params as [string, string];
      const before = fakeDb.hooks.length;
      fakeDb.hooks = fakeDb.hooks.filter(
        (h) => !(h.customer_id === customerId && h.hook_id === hookId),
      );
      return { rowCount: before - fakeDb.hooks.length, rows: [] };
    }
    // SELECT customer_hooks (single by id)
    if (/customer_hooks/i.test(sql) && /AND hook_id/i.test(sql)) {
      const [customerId, hookId] = params as [string, string];
      const r = fakeDb.hooks.find((h) => h.customer_id === customerId && h.hook_id === hookId);
      return { rows: r ? [r] : [] };
    }
    // SELECT customer_hooks list (by customer)
    if (/customer_hooks/i.test(sql)) {
      const [customerId] = params as [string];
      const list = fakeDb.hooks.filter((h) => h.customer_id === customerId);
      return { rows: list };
    }
    // SELECT hook_executions
    if (/hook_executions/i.test(sql)) {
      const [customerId, hookId] = params as [string, string];
      const list = fakeDb.executions
        .filter((e) => e.customer_id === customerId && e.hook_id === hookId)
        .map((e) => ({
          ...e,
          response_status: null,
          request_payload: null,
          response_body: null,
          duration_ms: null,
          error_message: null,
          trace_id: null,
          hook_point: 'after_categorization',
          execution_id: 'ex_x',
        }));
      return { rows: list };
    }
    return { rows: [] };
  }),
};

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.decorate('db', fakeDb as never);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf-8')));
    } catch (err) {
      done(err as Error);
    }
  });
  await app.register(hookRoutes, { prefix: '/api/v1/hooks' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
});

const headers = { 'content-type': 'application/json', 'x-customer-id': 'cust_route_test' };

describe('Hook-Routes', () => {
  it('POST /hooks → 201 + hook_id zurück', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/hooks',
      headers,
      payload: {
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'https://example.com/h', secret: 's' },
        enabled: true,
        priority: 50,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.hook_id).toMatch(/^hk_/);
    expect(body.data.hook_point).toBe('after_categorization');
    expect(fakeDb.hooks.length).toBe(1);
  });

  it('POST /hooks ohne x-customer-id → 400 MISSING_CUSTOMER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/hooks',
      headers: { 'content-type': 'application/json' },
      payload: { hook_point: 'after_categorization', implementation: 'http_webhook' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_CUSTOMER');
  });

  it('POST /hooks mit ungültigem hook_point → 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/hooks',
      headers,
      payload: { hook_point: 'bogus', implementation: 'http_webhook' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('GET /hooks listet alle Hooks des Customers', async () => {
    fakeDb.hooks.push({
      hook_id: 'hk_a',
      customer_id: 'cust_route_test',
      hook_point: 'after_categorization',
      implementation: 'http_webhook',
      config: {},
      enabled: true,
      priority: 100,
    });
    fakeDb.hooks.push({
      hook_id: 'hk_b',
      customer_id: 'cust_other',
      hook_point: 'after_categorization',
      implementation: 'http_webhook',
      config: {},
      enabled: true,
      priority: 100,
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/hooks', headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].hook_id).toBe('hk_a');
  });

  it('GET /hooks/:id → 404 wenn fremder Customer', async () => {
    fakeDb.hooks.push({
      hook_id: 'hk_owned',
      customer_id: 'cust_other',
      hook_point: 'after_categorization',
      implementation: 'disabled',
      config: {},
      enabled: true,
      priority: 100,
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/hooks/hk_owned', headers });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /hooks/:id ändert enabled-Flag', async () => {
    fakeDb.hooks.push({
      hook_id: 'hk_upd',
      customer_id: 'cust_route_test',
      hook_point: 'after_categorization',
      implementation: 'http_webhook',
      config: { url: 'http://h' },
      enabled: true,
      priority: 100,
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/hooks/hk_upd',
      headers,
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.enabled).toBe(false);
  });

  it('DELETE /hooks/:id löscht den Hook', async () => {
    fakeDb.hooks.push({
      hook_id: 'hk_del',
      customer_id: 'cust_route_test',
      hook_point: 'after_categorization',
      implementation: 'disabled',
      config: {},
      enabled: true,
      priority: 100,
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/hooks/hk_del', headers });
    expect(res.statusCode).toBe(200);
    expect(fakeDb.hooks.length).toBe(0);
  });

  it('GET /hooks/:id/executions → 404 wenn Hook unbekannt', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/hooks/hk_unknown/executions',
      headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /hooks/:id/executions liefert Array', async () => {
    fakeDb.hooks.push({
      hook_id: 'hk_with_exec',
      customer_id: 'cust_route_test',
      hook_point: 'after_categorization',
      implementation: 'http_webhook',
      config: {},
      enabled: true,
      priority: 100,
    });
    fakeDb.executions.push({
      hook_id: 'hk_with_exec',
      customer_id: 'cust_route_test',
      status: 'success',
      created_at: new Date(),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/hooks/hk_with_exec/executions',
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].status).toBe('success');
  });
});
