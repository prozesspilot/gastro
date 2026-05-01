/**
 * M03 — Handler-Tests für POST /api/v1/receipts/:receipt_id/categorize
 *
 * Tests:
 *   1. Override greift → kein Claude-Call, confidence=1.0, status='categorized'
 *   2. Master-Data greift (≥0.9) → kein Claude-Call
 *   3. Claude-Fallback → Tool-Use korrekt gemappt
 *   4. Claude 5xx 3× → Fallback 'sonstige_aufwand', confidence < threshold → requires_review
 *   5. Confidence < 0.75 → status='requires_review'
 *   6. branch_rules → cost_center korrekt gesetzt
 *   7. Cache-Hit (DB) → engine='claude_cached', kein API-Call (per claude-categorizer)
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { m03CategorizationRoutes } from '../routes';
import type { AnthropicLikeClient, AnthropicMessageResponse } from '../services/claude-categorizer';

// ── Fake DB ──────────────────────────────────────────────────────────────────

interface FakeReceiptRow {
  receipt_id: string;
  customer_id: string;
  status: string;
  file_object_key: string;
  file_sha256: string;
  payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface FakeDb {
  receipts: FakeReceiptRow[];
  audits: { action: string; payload: unknown }[];
  suppliers: Array<{
    supplier_id: string;
    vat_id: string | null;
    display_name: string;
    aliases: string[];
    default_category: string | null;
    default_skr: string | null;
  }>;
  categories: Array<{
    category_id: string;
    label_de: string;
    default_skr03: string | null;
    default_skr04: string | null;
    default_tax_key: string | null;
  }>;
  customer_categories: Array<{
    customer_id: string;
    category_id: string;
    override_skr: string | null;
    override_tax_key: string | null;
  }>;
  categorization_cache: Map<string, unknown>;
  reset(): void;
  query: ReturnType<typeof vi.fn>;
}

const fakeDb: FakeDb = {
  receipts: [],
  audits: [],
  suppliers: [],
  categories: [
    { category_id: 'wareneinkauf_food', label_de: 'Wareneinkauf Lebensmittel', default_skr03: '3100', default_skr04: '5100', default_tax_key: '9' },
    { category_id: 'sonstige_aufwand', label_de: 'Sonstige Betriebskosten', default_skr03: '4980', default_skr04: '6300', default_tax_key: '9' },
  ],
  customer_categories: [],
  categorization_cache: new Map(),
  reset() {
    this.receipts = [];
    this.audits = [];
    this.suppliers = [];
    this.customer_categories = [];
    this.categorization_cache = new Map();
  },
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO audit_log/i.test(sql)) {
      fakeDb.audits.push({ action: String(params[2]), payload: JSON.parse(String(params[4])) });
      return { rows: [] };
    }
    if (/INSERT INTO categorization_cache/i.test(sql)) {
      fakeDb.categorization_cache.set(String(params[0]), JSON.parse(String(params[1])));
      return { rows: [] };
    }
    if (/SELECT result FROM categorization_cache/i.test(sql)) {
      const v = fakeDb.categorization_cache.get(String(params[0]));
      return { rows: v ? [{ result: v }] : [] };
    }
    if (/UPDATE\s+receipts/i.test(sql)) {
      const [id, status, key, sha, payloadJson] = params as [string, string, string, string, string];
      const idx = fakeDb.receipts.findIndex((r) => r.receipt_id === id);
      if (idx === -1) return { rows: [] };
      fakeDb.receipts[idx] = {
        ...fakeDb.receipts[idx],
        status,
        file_object_key: key,
        file_sha256: sha,
        payload: JSON.parse(payloadJson),
        updated_at: new Date(),
      };
      return { rows: [fakeDb.receipts[idx]] };
    }
    if (/SELECT[\s\S]*FROM\s+receipts/i.test(sql)) {
      const [id, cid] = params as [string, string];
      const row = fakeDb.receipts.find((r) => r.receipt_id === id && r.customer_id === cid);
      return { rows: row ? [row] : [] };
    }
    if (/customer_categories/i.test(sql)) {
      const [cid, catId] = params as [string, string];
      const row = fakeDb.customer_categories.find((r) => r.customer_id === cid && r.category_id === catId);
      return { rows: row ? [row] : [] };
    }
    if (/categories/i.test(sql) && /label_de|default_skr03/i.test(sql)) {
      const [catId] = params as [string];
      const row = fakeDb.categories.find((c) => c.category_id === catId);
      return { rows: row ? [row] : [] };
    }
    if (/suppliers_global/i.test(sql)) {
      const [name, vat] = params as [string, string];
      const row = fakeDb.suppliers.find((s) => {
        if (vat && s.vat_id === vat) return true;
        if (name && s.display_name.toLowerCase() === name.toLowerCase()) return true;
        if (name && s.aliases.includes(name)) return true;
        return false;
      });
      if (!row) return { rows: [] };
      return {
        rows: [{
          supplier_id: row.supplier_id,
          vat_id: row.vat_id,
          display_name: row.display_name,
          default_category: row.default_category,
          default_skr: row.default_skr,
          match_kind: vat && row.vat_id === vat ? 'vat_id' :
                      name && row.display_name.toLowerCase() === name.toLowerCase() ? 'name' : 'alias',
        }],
      };
    }
    return { rows: [] };
  }),
};

// ── Fake Redis ───────────────────────────────────────────────────────────────

const fakeRedis = {
  xadd: vi.fn(async () => '1-0'),
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
};

// ── Test-App Builder ─────────────────────────────────────────────────────────

interface BuildOpts {
  anthropicResponses?: Array<AnthropicMessageResponse | Error>;
}

function buildAnthropicMock(responses?: Array<AnthropicMessageResponse | Error>): AnthropicLikeClient {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        if (!responses || responses.length === 0) {
          throw new Error('NO_MOCK_RESPONSE_CONFIGURED');
        }
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        if (r instanceof Error) throw r;
        return r;
      }),
    },
  };
}

async function buildTestApp(opts: BuildOpts = {}): Promise<{ app: FastifyInstance; client: AnthropicLikeClient }> {
  const app = Fastify({ logger: false });
  app.decorate('db', fakeDb as never);
  app.decorate('redis', fakeRedis as never);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf-8')));
    } catch (err) {
      done(err as Error);
    }
  });

  const client = buildAnthropicMock(opts.anthropicResponses);
  await app.register(m03CategorizationRoutes, {
    prefix: '/api/v1/receipts',
    anthropicClient: client,
  });
  await app.ready();
  return { app, client };
}

// ── Fixture-Profil ───────────────────────────────────────────────────────────

interface ProfileOverrides {
  supplier_overrides?: Record<string, unknown>;
  branch_rules?: Record<string, { cost_center?: string }>;
  default_branch?: string;
  ai_categorization_examples?: unknown;
}

function makeProfile(custom: ProfileOverrides = {}, threshold = 0.75) {
  return {
    customer_id: 'cust_a3f4b2',
    package: 'standard',
    modules_enabled: ['M03'],
    integrations: {},
    routing: {
      skr_chart: 'SKR03' as const,
      low_confidence_threshold: threshold,
      tax_keys_map: { '0.19': '9', '0.07': '8', '0': '0' },
      ki_kategorisierung: true,
    },
    custom,
  };
}

function seedExtractedReceipt(overrides: { supplier_name?: string; supplier_vat_id?: string | null; status?: string; meta?: Record<string, unknown> } = {}) {
  const fields = {
    supplier_name: overrides.supplier_name ?? 'Generic Lieferant GmbH',
    supplier_vat_id: overrides.supplier_vat_id ?? null,
    document_number: 'RE-2026-1042',
    document_date: '2026-04-28',
    total_gross: 142.85,
    total_net: 120.04,
    currency: 'EUR',
    tax_lines: [{ rate: 0.07, base: 20.04, amount: 1.4 }],
    line_items: [{ description: 'Mehl', qty: 4, unit_price: 18.5 }],
  };
  fakeDb.receipts.push({
    receipt_id: '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
    customer_id: 'cust_a3f4b2',
    status: overrides.status ?? 'extracted',
    file_object_key: 'cust_a3f4b2/originals/2026/04/foo.jpg',
    file_sha256: 'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
    payload: {
      receipt_id: '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
      customer_id: 'cust_a3f4b2',
      schema_version: '1.0',
      status: overrides.status ?? 'extracted',
      file: {
        object_key: 'cust_a3f4b2/originals/2026/04/foo.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 1024,
        sha256: 'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
      },
      extraction: { fields },
      ...(overrides.meta ? { meta: overrides.meta } : {}),
    },
    created_at: new Date(),
    updated_at: new Date(),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

const VALID_CLAUDE: AnthropicMessageResponse = {
  content: [
    {
      type: 'tool_use',
      id: 'tu_1',
      name: 'categorize_receipt',
      input: {
        category: 'wareneinkauf_food',
        category_label: 'Wareneinkauf Lebensmittel',
        skr_account: '3100',
        tax_key: '9',
        cost_center: null,
        confidence: 0.92,
        rationale: 'Lebensmittel-Großhandel.',
      },
    },
  ],
};

let testApp: { app: FastifyInstance; client: AnthropicLikeClient };

beforeAll(async () => {
  testApp = await buildTestApp({ anthropicResponses: [VALID_CLAUDE] });
});

afterAll(async () => {
  await testApp.app.close();
});

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
});

describe('M03 categorize.handler', () => {
  it('Test 1: Override greift → kein Claude-Call, confidence=1.0, status=categorized', async () => {
    seedExtractedReceipt({ supplier_name: 'Metro AG' });
    const profile = makeProfile({
      supplier_overrides: {
        'Metro AG': { category: 'wareneinkauf_food', skr: '3100', tax_key: '9' },
      },
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile, trace_id: 'trc_t1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.receipt_patch.status).toBe('categorized');
    expect(body.data.receipt_patch.categorization.engine).toBe('override');
    expect(body.data.receipt_patch.categorization.confidence).toBe(1);
    expect(body.data.receipt_patch.categorization.skr_account).toBe('3100');
    expect(testApp.client.messages.create).not.toHaveBeenCalled();
  });

  it('Test 2: Master-Data greift (vat_id) → kein Claude-Call', async () => {
    fakeDb.suppliers.push({
      supplier_id: 'sup_metro',
      vat_id: 'DE123456789',
      display_name: 'Metro AG',
      aliases: [],
      default_category: 'wareneinkauf_food',
      default_skr: '3100',
    });
    seedExtractedReceipt({ supplier_name: 'Metro Cash & Carry', supplier_vat_id: 'DE123456789' });
    const profile = makeProfile();

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.receipt_patch.categorization.engine).toBe('master_data');
    expect(body.data.receipt_patch.categorization.skr_account).toBe('3100');
    expect(testApp.client.messages.create).not.toHaveBeenCalled();
  });

  it('Test 3: Claude-Fallback → Tool-Use korrekt gemappt', async () => {
    seedExtractedReceipt({ supplier_name: 'Unbekannter Lieferant' });
    const claude: AnthropicMessageResponse = {
      content: [
        {
          type: 'tool_use', id: 't1', name: 'categorize_receipt',
          input: {
            category: 'wareneinkauf_food',
            category_label: 'Wareneinkauf Lebensmittel',
            skr_account: '3100',
            tax_key: '9',
            cost_center: null,
            confidence: 0.92,
            rationale: 'Lebensmittel.',
          },
        },
      ],
    };
    const isolated = await buildTestApp({ anthropicResponses: [claude] });
    const profile = makeProfile();

    const res = await isolated.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.receipt_patch.categorization.engine).toBe('claude_sonnet_4_6');
    expect(body.data.receipt_patch.categorization.confidence).toBeCloseTo(0.92, 2);
    expect(body.data.receipt_patch.status).toBe('categorized');
    await isolated.app.close();
  });

  it('Test 4: Claude 5xx 3× → Fallback sonstige_aufwand → requires_review', async () => {
    seedExtractedReceipt({ supplier_name: 'Schwer zu kategorisieren' });
    const err503 = Object.assign(new Error('boom'), { status: 503 });
    const isolated = await buildTestApp({ anthropicResponses: [err503, err503, err503] });
    const profile = makeProfile();

    const res = await isolated.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.receipt_patch.categorization.engine).toBe('fallback_after_error');
    expect(body.data.receipt_patch.categorization.category).toBe('sonstige_aufwand');
    expect(body.data.receipt_patch.status).toBe('requires_review');
    await isolated.app.close();
  });

  it('Test 5: Confidence < threshold (0.75) → requires_review', async () => {
    seedExtractedReceipt({ supplier_name: 'Confused Vendor' });
    const lowResponse: AnthropicMessageResponse = {
      content: [
        {
          type: 'tool_use', id: 't1', name: 'categorize_receipt',
          input: {
            category: 'sonstige_aufwand',
            category_label: 'Sonstige Betriebskosten',
            skr_account: '4980',
            tax_key: '9',
            confidence: 0.4,
            rationale: 'Unklare Positionen.',
          },
        },
      ],
    };
    const isolated = await buildTestApp({ anthropicResponses: [lowResponse] });
    const profile = makeProfile();

    const res = await isolated.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.receipt_patch.status).toBe('requires_review');
    expect(body.data.receipt_patch.categorization.confidence).toBeCloseTo(0.4, 2);
    await isolated.app.close();
  });

  it('Test 6: branch_rules → cost_center gesetzt', async () => {
    seedExtractedReceipt({
      supplier_name: 'Metro AG',
      meta: { branch: 'muenchen-altstadt' },
    });
    const profile = makeProfile({
      supplier_overrides: {
        'Metro AG': { category: 'wareneinkauf_food', skr: '3100', tax_key: '9' },
      },
      branch_rules: {
        'muenchen-altstadt': { cost_center: 'kueche' },
      },
    });
    const isolated = await buildTestApp({ anthropicResponses: [] });
    const res = await isolated.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.receipt_patch.categorization.cost_center).toBe('kueche');
    await isolated.app.close();
  });

  it('Test 7: Receipt im falschen Status → 422 INVALID_STATUS', async () => {
    seedExtractedReceipt({ supplier_name: 'Metro AG', status: 'received' });
    const profile = makeProfile();
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_STATUS');
  });

  it('Test 8: Receipt nicht gefunden → 404', async () => {
    const profile = makeProfile();
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/UNKNOWN/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(404);
  });

  it('Test 9: ai_categorization_examples werden in den Claude-Prompt injiziert', async () => {
    seedExtractedReceipt({ supplier_name: 'Brandneuer Lieferant' });
    const profile = makeProfile({
      ai_categorization_examples: [
        { supplier: 'BIO-Hof Müller', items_pattern: 'Tomaten, Salat', category: 'wareneinkauf_food', skr: '3100' },
      ],
    });
    const isolated = await buildTestApp({ anthropicResponses: [VALID_CLAUDE] });

    const res = await isolated.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(200);
    expect(isolated.client.messages.create).toHaveBeenCalledTimes(1);
    const callArgs = (isolated.client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = callArgs.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('BIO-Hof Müller');
    expect(userMessage).toContain('Tomaten, Salat');
    expect(userMessage).toContain('wareneinkauf_food');
    expect(userMessage).toContain('Zusätzliche Beispiele');
    await isolated.app.close();
  });

  it('Test 10: branch_rules ohne Match → cost_center bleibt unverändert', async () => {
    seedExtractedReceipt({
      supplier_name: 'Metro AG',
      meta: { branch: 'unknown-branch' },
    });
    const profile = makeProfile({
      supplier_overrides: {
        'Metro AG': { category: 'wareneinkauf_food', skr: '3100', tax_key: '9', cost_center: null },
      },
      branch_rules: { 'muenchen-altstadt': { cost_center: 'kueche' } },
    });
    const isolated = await buildTestApp({ anthropicResponses: [] });
    const res = await isolated.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // cost_center bleibt null/undefined (kein Match in branch_rules, kein Engine-CC)
    expect(body.data.receipt_patch.categorization.cost_center).toBeNull();
    await isolated.app.close();
  });

  it('Test 11: leere/fehlende custom-Felder crashen nicht (Default-Profil)', async () => {
    seedExtractedReceipt({ supplier_name: 'Anyone' });
    // Profil ohne custom-Block
    const profile = {
      customer_id: 'cust_a3f4b2',
      package: 'standard',
      modules_enabled: ['M03'],
      integrations: {},
      routing: { skr_chart: 'SKR03' as const, low_confidence_threshold: 0.75, ki_kategorisierung: true },
      // custom fehlt absichtlich
    };
    const isolated = await buildTestApp({ anthropicResponses: [VALID_CLAUDE] });
    const res = await isolated.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/categorize',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(200);
    await isolated.app.close();
  });
});
