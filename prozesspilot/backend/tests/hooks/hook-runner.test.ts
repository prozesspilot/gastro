/**
 * Hook-Runner — Tests
 *
 * Tests:
 *   - Mock DB: 1 http_webhook Hook für 'after_categorization'
 *   - Hook wird aufgerufen, Response-Patch wird gemerged
 *   - Hook-URL nicht erreichbar → Fehler geloggt, Original-Payload zurück
 *   - js_inline Hook ändert receipt.meta.custom → Änderung im Payload
 *   - Timeout → weiter nach timeout_ms
 *   - HMAC-Sig wird korrekt gesetzt (sha256 von Body)
 */

import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hookRunner,
  setHookRunnerDeps,
  clearHookRunnerDeps,
} from '../../src/core/hooks/hook-runner';
import type { Receipt } from '../../src/modules/_shared/receipts/receipt.repository';

interface FakeHookRow {
  hook_id: string;
  customer_id: string;
  hook_point: string;
  implementation: string;
  config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
}

interface FakePool {
  executions: Array<{
    hook_id: string;
    status: string;
    response_status: number | null;
    duration_ms: number | null;
    error_message: string | null;
  }>;
  query: ReturnType<typeof vi.fn>;
}

function buildFakePool(hooks: FakeHookRow[]): FakePool {
  const executions: FakePool['executions'] = [];
  return {
    executions,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/INSERT INTO hook_executions/i.test(sql)) {
        executions.push({
          hook_id: String(params[0]),
          status: String(params[4]),
          response_status: typeof params[6] === 'number' ? (params[6] as number) : null,
          duration_ms: typeof params[8] === 'number' ? (params[8] as number) : null,
          error_message: typeof params[9] === 'string' ? (params[9] as string) : null,
        });
        return { rows: [] };
      }
      if (/customer_hooks/i.test(sql)) {
        const [cid, point] = params as [string, string];
        return {
          rows: hooks
            .filter((h) => h.customer_id === cid && h.hook_point === point && h.enabled)
            .sort((a, b) => a.priority - b.priority),
        };
      }
      if (/customer_credentials/i.test(sql)) {
        return { rows: [{ plaintext: 'super-secret' }] };
      }
      return { rows: [] };
    }),
  };
}

const baseReceipt: Receipt = {
  receipt_id: 'rcpt_001',
  customer_id: 'cust_001',
  status: 'extracted',
  file: { object_key: 'k', mime_type: 'image/jpeg', size_bytes: 1, sha256: 'abc' },
  meta: { tags: [], notes: null, custom: {} },
};

const baseProfile = { customer_id: 'cust_001' };

describe('Hook-Runner', () => {
  afterEach(() => {
    clearHookRunnerDeps();
    vi.clearAllMocks();
  });

  it('No-Op wenn keine Deps verdrahtet sind (backwards compat)', async () => {
    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect(r).toEqual(baseReceipt);
  });

  it('http_webhook: Response-Patch wird gemerged', async () => {
    const fakeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as string;
      // HMAC-Header prüfen
      const sig = (init.headers as Record<string, string>)['x-pp-hook-signature'];
      const expected = createHmac('sha256', 'super-secret').update(body).digest('hex');
      expect(sig).toBe(expected);

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            patch: {
              receipt: {
                meta: { custom: { hook_touched: true } },
              },
            },
          }),
      } as unknown as Response;
    });

    const pool = buildFakePool([
      {
        hook_id: 'hk_1',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: {
          url: 'https://example.com/hook',
          secret_ref: 'wa_access_token',
          timeout_ms: 1000,
        },
        enabled: true,
        priority: 100,
      },
    ]);

    setHookRunnerDeps({ pool: pool as never, pgcryptoKey: 'pgkey', fetchImpl: fakeFetch as never });

    const result = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(result.meta).toBeDefined();
    expect((result.meta as { custom?: { hook_touched?: boolean } }).custom?.hook_touched).toBe(true);
  });

  it('http_webhook: Netzwerkfehler → Original-Payload, Fehler geloggt', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('connection refused');
    });

    const pool = buildFakePool([
      {
        hook_id: 'hk_2',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://unreachable.local/h', secret: 'inline-secret' },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({
      pool: pool as never,
      fetchImpl: fakeFetch as never,
      sleepImpl: async () => undefined, // Backoff im Test nicht abwarten
    });

    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect(r).toEqual(baseReceipt);
    // Default retry_count=3 → 3 Versuche bei Netzwerkfehler
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  it('http_webhook: 4xx → kein Retry, Hook ignoriert', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    } as unknown as Response));
    const pool = buildFakePool([
      {
        hook_id: 'hk_3',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://x/h' },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never, fetchImpl: fakeFetch as never });

    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect(r).toEqual(baseReceipt);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('js_inline: Code mutiert payload.receipt.meta.custom', async () => {
    const pool = buildFakePool([
      {
        hook_id: 'hk_js_1',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'js_inline',
        config: {
          code:
            'payload.receipt.meta = payload.receipt.meta || {}; ' +
            'payload.receipt.meta.custom = payload.receipt.meta.custom || {}; ' +
            'payload.receipt.meta.custom.added_by_js = "yes";',
          timeout_ms: 500,
        },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never });

    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect((r.meta as { custom?: { added_by_js?: string } }).custom?.added_by_js).toBe('yes');
  });

  it('js_inline: Endlosschleife wird durch VM-Timeout beendet, Original-Payload bleibt', async () => {
    const pool = buildFakePool([
      {
        hook_id: 'hk_js_2',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'js_inline',
        config: { code: 'while(true){}', timeout_ms: 50 },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never });

    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect(r).toEqual(baseReceipt);
  });

  it('mehrere Hooks: priority asc, Patches werden nacheinander gemerged', async () => {
    const fakeFetch = vi.fn(async (_url, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const tag = body.receipt.meta?.custom?.added ?? 'first';
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ patch: { receipt: { meta: { custom: { added: tag + '+x' } } } } }),
      } as unknown as Response;
    });

    const pool = buildFakePool([
      {
        hook_id: 'hk_a',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://h/1' },
        enabled: true,
        priority: 10,
      },
      {
        hook_id: 'hk_b',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://h/2' },
        enabled: true,
        priority: 20,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never, fetchImpl: fakeFetch as never });

    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect((r.meta as { custom?: { added?: string } }).custom?.added).toBe('first+x+x');
  });

  it('disabled implementation wird übersprungen', async () => {
    const pool = buildFakePool([
      {
        hook_id: 'hk_dis',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'disabled',
        config: {},
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never });
    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect(r).toEqual(baseReceipt);
  });

  // ── User-Aufgabe 2 — explizite Test-Cases ────────────────────────────────

  it('User: Hook mit Erfolg → execution geloggt, status=success', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    } as unknown as Response));
    const pool = buildFakePool([
      {
        hook_id: 'hk_log_ok',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://h/ok', secret: 'inline-secret', retry_count: 1 },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never, fetchImpl: fakeFetch as never });
    await hookRunner.run('after_categorization', { receipt: baseReceipt, profile: baseProfile });

    // Insert in hook_executions wird via void getriggert — wartete kurz, damit
    // der microtask abgeschlossen ist.
    await new Promise((r) => setImmediate(r));
    expect(pool.executions.length).toBe(1);
    expect(pool.executions[0]).toMatchObject({
      hook_id: 'hk_log_ok',
      status: 'success',
      response_status: 200,
    });
    expect(pool.executions[0].duration_ms).not.toBeNull();
  });

  it('User: Hook mit Timeout → execution geloggt als timeout, Pipeline läuft weiter', async () => {
    const fakeFetch = vi.fn(async (_url, init: RequestInit) => {
      // Simuliert AbortError beim Timeout
      const signal = init.signal;
      if (signal) {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            (err as Error).name = 'AbortError';
            reject(err);
          });
        });
      }
      throw new Error('no signal');
    });
    const pool = buildFakePool([
      {
        hook_id: 'hk_to',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://h/to', secret: 'inline-secret', timeout_ms: 30, retry_count: 1 },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({
      pool: pool as never,
      fetchImpl: fakeFetch as never,
      sleepImpl: async () => undefined,
    });

    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    // Pipeline läuft weiter → Original-Receipt
    expect(r).toEqual(baseReceipt);
    await new Promise((res) => setImmediate(res));
    expect(pool.executions.length).toBe(1);
    expect(pool.executions[0].status).toBe('timeout');
  });

  it('User: Hook mit falschem Secret wird trotzdem gesendet (Empfänger verifiziert)', async () => {
    let receivedSig = '';
    const fakeFetch = vi.fn(async (_url, init: RequestInit) => {
      receivedSig = (init.headers as Record<string, string>)['x-prozesspilot-signature'];
      // Empfänger antwortet 401, weil HMAC nicht zu seinem Secret passt — das ist
      // sein Job, nicht unserer. Wir schicken trotzdem. Die Hook-Execution wird
      // mit failure geloggt.
      return { ok: false, status: 401, text: async () => 'wrong sig' } as unknown as Response;
    });
    const pool = buildFakePool([
      {
        hook_id: 'hk_wrong_sec',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://h/v', secret: 'attacker-controlled', retry_count: 1 },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never, fetchImpl: fakeFetch as never });
    await hookRunner.run('after_categorization', { receipt: baseReceipt, profile: baseProfile });
    expect(receivedSig).toMatch(/^[0-9a-f]{64}$/);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    await new Promise((res) => setImmediate(res));
    expect(pool.executions[0].status).toBe('failure');
    expect(pool.executions[0].response_status).toBe(401);
  });

  it('User: Kein Hook in DB → Receipt unverändert, kein Execution-Eintrag', async () => {
    const pool = buildFakePool([]);
    setHookRunnerDeps({ pool: pool as never });
    const r = await hookRunner.run('after_categorization', {
      receipt: baseReceipt,
      profile: baseProfile,
    });
    expect(r).toEqual(baseReceipt);
    expect(pool.executions.length).toBe(0);
  });

  it('Execution-Log enthält response_status 200 bei Erfolg', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ patch: { receipt: { meta: { custom: { x: 1 } } } } }),
    } as unknown as Response));
    const pool = buildFakePool([
      {
        hook_id: 'hk_status',
        customer_id: 'cust_001',
        hook_point: 'after_categorization',
        implementation: 'http_webhook',
        config: { url: 'http://h/x', secret: 'inline', retry_count: 1 },
        enabled: true,
        priority: 100,
      },
    ]);
    setHookRunnerDeps({ pool: pool as never, fetchImpl: fakeFetch as never });
    await hookRunner.run('after_categorization', { receipt: baseReceipt, profile: baseProfile });
    await new Promise((res) => setImmediate(res));
    expect(pool.executions[0].response_status).toBe(200);
    expect(pool.executions[0].status).toBe('success');
  });
});
