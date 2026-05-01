/**
 * M06 — push.handler Tests
 *
 * Tests:
 *   1. Voucher erfolgreich gepusht → receipt.exports enthält sevDesk-Eintrag
 *   2. Idempotenz: zweiter Call → kein zweiter Voucher
 *   3. M06 nicht aktiviert → 400 MODULE_NOT_ENABLED
 *   4. Status received → 422 INVALID_STATUS
 *   5. SKR-Konto fehlt → 422 VALIDATION_FAILED
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { m06SevdeskRoutes } from '../routes';
import { SevDeskClient } from '../../../core/adapters/booking/sevdesk/sevdesk.client';

// ── Mock sevDesk Client ──────────────────────────────────────────────────────

class MockSevDeskClient extends SevDeskClient {
  public savedVouchers: unknown[] = [];
  public saveCallCount = 0;

  constructor() {
    super({ apiToken: 'mock-token', customerId: 'cust_m06test' });
  }

  override async saveVoucher(v: unknown) {
    this.savedVouchers.push(v);
    this.saveCallCount += 1;
    return {
      objects: {
        voucher: { id: 12345, objectName: 'Voucher' as const },
      },
    };
  }

  override async uploadTempFile(_bytes: Buffer, filename: string) {
    return { filename };
  }

  override async attachFileToVoucher(_id: number, _filename: string): Promise<void> {
    // noop
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

const fakeDb = {
  receipts: [] as FakeReceiptRow[],
  exports: [] as unknown[],
  reset() {
    this.receipts = [];
    this.exports = [];
  },
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/sevdesk_exports/i.test(sql)) {
      if (/INSERT/i.test(sql)) {
        fakeDb.exports.push({ receipt_id: params[0], voucher_id: params[2] });
        return { rows: [] };
      }
      return { rows: fakeDb.exports };
    }
    if (/audit_log/i.test(sql)) {
      return { rows: [] };
    }
    if (/sevdesk_account_map/i.test(sql)) {
      return { rows: [] }; // No mapping → fallback 0
    }
    if (/sevdesk_tax_rule_map/i.test(sql)) {
      return { rows: [] }; // No mapping → fallback 1 (19%)
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
    return { rows: [] };
  }),
};

// ── Profile ──────────────────────────────────────────────────────────────────

const profile = {
  customer_id: 'cust_m06test',
  modules_enabled: ['m06_sevdesk', 'M03'],
  integrations: { sevdesk: {} },
};

const profileNoM06 = {
  customer_id: 'cust_m06test',
  modules_enabled: ['M03'],
  integrations: {},
};

function seedReceipt(opts: {
  status: string;
  skr_account?: string;
  exports?: unknown[];
}) {
  const fields = {
    vendor_name: 'Metro AG',
    document_number: 'RE-2026-5042',
    document_date: '2026-04-28',
    total_gross: 119.0,
    total_net: 100.0,
    tax_lines: [{ rate: 0.19, base: 100.0, amount: 19.0 }],
  };
  fakeDb.receipts.push({
    receipt_id: 'rcpt_m06_0001',
    customer_id: 'cust_m06test',
    status: opts.status,
    file_object_key: 'cust_m06test/originals/2026/04/rec.pdf',
    file_sha256: 'abc123',
    payload: {
      receipt_id: 'rcpt_m06_0001',
      customer_id: 'cust_m06test',
      status: opts.status,
      file: {
        object_key: 'cust_m06test/originals/2026/04/rec.pdf',
        mime_type: 'application/pdf',
        size_bytes: 512,
        sha256: 'abc123',
      },
      extraction: { fields },
      categorization: {
        skr_account: opts.skr_account ?? '3100',
        category: 'wareneinkauf_food',
      },
      ...(opts.exports ? { exports: opts.exports } : {}),
    },
    created_at: new Date(),
    updated_at: new Date(),
  });
}

// ── App Builder ──────────────────────────────────────────────────────────────

let mockClient: MockSevDeskClient;

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('db', fakeDb as never);
  app.decorate('redis', {} as never);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf-8')));
    } catch (err) {
      done(err as Error);
    }
  });

  mockClient = new MockSevDeskClient();
  await app.register(m06SevdeskRoutes, {
    prefix: '/api/v1/receipts',
    sevdeskClient: mockClient,
  });
  await app.ready();
  return app;
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
  mockClient.savedVouchers = [];
  mockClient.saveCallCount = 0;
  vi.clearAllMocks();
});

describe('M06 push.handler', () => {
  it('Test 1: Voucher erfolgreich gepusht → receipt.exports enthält sevDesk-Eintrag', async () => {
    seedReceipt({ status: 'archived' });

    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/rcpt_m06_0001/exports/sevdesk',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile, trace_id: 'trc_m06_t1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.receipt_patch.status).toBe('exported');
    const exps = body.data.receipt_patch.exports as Array<{
      target: string;
      external_id: string;
    }>;
    expect(Array.isArray(exps)).toBe(true);
    expect(exps[0].target).toBe('sevdesk');
    expect(exps[0].external_id).toBe('12345');
    expect(mockClient.saveCallCount).toBe(1);
  });

  it('Test 2: Idempotenz — zweiter Call macht keinen neuen Voucher', async () => {
    seedReceipt({
      status: 'archived',
      exports: [{ target: 'sevdesk', status: 'pushed', external_id: '9999' }],
    });

    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/rcpt_m06_0001/exports/sevdesk',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.already_pushed).toBe(true);
    expect(mockClient.saveCallCount).toBe(0);
  });

  it('Test 3: M06 nicht aktiviert → 400 MODULE_NOT_ENABLED', async () => {
    seedReceipt({ status: 'archived' });

    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/rcpt_m06_0001/exports/sevdesk',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profileNoM06 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MODULE_NOT_ENABLED');
  });

  it('Test 4: Status received → 422 INVALID_STATUS', async () => {
    seedReceipt({ status: 'received' });

    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/rcpt_m06_0001/exports/sevdesk',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_STATUS');
  });

  it('Test 5: SKR-Konto fehlt → 422 VALIDATION_FAILED', async () => {
    seedReceipt({ status: 'archived', skr_account: '' });

    const res = await testApp.inject({
      method: 'POST',
      url: '/api/v1/receipts/rcpt_m06_0001/exports/sevdesk',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profile },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
});
