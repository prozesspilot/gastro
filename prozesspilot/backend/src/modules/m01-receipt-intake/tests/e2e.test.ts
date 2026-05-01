/**
 * M01 — End-to-End-Test
 *
 * Pipt einen kompletten Extract-Call durch den Handler:
 *   1) Receipt liegt mit Status 'received' in der Fake-DB
 *   2) Dummy-Bytes liegen im Fake-S3 (downloadObject-Mock)
 *   3) OCR-Adapter wird gemockt (gibt Vision-ähnliches Result zurück)
 *   4) POST /api/v1/receipts/{id}/extract → erwartet 200 + status='extracted'
 *   5) Prüft: extraction.* in DB gefüllt, audit_log-Eintrag vorhanden,
 *            pp.receipt.extracted-Event geXADDed
 *
 * Nutzt PP_AUTH_DISABLED=1 (gesetzt in tests/setup.ts).
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks: Storage-Download + OCR-Adapter (vor App-Import setzen)
vi.mock('../services/storage-download', () => ({
  downloadObject: vi.fn(async () => Buffer.from('FAKE_JPEG_BYTES')),
}));

vi.mock('../../../core/adapters/ocr/factory', () => {
  return {
    adapterFactory: {
      for: () => ({
        id:      'google_vision',
        version: 'v1',
        extract: vi.fn(async () => ({
          raw_text: [
            'Metro AG',
            'USt-IdNr: DE123456789',
            'Rechnung Nr. RE-2026-1042',
            'Datum: 28.04.2026',
            'Netto                                       120.04',
            'MwSt 19 %                                    19.00',
            'MwSt 7 %                                      1.40',
            'Gesamt                                      142.85 EUR',
          ].join('\n'),
          confidence: 0.96,
          blocks:     [],
          words:      [],
          page_count: 1,
        })),
      }),
    },
  };
});

import { m01ReceiptIntakeRoutes } from '../routes';

// ── Fake DB ───────────────────────────────────────────────────────────────────

interface FakeReceiptRow {
  receipt_id:      string;
  customer_id:     string;
  status:          string;
  file_object_key: string;
  file_sha256:     string;
  payload:         Record<string, unknown>;
  created_at:      Date;
  updated_at:      Date;
}

interface FakeDb {
  receipts: FakeReceiptRow[];
  audits:   { action: string; payload: unknown }[];
  reset(): void;
  query: ReturnType<typeof vi.fn>;
}

const fakeDb: FakeDb = {
  receipts: [],
  audits:   [],

  reset() { this.receipts = []; this.audits = []; },

  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO audit_log/i.test(sql)) {
      fakeDb.audits.push({
        action:  String(params[2]),
        payload: JSON.parse(String(params[4])),
      });
      return { rows: [] };
    }
    if (/UPDATE\s+receipts/i.test(sql)) {
      const [id, status, key, sha, payloadJson] = params as [string, string, string, string, string];
      const idx = fakeDb.receipts.findIndex((r) => r.receipt_id === id);
      if (idx === -1) return { rows: [] };
      const updated = {
        ...fakeDb.receipts[idx],
        status,
        file_object_key: key,
        file_sha256:     sha,
        payload:         JSON.parse(payloadJson),
        updated_at:      new Date(),
      };
      fakeDb.receipts[idx] = updated;
      return { rows: [updated] };
    }
    if (/COUNT\(\*\)/i.test(sql) && /FROM\s+receipts/i.test(sql)) {
      // Duplicate-Check — keine Duplikate für den Happy-Path-Test
      return { rows: [{ count: '0' }] };
    }
    if (/FROM\s+receipts/i.test(sql)) {
      // findById: $1=receipt_id, $2=customer_id
      // findByHash: $1=customer_id, $2=sha256
      const isFindById = /receipt_id\s*=\s*\$1/i.test(sql);
      if (isFindById) {
        const [id, cid] = params as [string, string];
        const row = fakeDb.receipts.find((r) => r.receipt_id === id && r.customer_id === cid);
        return { rows: row ? [row] : [] };
      }
      const [cid, sha] = params as [string, string];
      const row = fakeDb.receipts.find((r) => r.customer_id === cid && r.file_sha256 === sha);
      return { rows: row ? [row] : [] };
    }
    if (/FROM\s+suppliers_global/i.test(sql)) {
      return { rows: [] };
    }
    return { rows: [] };
  }),
};

// ── Fake Redis ────────────────────────────────────────────────────────────────

const fakeRedis = {
  xadd: vi.fn(async () => '1-0'),
  events: [] as Array<Record<string, string>>,
};

// Statt vi.mock auf Publisher: wir verfolgen die XADD-Calls über fakeRedis.xadd.

// ── Test-App ──────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.decorate('db',    fakeDb as never);
  app.decorate('redis', fakeRedis as never);
  app.decorate('s3',    {} as never);

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try { done(null, JSON.parse((body as Buffer).toString('utf-8'))); }
      catch (err) { done(err as Error); }
    },
  );

  await app.register(m01ReceiptIntakeRoutes, {
    prefix: '/api/v1/receipts',
    s3:     {} as never,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();

  // Test-Receipt im 'received'-Zustand
  fakeDb.receipts.push({
    receipt_id:      '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
    customer_id:     'cust_a3f4b2',
    status:          'received',
    file_object_key: 'cust_a3f4b2/originals/2026/04/01HVZ8X4M3R9K7N2P6T1Q5Y8B4.jpg',
    file_sha256:     'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
    payload: {
      receipt_id:  '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
      customer_id: 'cust_a3f4b2',
      status:      'received',
      file: {
        object_key: 'cust_a3f4b2/originals/2026/04/01HVZ8X4M3R9K7N2P6T1Q5Y8B4.jpg',
        mime_type:  'image/jpeg',
        size_bytes: 1024,
        sha256:     'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
      },
    },
    created_at: new Date(),
    updated_at: new Date(),
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('M01 E2E — POST /receipts/:id/extract', () => {
  it('Happy-Path: Beleg wird auf status=extracted gesetzt, Audit + Event geschrieben', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/extract',
      headers: { 'content-type': 'application/json' },
      payload: {
        customer_profile: {
          customer_id: 'cust_a3f4b2',
          package:     'standard',
          modules_enabled: ['M01'],
          integrations: { ocr: { provider: 'google_vision' } },
          routing:     { default_currency: 'EUR', supported_currencies: ['EUR'] },
          custom:      { supplier_overrides: { 'Metro AG': { skr: '3100' } } },
        },
        trace_id: 'trc_e2e_test',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);

    // status muss extracted oder requires_review sein (M01 §17 AC)
    expect(['extracted', 'requires_review']).toContain(body.data.receipt_patch.status);

    // extraction.* befüllt
    const extraction = body.data.receipt_patch.extraction;
    expect(extraction.engine).toBe('google_vision');
    expect(extraction.fields.supplier_vat_id).toBe('DE123456789');
    expect(extraction.fields.document_date).toBe('2026-04-28');
    expect(extraction.fields.total_gross).toBe(142.85);
    expect(extraction.confidence).toBeGreaterThan(0.7);

    // DB enthält das Update
    const stored = fakeDb.receipts[0];
    expect(stored.status).toMatch(/^(extracted|requires_review)$/);
    expect((stored.payload as { extraction?: { fields?: { supplier_vat_id?: string } } }).extraction?.fields?.supplier_vat_id)
      .toBe('DE123456789');

    // audit_log enthält pp.receipt.extracted oder requires_review
    expect(fakeDb.audits.some((a) => a.action.startsWith('pp.receipt.'))).toBe(true);

    // Redis: xadd auf pp:events:receipt
    expect(fakeRedis.xadd).toHaveBeenCalled();
    const xaddArgs = (fakeRedis.xadd as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(xaddArgs[0]).toBe('pp:events:receipt');
  });

  it('lehnt unbekannten receipt_id mit 404 NOT_FOUND ab', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/receipts/UNKNOWN/extract',
      headers: { 'content-type': 'application/json' },
      payload: {
        customer_profile: { customer_id: 'cust_a3f4b2' },
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('lehnt nicht-akzeptierten Status mit 409 CONFLICT ab', async () => {
    fakeDb.receipts[0].status = 'archived';
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/extract',
      headers: { 'content-type': 'application/json' },
      payload: {
        customer_profile: { customer_id: 'cust_a3f4b2' },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });
});
