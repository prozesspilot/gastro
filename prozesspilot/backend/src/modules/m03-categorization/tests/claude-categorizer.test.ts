/**
 * M03 — claude-categorizer Tests
 *
 * Cache-Hit (Redis und DB) und Retry-Verhalten bei 5xx.
 */

import { describe, expect, it, vi } from 'vitest';
import { ClaudeCategorizer, buildUserMessage } from '../services/claude-categorizer';
import type { AnthropicLikeClient, AnthropicMessageResponse } from '../services/claude-categorizer';

function makeMockClient(responses: Array<AnthropicMessageResponse | Error>): AnthropicLikeClient {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        if (r instanceof Error) throw r;
        return r;
      }),
    },
  };
}

function fakePool() {
  const stored = new Map<string, unknown>();
  return {
    stored,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/SELECT result FROM categorization_cache/i.test(sql)) {
        const v = stored.get(String(params[0]));
        return { rows: v ? [{ result: v }] : [] };
      }
      if (/INSERT INTO categorization_cache/i.test(sql)) {
        stored.set(String(params[0]), JSON.parse(String(params[1])));
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

const VALID_RESPONSE: AnthropicMessageResponse = {
  content: [
    {
      type: 'tool_use',
      id: 'tool_1',
      name: 'categorize_receipt',
      input: {
        category: 'wareneinkauf_food',
        category_label: 'Wareneinkauf Lebensmittel',
        skr_account: '3100',
        tax_key: '9',
        cost_center: null,
        confidence: 0.91,
        rationale: 'Lebensmittel-Großhandel; Positionen passen.',
      },
    },
  ],
};

const REQ = {
  context: {
    customerId: 'cust_001',
    supplierName: 'Metro AG',
    supplierVatId: 'DE123456789',
    documentDate: '2026-04-28',
    totalGross: 142.85,
    totalNet: 120.04,
    currency: 'EUR',
    taxLines: [{ rate: 0.07, base: 20.04, amount: 1.4 }],
    lineItems: [{ description: 'Mehl', qty: 4, unit_price: 18.5 }],
  },
  customerId: 'cust_001',
  skrChart: 'SKR03' as const,
};

describe('M03 claude-categorizer', () => {
  it('valider Tool-Use → korrektes Result', async () => {
    const pool = fakePool();
    const client = makeMockClient([VALID_RESPONSE]);
    const cat = new ClaudeCategorizer({ pool: pool as never, client });
    const r = await cat.categorize(REQ);
    expect(r.engine).toBe('claude_sonnet_4_6');
    expect(r.category).toBe('wareneinkauf_food');
    expect(r.skr_account).toBe('3100');
    expect(r.confidence).toBe(0.91);
  });

  it('Cache-Hit (DB) → engine=claude_cached, kein API-Call', async () => {
    const pool = fakePool();
    // Pre-warm cache
    const cat1 = new ClaudeCategorizer({ pool: pool as never, client: makeMockClient([VALID_RESPONSE]) });
    const r1 = await cat1.categorize(REQ);
    expect(r1.engine).toBe('claude_sonnet_4_6');
    expect(pool.stored.size).toBe(1);

    // Zweiter Aufruf: gleiche Inputs → Cache-Hit; Client-Fehler darf nicht aufgerufen werden
    const apiSpy = vi.fn();
    const cat2 = new ClaudeCategorizer({
      pool: pool as never,
      client: { messages: { create: apiSpy } },
    });
    const r2 = await cat2.categorize(REQ);
    expect(r2.engine).toBe('claude_cached');
    expect(r2.category).toBe('wareneinkauf_food');
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('5xx Retry: 2× 503, dann Erfolg', async () => {
    const pool = fakePool();
    const err503 = Object.assign(new Error('boom'), { status: 503 });
    const client = makeMockClient([err503, err503, VALID_RESPONSE]);
    const cat = new ClaudeCategorizer({
      pool: pool as never,
      client,
      sleepMs: async () => undefined,
    });
    const r = await cat.categorize(REQ);
    expect(r.engine).toBe('claude_sonnet_4_6');
    expect(client.messages.create).toHaveBeenCalledTimes(3);
  });

  it('5xx 3× → Fallback auf sonstige_aufwand', async () => {
    const pool = fakePool();
    const err503 = Object.assign(new Error('boom'), { status: 503 });
    const client = makeMockClient([err503, err503, err503, err503]);
    const cat = new ClaudeCategorizer({
      pool: pool as never,
      client,
      sleepMs: async () => undefined,
    });
    const r = await cat.categorize(REQ);
    expect(r.engine).toBe('fallback_after_error');
    expect(r.category).toBe('sonstige_aufwand');
    expect(r.confidence).toBe(0.5);
  });

  it('ungültige Tool-Use Antwort → Re-Prompt; bei zweiter Ungültigkeit Fallback', async () => {
    const pool = fakePool();
    const invalid: AnthropicMessageResponse = { content: [{ type: 'text', text: 'kein tool' }] };
    const client = makeMockClient([invalid, invalid]);
    const cat = new ClaudeCategorizer({ pool: pool as never, client });
    const r = await cat.categorize(REQ);
    expect(r.engine).toBe('fallback_after_error');
  });

  it('buildUserMessage enthält Lieferant, Beträge, Kontenrahmen', () => {
    const msg = buildUserMessage({ ...REQ, industryHint: 'Gastronomie' });
    expect(msg).toMatch(/Lieferant: Metro AG/);
    expect(msg).toMatch(/USt-ID: DE123456789/);
    expect(msg).toMatch(/Kontenrahmen: SKR03/);
    expect(msg).toMatch(/Branche: Gastronomie/);
  });
});
