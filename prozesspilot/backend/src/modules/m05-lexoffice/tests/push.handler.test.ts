/**
 * M05 — push.handler Tests
 *
 * Tests:
 *   1. Voucher erfolgreich gepusht → receipt.exports enthält Lexoffice-Eintrag
 *   2. Idempotenz: zweiter Call → kein zweiter Voucher
 *   3. supplier_vat_id bekannt → contactId gesetzt
 *   4. Status nicht 'archived'/'categorized' → 422
 *   5. SKR-Konto fehlt → 422 VALIDATION_FAILED
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../m01-receipt-intake/services/storage-download', () => ({
  downloadObject: vi.fn(async () => Buffer.from('FAKE_PDF_BYTES')),
}));

import { m05LexofficeRoutes } from '../routes';
import { LexofficeClient } from '../../../core/adapters/booking/lexoffice/lexoffice.client';

// ── Mock Lexoffice Client ────────────────────────────────────────────────────

class MockLexofficeClient extends LexofficeClient {
  public createdVouchers: unknown[] = [];
  public uploadedFiles: Array<{ voucherId: string; filename: string; size: number }> = [];
  public createCallCount = 0;
  constructor() {
    super({ apiKey: 'mock', customerId: 'cust_a3f4b2', baseUrl: 'http://mock' });
  }
  override async createVoucher(v: unknown) {
    this.createdVouchers.push(v);
    this.createCallCount += 1;
    return {
      id: 'mock-voucher-uuid-001',
      resourceUri: 'http://mock/vouchers/mock-voucher-uuid-001',
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      version: 1,
    };
  }
  override async uploadVoucherFile(
    voucherId: string,
    bytes: Buffer,
    filename: string,
  ): Promise<void> {
    this.uploadedFiles.push({ voucherId, filename, size: bytes.length });
  }
  override async listCategories() {
    return [
      { id: '00000000-0000-4000-8000-000000003100', name: 'Wareneingang Lebensmittel', type: 'expense' },
    ];
  }
  override async findContactByVatId(vatId: string) {
    if (vatId === 'DE123456789') {
      return { id: '00000000-0000-4000-9000-000000000001' };
    }
    return null;
  }
  override async createContact() {
    return { id: '00000000-0000-4000-9000-000000000002' };
  }
}

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
  category_map: Map<string, string>;
  reset(): void;
  query: ReturnType<typeof vi.fn>;
}

const fakeDb: FakeDb = {
  receipts: [],
  audits: [],
  category_map: new Map([['default::3100', '00000000-0000-4000-8000-000000003100']]),
  reset() {
    this.receipts = [];
    this.audits = [];
    this.category_map = new Map([['default::3100', '00000000-0000-4000-8000-000000003100']]);
  },
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO audit_log/i.test(sql)) {
      fakeDb.audits.push({ action: String(params[2]), payload: JSON.parse(String(params[4])) });
      return { rows: [] };
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
    if (/lexoffice_category_map/i.test(sql)) {
      if (/INSERT/i.test(sql)) {
        const [cid, skr, lexId] = params as [string, string, string];
        fakeDb.category_map.set(`${cid}::${skr}`, lexId);
        return { rows: [] };
      }
      const [cid, skr] = params as [string, string];
      const id = fakeDb.category_map.get(`${cid}::${skr}`);
      return { rows: id ? [{ lexoffice_category_id: id }] : [] };
    }
    if (/customer_credentials/i.test(sql)) {
      // pgcrypto-Decrypt → Mock-Plaintext
      return { rows: [{ plaintext: 'mock-api-key' }] };
    }
    return { rows: [] };
  }),
};

const fakeRedis = {
  xadd: vi.fn(async () => '1-0'),
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
  eval: vi.fn(async () => 1),
};

// ── App Builder ──────────────────────────────────────────────────────────────

let mockClient: MockLexofficeClient;

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('db', fakeDb as never);
  app.decorate('redis', fakeRedis as never);
  app.decorate('s3', {} as never);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf-8')));
    } catch (err) {
      done(err as Error);
    }
  });

  mockClient = new MockLexofficeClient();
  await app.register(m05LexofficeRoutes, {
    prefix: '/api/v1/receipts',
    lexofficeClient: mockClient,
  });
  await app.ready();
  return app;
}

// ── Fixture-Profil + Receipt ─────────────────────────────────────────────────

const profile = {
  customer_id: 'cust_a3f4b2',
  package: 'standard',
  modules_enabled: ['M05'],
  integrations: {
    booking: { providers: ['lexoffice'] },
    lexoffice: { auto_create_contacts: true },
  },
};

function seed(opts: { status: string; supplier_vat_id?: string; supplier_name?: string; skr_account?: string; exports?: unknown[] }) {
  const fields = {
    supplier_name: opts.supplier_name ?? 'Metro AG',
    supplier_vat_id: opts.supplier_vat_id ?? null,
    document_number: 'RE-2026-1042',
    document_date: '2026-04-28',
    total_gross: 142.85,
    total_net: 120.04,
    currency: 'EUR',
    tax_lines: [{ rate: 0.07, base: 20.04, amount: 1.4 }, { rate: 0.19, base: 100, amount: 19 }],
  };
  fakeDb.receipts.push({
    receipt_id: '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
    customer_id: 'cust_a3f4b2',
    status: opts.status,
    file_object_key: 'cust_a3f4b2/originals/2026/04/foo.jpg',
    file_sha256: 'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
    payload: {
      receipt_id: '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
      customer_id: 'cust_a3f4b2',
      status: opts.status,
      file: {
        object_key: 'cust_a3f4b2/originals/2026/04/foo.jpg',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        sha256: 'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
      },
      extraction: { fields },
      categorization: { skr_account: opts.skr_account ?? '3100', category: 'wareneinkauf_food' },
      ...(opts.exports ? { exports: opts.exports } : {}),
    },
    created_at: new Date(),
    updated_at: new Date(),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

let testApp: FastifyInstance;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.close();
});

beforeEach(() => {
  fakeDb.reset();
  // Mock-Client State je Test zurücksetzen, damit createdVouchers/createCallCount
  // nicht aus vorherigen Tests leaken.
  mockClient.createdVouchers = [];
  mockClient.uploadedFiles = [];
  mockClient.createCallCount = 0;
  vi.clearAllMocks();
});

describe('M05 push.handler', () => {
  it('Test 1: Voucher erfolgreich gepusht → receipt.exports enthält Lexoffice-Eintrag', async () => {
    seed({ status: 'archived' });
    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/lexoffice',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile, trace_id: 'trc_t1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.receipt_patch.status).toBe('exported');
    const exp = body.data.receipt_patch.exports;
    expect(Array.isArray(exp)).toBe(true);
    expect(exp[0].target).toBe('lexoffice');
    expect(exp[0].external_id).toBe('mock-voucher-uuid-001');
    expect(mockClient.createCallCount).toBe(1);
    expect(mockClient.uploadedFiles).toHaveLength(1);
  });

  it('Test 2: Idempotenz — zweiter Call macht keinen neuen Voucher', async () => {
    seed({
      status: 'archived',
      exports: [{ target: 'lexoffice', status: 'pushed', external_id: 'mock-existing' }],
    });
    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/lexoffice',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.already_pushed).toBe(true);
    expect(mockClient.createCallCount).toBe(0);
  });

  it('Test 3: supplier_vat_id bekannt → contactId gesetzt (kein Sammel-Kreditor)', async () => {
    seed({ status: 'archived', supplier_vat_id: 'DE123456789' });
    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/lexoffice',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(200);
    const sentVoucher = mockClient.createdVouchers[0] as { useCollectiveContact: boolean; contactId?: string };
    expect(sentVoucher.useCollectiveContact).toBe(false);
    expect(sentVoucher.contactId).toBe('00000000-0000-4000-9000-000000000001');
  });

  it('Test 4: Status received → 422 INVALID_STATUS', async () => {
    seed({ status: 'received' });
    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/lexoffice',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_STATUS');
  });

  it('Test 5: skr_account fehlt → 422 VALIDATION_FAILED', async () => {
    seed({ status: 'archived', skr_account: '' });
    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/lexoffice',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
});
