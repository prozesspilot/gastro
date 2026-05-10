/**
 * M07 — append.handler Tests (E2E gegen In-Memory-DB + Mock-Adapter)
 *
 * Deckt:
 *   T1 — Neuer Beleg: appendRow wird aufgerufen, receipt.exports enthält
 *        google_sheets-Eintrag.
 *   T2 — Re-Run (receipt_id existiert in spreadsheet_row_index): updateRow,
 *        KEIN appendRow.
 *   T3 — Tab fehlt: ensureTabExists wird aufgerufen.
 *   T4 — Header fehlt: ensureHeader wird aufgerufen.
 *   T5 — Extra-Columns aus profile.custom.spreadsheet_extra_columns landen
 *        rechts in der Zeile + im Header.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Wir injizieren in den Tests einen Mock-Adapter — die echten googleapis-/
// google-auth-library-Imports werden nie aufgerufen. Trotzdem müssen wir die
// Module hier stubben, damit ESM-Resolve nicht beim Modul-Load scheitert.
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class {} },
    sheets: () => ({
      spreadsheets: {
        get: vi.fn(),
        batchUpdate: vi.fn(),
        values: { get: vi.fn(), append: vi.fn(), update: vi.fn() },
      },
    }),
  },
}));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {},
}));

import type { SpreadsheetAdapter } from '../../../core/adapters/spreadsheet/factory';
import { m07SpreadsheetRoutes } from '../routes';

// ── Mock-Adapter ─────────────────────────────────────────────────────────────

interface AdapterTrace {
  ensureTabExists: ReturnType<typeof vi.fn>;
  ensureHeader: ReturnType<typeof vi.fn>;
  findRowByReceiptId: ReturnType<typeof vi.fn>;
  appendRow: ReturnType<typeof vi.fn>;
  updateRow: ReturnType<typeof vi.fn>;
}

function makeMockAdapter(opts: { existingRow?: number | null } = {}): {
  adapter: SpreadsheetAdapter;
  trace: AdapterTrace;
} {
  const trace: AdapterTrace = {
    ensureTabExists: vi.fn(async () => undefined),
    ensureHeader: vi.fn(async () => undefined),
    findRowByReceiptId: vi.fn(async () =>
      opts.existingRow != null ? { row_index: opts.existingRow } : null,
    ),
    appendRow: vi.fn(async (_ctx, _cust, sheetId, tab, _rid, row) => ({
      row_index: 157,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0&range=A157`,
      _row: row,
      _tab: tab,
    })),
    updateRow: vi.fn(async (_ctx, _cust, sheetId, _tab, _rid, rowIndex) => ({
      row_index: rowIndex,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0&range=A${rowIndex}`,
    })),
  };
  const adapter: SpreadsheetAdapter = {
    id: 'google_sheets',
    ensureTabExists: trace.ensureTabExists as unknown as SpreadsheetAdapter['ensureTabExists'],
    ensureHeader: trace.ensureHeader as unknown as SpreadsheetAdapter['ensureHeader'],
    findRowByReceiptId:
      trace.findRowByReceiptId as unknown as SpreadsheetAdapter['findRowByReceiptId'],
    appendRow: trace.appendRow as unknown as SpreadsheetAdapter['appendRow'],
    updateRow: trace.updateRow as unknown as SpreadsheetAdapter['updateRow'],
  };
  return { adapter, trace };
}

// ── Fake DB ──────────────────────────────────────────────────────────────────

// New DB row shape matching receipt.repository.ts ReceiptRow
interface FakeReceiptRow {
  id: string;
  customer_id: string;
  status: string;
  storage_key: string;
  file_sha256: string;
  mime_type: string;
  file_size_bytes: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const fakeDb = {
  receipts: [] as FakeReceiptRow[],
  audits: [] as { action: string; payload: unknown }[],
  reset() {
    this.receipts = [];
    this.audits = [];
  },
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO audit_log/i.test(sql)) {
      fakeDb.audits.push({ action: String(params[2]), payload: JSON.parse(String(params[4])) });
      return { rows: [] };
    }
    if (/UPDATE\s+receipts/i.test(sql)) {
      // UPDATE params: [$1=id, $2=status, $3=storage_key, $4=file_sha256, $5=metaPatchJson]
      const [id, status, key, sha, metaPatchJson] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      const idx = fakeDb.receipts.findIndex((r) => r.id === id);
      if (idx === -1) return { rows: [] };
      const patch = JSON.parse(metaPatchJson) as Record<string, unknown>;
      const updated: FakeReceiptRow = {
        ...fakeDb.receipts[idx],
        status,
        storage_key: key,
        file_sha256: sha,
        metadata: { ...fakeDb.receipts[idx].metadata, ...patch },
        updated_at: new Date(),
      };
      fakeDb.receipts[idx] = updated;
      return { rows: [updated] };
    }
    if (/FROM\s+receipts/i.test(sql)) {
      // findById: WHERE id = $1 AND customer_id = $2
      const isFindById = /WHERE\s+id\s*=\s*\$1/i.test(sql);
      if (isFindById) {
        const [id, cid] = params as [string, string];
        const row = fakeDb.receipts.find((r) => r.id === id && r.customer_id === cid);
        return { rows: row ? [row] : [] };
      }
    }
    if (/spreadsheet_row_index/i.test(sql)) {
      // Adapter ist gemockt; falls Handler trotzdem etwas anfasst, geben wir leer zurück.
      return { rows: [] };
    }
    return { rows: [] };
  }),
};

const fakeRedis = {
  xadd: vi.fn(async () => '1-0'),
};

// ── Test-Setup ────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let mockAdapter: SpreadsheetAdapter;
let trace: AdapterTrace;

const RECEIPT: FakeReceiptRow = {
  id: '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
  customer_id: 'cust_a3f4b2',
  status: 'archived',
  storage_key: 'cust_a3f4b2/originals/2026/04/01HVZ8X4M3R9K7N2P6T1Q5Y8B4.jpg',
  file_sha256: 'f3b8a91c2d7e44bb',
  mime_type: 'image/jpeg',
  file_size_bytes: 1024,
  metadata: {
    extraction: {
      fields: {
        supplier_name: 'Pizzeria Bella Italia',
        document_number: 'RE-2026-1042',
        document_date: '2026-04-28',
        currency: 'EUR',
        total_gross: 142.85,
        total_net: 120.04,
        payment_method: 'cash',
        tax_lines: [
          { rate: 0.19, amount: 19.0 },
          { rate: 0.07, amount: 1.4 },
        ],
      },
    },
    categorization: {
      category_label: 'Wareneinkauf Lebensmittel',
      skr_account: '3100',
      cost_center: 'kueche',
    },
    archive: {
      path: '/PP/Bella Italia/2026/04/2026-04-28_RE-2026-1042.pdf',
      external_url: 'https://drive.google.com/file/d/abc/view',
    },
    audit: {
      events: [
        { at: '2026-04-29T08:14:21Z', type: 'received', actor: 'system' },
        { at: '2026-04-29T08:14:48Z', type: 'archived', actor: 'system' },
      ],
    },
  },
  created_at: new Date('2026-04-29T08:14:21Z'),
  updated_at: new Date('2026-04-29T08:14:48Z'),
};

const PROFILE_BASE = {
  customer_id: 'cust_a3f4b2',
  package: 'standard' as const,
  modules_enabled: ['M01', 'M02', 'M07'],
  integrations: {
    spreadsheet: {
      provider: 'google_sheets' as const,
      enabled: true,
      config: {
        sheet_id: '1zXyZ-abc',
        tab_name_template: 'Belege {year}',
      },
    },
  },
  routing: { default_currency: 'EUR' },
};

beforeAll(async () => {
  app = Fastify({ logger: false });
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

  await app.register(
    async (api) => {
      await api.register(m07SpreadsheetRoutes, { prefix: '/receipts' });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  fakeDb.reset();
  fakeDb.receipts.push({ ...RECEIPT, metadata: { ...RECEIPT.metadata } });
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('M07 append.handler', () => {
  it('T1 — Neuer Beleg: appendRow wird aufgerufen, exports[google_sheets] gesetzt', async () => {
    ({ adapter: mockAdapter, trace } = makeMockAdapter({ existingRow: null }));

    // Adapter-Factory pro Request injizieren: separate App-Instance mit Deps.
    const localApp = await buildAppWith({ adapter: mockAdapter });
    try {
      const res = await localApp.inject({
        method: 'POST',
        url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/spreadsheet',
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: PROFILE_BASE, trace_id: 'trc_t1' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.data.module).toBe('M07');
      expect(trace.appendRow).toHaveBeenCalledTimes(1);
      expect(trace.updateRow).not.toHaveBeenCalled();

      const exports = body.data.receipt.exports as Array<{
        target: string;
        status: string;
        external_id: string;
      }>;
      const gs = exports.find((e) => e.target === 'google_sheets');
      expect(gs).toBeDefined();
      expect(gs?.status).toBe('pushed');
      expect(gs?.external_id).toMatch(/^1zXyZ-abc:Belege 2026!A157$/);
      expect(body.data.receipt.status).toBe('exported');
      expect(body.data.events_to_emit).toEqual(['pp.receipt.exported']);
    } finally {
      await localApp.close();
    }
  });

  it('T2 — Re-Run mit bekannter receipt_id: updateRow, KEIN appendRow', async () => {
    ({ adapter: mockAdapter, trace } = makeMockAdapter({ existingRow: 99 }));
    const localApp = await buildAppWith({ adapter: mockAdapter });
    try {
      const res = await localApp.inject({
        method: 'POST',
        url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/spreadsheet',
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: PROFILE_BASE, trace_id: 'trc_t2' },
      });
      expect(res.statusCode).toBe(200);
      expect(trace.updateRow).toHaveBeenCalledTimes(1);
      expect(trace.appendRow).not.toHaveBeenCalled();
      const exports = res.json().data.receipt.exports as Array<{ external_id: string }>;
      expect(exports[0].external_id).toMatch(/!A99$/);
    } finally {
      await localApp.close();
    }
  });

  it('T3 — Tab noch nicht vorhanden: ensureTabExists wird aufgerufen', async () => {
    ({ adapter: mockAdapter, trace } = makeMockAdapter());
    const localApp = await buildAppWith({ adapter: mockAdapter });
    try {
      await localApp.inject({
        method: 'POST',
        url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/spreadsheet',
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: PROFILE_BASE, trace_id: 'trc_t3' },
      });
      expect(trace.ensureTabExists).toHaveBeenCalledWith(
        expect.any(Object),
        'cust_a3f4b2',
        '1zXyZ-abc',
        'Belege 2026',
      );
    } finally {
      await localApp.close();
    }
  });

  it('T4 — Header-Check: ensureHeader wird mit COLUMNS aufgerufen', async () => {
    ({ adapter: mockAdapter, trace } = makeMockAdapter());
    const localApp = await buildAppWith({ adapter: mockAdapter });
    try {
      await localApp.inject({
        method: 'POST',
        url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/spreadsheet',
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: PROFILE_BASE, trace_id: 'trc_t4' },
      });
      expect(trace.ensureHeader).toHaveBeenCalledTimes(1);
      const args = trace.ensureHeader.mock.calls[0];
      const columns = args[4] as Array<{ header: string }>;
      expect(columns).toHaveLength(16); // genau 16, ohne Extra-Columns
      expect(columns[0].header).toBe('Datum');
      expect(columns[15].header).toBe('Eingang am');
    } finally {
      await localApp.close();
    }
  });

  it('T5 — Extra-Columns: Header rechts angehängt, Werte aus JSONPath gezogen', async () => {
    ({ adapter: mockAdapter, trace } = makeMockAdapter());
    const localApp = await buildAppWith({ adapter: mockAdapter });
    try {
      const profile = {
        ...PROFILE_BASE,
        custom: {
          spreadsheet_extra_columns: [
            { header: 'Filiale', jsonpath: 'meta.custom.branch' },
            { header: 'OCR-Confidence', jsonpath: 'extraction.confidence' },
          ],
        },
      };
      // Receipt um meta.custom.branch + extraction.confidence ergänzen — neue Schema: alles in metadata
      fakeDb.receipts[0].metadata = {
        ...fakeDb.receipts[0].metadata,
        meta: { custom: { branch: 'muenchen-altstadt' } },
        extraction: {
          ...(fakeDb.receipts[0].metadata.extraction as object),
          confidence: 0.94,
        },
      };

      await localApp.inject({
        method: 'POST',
        url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/spreadsheet',
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: profile, trace_id: 'trc_t5' },
      });

      const headerArgs = trace.ensureHeader.mock.calls[0];
      const columns = headerArgs[4] as Array<{ header: string }>;
      expect(columns).toHaveLength(18);
      expect(columns[16].header).toBe('Filiale');
      expect(columns[17].header).toBe('OCR-Confidence');

      const appendArgs = trace.appendRow.mock.calls[0];
      const row = appendArgs[5] as Array<unknown>;
      expect(row).toHaveLength(18);
      expect(row[16]).toBe('muenchen-altstadt');
      expect(row[17]).toBe(0.94);
    } finally {
      await localApp.close();
    }
  });

  it('lehnt unbekannten receipt_id mit 404 NOT_FOUND ab', async () => {
    ({ adapter: mockAdapter, trace } = makeMockAdapter());
    const localApp = await buildAppWith({ adapter: mockAdapter });
    try {
      const res = await localApp.inject({
        method: 'POST',
        url: '/api/v1/receipts/UNKNOWN/exports/spreadsheet',
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: PROFILE_BASE },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    } finally {
      await localApp.close();
    }
  });

  it('lehnt status="received" mit 409 CONFLICT ab', async () => {
    ({ adapter: mockAdapter, trace } = makeMockAdapter());
    const localApp = await buildAppWith({ adapter: mockAdapter });
    try {
      fakeDb.receipts[0].status = 'received';
      const res = await localApp.inject({
        method: 'POST',
        url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/exports/spreadsheet',
        headers: { 'content-type': 'application/json' },
        payload: { customer_profile: PROFILE_BASE },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    } finally {
      await localApp.close();
    }
  });
});

// ── Helper: lokale App mit injizierter Adapter-Factory ───────────────────────

async function buildAppWith(opts: { adapter: SpreadsheetAdapter }): Promise<FastifyInstance> {
  const local = Fastify({ logger: false });
  local.decorate('db', fakeDb as never);
  local.decorate('redis', fakeRedis as never);
  local.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf-8')));
    } catch (err) {
      done(err as Error);
    }
  });
  await local.register(
    async (api) => {
      await api.register(m07SpreadsheetRoutes, {
        prefix: '/receipts',
        adapterFactory: { for: () => opts.adapter },
      });
    },
    { prefix: '/api/v1' },
  );
  await local.ready();
  return local;
}
