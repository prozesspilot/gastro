/**
 * Unit-Tests für den Excel/OneDrive-Adapter (M07 §9.3).
 *
 * Alle HTTP-Calls werden via vi.spyOn(global, 'fetch') gemockt.
 * Kein echter DB-Zugriff — db-Pool wird als Mock übergeben.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExcelOneDriveAdapter } from '../../src/core/adapters/spreadsheet/excel-onedrive.adapter';
import { HeaderConflictError } from '../../src/core/adapters/spreadsheet/adapter.interface';
import type { SpreadsheetAdapterContext } from '../../src/core/adapters/spreadsheet/adapter.interface';
import type { Pool, QueryResult } from 'pg';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(queryFn?: (text: string, values?: unknown[]) => Promise<QueryResult>): SpreadsheetAdapterContext {
  const db = {
    query: queryFn ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as Pool;
  return { db };
}

/**
 * Erzeugt ein Mock-fetch, das sequenziell die angegebenen Responses liefert.
 * Jeder Aufruf konsumiert den nächsten Eintrag in `responses`.
 */
function mockFetchSequence(
  responses: Array<{ ok: boolean; status: number; body?: unknown }>,
): ReturnType<typeof vi.spyOn> {
  let callIndex = 0;
  return vi.spyOn(global, 'fetch').mockImplementation(async () => {
    const r = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    const body = r.body ?? {};
    return {
      ok: r.ok,
      status: r.status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
  });
}

/** Erzeugt ein Mock-fetch, das immer dieselbe Response liefert. */
function mockFetchAlways(ok: boolean, status: number, body?: unknown) {
  return mockFetchSequence([{ ok, status, body }]);
}

// ── Credential-Mock ───────────────────────────────────────────────────────────

/** Mock-DB, die immer einen gültigen Credential-Row zurückgibt. */
function makeCredCtx(): SpreadsheetAdapterContext {
  const credRow = {
    credential_id: 'cred-1',
    access_token: 'tok-abc',
    refresh_token: 'refresh-xyz',
    tenant_id: 'tenant-001',
    expires_at: new Date(Date.now() + 10 * 60 * 1000), // +10 min → kein Refresh
  };

  const db = {
    query: vi.fn().mockImplementation((sql: string) => {
      // Credential-Query
      if (sql.includes('customer_credentials')) {
        return Promise.resolve({ rows: [credRow], rowCount: 1 });
      }
      // spreadsheet_row_index queries
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
  } as unknown as Pool;

  return { db };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const SHEET_ID = 'sheet-abc123';
const CUSTOMER_ID = 'customer-1';
const TAB = 'Belege 2026';
const RECEIPT_ID = 'receipt-001';

describe('ExcelOneDriveAdapter', () => {
  let adapter: ExcelOneDriveAdapter;

  beforeEach(() => {
    adapter = new ExcelOneDriveAdapter();
    // Setze ENV für Config
    process.env.PP_PGCRYPTO_KEY = 'test-key-32-bytes-xxxxxxxxxxxxxxxxxx';
    process.env.MSGRAPH_CLIENT_ID = 'client-id';
    process.env.MSGRAPH_CLIENT_SECRET = 'client-secret';
    process.env.MSGRAPH_TENANT_ID = 'tenant-001';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── ensureTabExists ─────────────────────────────────────────────────────────

  describe('ensureTabExists', () => {
    it('tab existiert bereits → kein POST', async () => {
      const ctx = makeCredCtx();
      const fetchSpy = mockFetchAlways(true, 200, {
        value: [
          { id: 'ws-1', name: 'Belege 2026' },
          { id: 'ws-2', name: 'Belege 2025' },
        ],
      });

      await adapter.ensureTabExists(ctx, CUSTOMER_ID, SHEET_ID, TAB);

      // Nur GET-Call, kein POST
      const calls = fetchSpy.mock.calls;
      const methods = calls.map((c) => (c[1] as RequestInit)?.method ?? 'GET');
      expect(methods.every((m) => m === 'GET')).toBe(true);
    });

    it('tab fehlt → POST wird aufgerufen', async () => {
      const ctx = makeCredCtx();
      mockFetchSequence([
        // GET worksheets → Tab nicht vorhanden
        { ok: true, status: 200, body: { value: [{ id: 'ws-1', name: 'Other Sheet' }] } },
        // POST worksheet → neu angelegt
        { ok: true, status: 201, body: { id: 'ws-new', name: TAB } },
      ]);

      await adapter.ensureTabExists(ctx, CUSTOMER_ID, SHEET_ID, TAB);

      const fetchSpy = vi.mocked(global.fetch);
      const postCalls = fetchSpy.mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'POST',
      );
      expect(postCalls).toHaveLength(1);
      const postBody = JSON.parse((postCalls[0][1] as RequestInit).body as string) as { name: string };
      expect(postBody.name).toBe(TAB);
    });
  });

  // ── ensureHeader ────────────────────────────────────────────────────────────

  describe('ensureHeader', () => {
    const columns = [
      { header: 'Datum' },
      { header: 'Lieferant' },
      { header: 'Betrag' },
    ];

    it('leere erste Zeile → Header wird geschrieben', async () => {
      const ctx = makeCredCtx();
      mockFetchSequence([
        // GET range A1:C1 → leer
        { ok: true, status: 200, body: { values: [[null, null, null]], rowCount: 1, columnCount: 3 } },
        // PATCH range → Header gesetzt
        { ok: true, status: 200, body: {} },
      ]);

      await adapter.ensureHeader(ctx, CUSTOMER_ID, SHEET_ID, TAB, columns);

      const fetchSpy = vi.mocked(global.fetch);
      const patchCalls = fetchSpy.mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls).toHaveLength(1);
      const patchBody = JSON.parse((patchCalls[0][1] as RequestInit).body as string) as { values: string[][] };
      expect(patchBody.values[0]).toEqual(['Datum', 'Lieferant', 'Betrag']);
    });

    it('Header passt → no-op (kein PATCH)', async () => {
      const ctx = makeCredCtx();
      mockFetchAlways(true, 200, {
        values: [['Datum', 'Lieferant', 'Betrag']],
        rowCount: 1,
        columnCount: 3,
      });

      await adapter.ensureHeader(ctx, CUSTOMER_ID, SHEET_ID, TAB, columns);

      const fetchSpy = vi.mocked(global.fetch);
      const patchCalls = fetchSpy.mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls).toHaveLength(0);
    });

    it('Header weicht ab → wirft HeaderConflictError', async () => {
      const ctx = makeCredCtx();
      mockFetchAlways(true, 200, {
        values: [['Datum', 'Supplier', 'Betrag']],
        rowCount: 1,
        columnCount: 3,
      });

      await expect(
        adapter.ensureHeader(ctx, CUSTOMER_ID, SHEET_ID, TAB, columns),
      ).rejects.toThrow(HeaderConflictError);
    });
  });

  // ── findRowByReceiptId ──────────────────────────────────────────────────────

  describe('findRowByReceiptId', () => {
    it('DB-Cache trifft → kein API-Call', async () => {
      const ctx = makeCtx(
        vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('customer_credentials')) {
            return Promise.resolve({
              rows: [{
                credential_id: 'cred-1',
                access_token: 'tok-abc',
                refresh_token: 'refresh-xyz',
                tenant_id: 'tenant-001',
                expires_at: new Date(Date.now() + 10 * 60 * 1000),
              }],
            });
          }
          // Cache-Hit: row_index = 5
          if (sql.includes('spreadsheet_row_index')) {
            return Promise.resolve({ rows: [{ row_index: 5 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      );

      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await adapter.findRowByReceiptId(
        ctx, CUSTOMER_ID, SHEET_ID, TAB, RECEIPT_ID,
      );

      expect(result).toEqual({ row_index: 5 });
      // Kein fetch-Aufruf für MS Graph (nur ggf. für Credential-Refresh, aber nicht nötig da Cache)
      const graphCalls = fetchSpy.mock.calls.filter(
        (c) => (c[0] as string).includes('graph.microsoft.com'),
      );
      expect(graphCalls).toHaveLength(0);
    });

    it('kein Cache → API-Scan → Cache-Write bei Treffer', async () => {
      // Zähler für DB-Calls
      let dbCallCount = 0;
      const ctx = makeCtx(
        vi.fn().mockImplementation((sql: string) => {
          dbCallCount++;
          if (sql.includes('customer_credentials')) {
            return Promise.resolve({
              rows: [{
                credential_id: 'cred-1',
                access_token: 'tok-abc',
                refresh_token: 'refresh-xyz',
                tenant_id: 'tenant-001',
                expires_at: new Date(Date.now() + 10 * 60 * 1000),
              }],
            });
          }
          if (sql.includes('SELECT row_index')) {
            // Kein Cache-Eintrag
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('INSERT INTO spreadsheet_row_index')) {
            // Cache-Write erfolgreich
            return Promise.resolve({ rows: [], rowCount: 1 });
          }
          return Promise.resolve({ rows: [] });
        }),
      );

      // Range A:O mit receipt_id in Spalte O (Index 14), Zeile 3 (row_index=3)
      mockFetchAlways(true, 200, {
        values: [
          // Zeile 0: Header
          ['Datum', 'Lieferant', null, null, null, null, null, null, null, null, null, null, null, null, 'Receipt-ID'],
          // Zeile 1: Daten-Zeile 1 (row_index=2)
          ['2026-01-01', 'Supplier A', null, null, null, null, null, null, null, null, null, null, null, null, 'receipt-000'],
          // Zeile 2: Daten-Zeile 2 (row_index=3)
          ['2026-01-02', 'Supplier B', null, null, null, null, null, null, null, null, null, null, null, null, RECEIPT_ID],
        ],
        rowCount: 3,
        columnCount: 15,
      });

      const result = await adapter.findRowByReceiptId(
        ctx, CUSTOMER_ID, SHEET_ID, TAB, RECEIPT_ID,
      );

      expect(result).toEqual({ row_index: 3 });

      // Cache-Write muss aufgerufen worden sein
      const dbMock = (ctx.db as unknown as { query: ReturnType<typeof vi.fn> }).query;
      const insertCalls = dbMock.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO spreadsheet_row_index'),
      );
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('kein Cache, kein Treffer in API → null', async () => {
      const ctx = makeCredCtx();
      mockFetchAlways(true, 200, {
        values: [
          ['Datum', 'Lieferant', null, null, null, null, null, null, null, null, null, null, null, null, 'Receipt-ID'],
          ['2026-01-01', 'Supplier A', null, null, null, null, null, null, null, null, null, null, null, null, 'other-receipt'],
        ],
        rowCount: 2,
        columnCount: 15,
      });

      // DB gibt kein Ergebnis aus Cache zurück
      const dbMock = (ctx.db as unknown as { query: ReturnType<typeof vi.fn> }).query;
      dbMock.mockImplementation((sql: string) => {
        if (sql.includes('customer_credentials')) {
          return Promise.resolve({
            rows: [{
              credential_id: 'cred-1',
              access_token: 'tok-abc',
              refresh_token: 'refresh-xyz',
              tenant_id: 'tenant-001',
              expires_at: new Date(Date.now() + 10 * 60 * 1000),
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await adapter.findRowByReceiptId(
        ctx, CUSTOMER_ID, SHEET_ID, TAB, 'receipt-not-found',
      );

      expect(result).toBeNull();
    });
  });

  // ── appendRow ───────────────────────────────────────────────────────────────

  describe('appendRow', () => {
    it('appendRow: Zeile hinzugefügt, Cache aktualisiert', async () => {
      const ctx = makeCredCtx();
      mockFetchSequence([
        // GET tables → eine Tabelle vorhanden
        { ok: true, status: 200, body: { value: [{ id: 'table-1', name: 'Belege' }] } },
        // POST rows/add → index: 5 (= row_index 7 mit Header + 1-Basierung)
        { ok: true, status: 200, body: { index: 5 } },
      ]);

      const row = ['2026-01-01', 'Supplier', 'Rechnung-001', 'Betriebsausgaben', '4000', '', '119.00', '100.00', '19.00', '19%', 'EUR', 'Überweisung', '', 'archived', RECEIPT_ID, '2026-01-01T12:00:00Z'];

      const result = await adapter.appendRow(
        ctx, CUSTOMER_ID, SHEET_ID, TAB, RECEIPT_ID, row,
      );

      // row_index = index(5) + 2 = 7
      expect(result.row_index).toBe(7);
      expect(result.url).toContain(SHEET_ID);

      // Cache-Write prüfen
      const dbMock = (ctx.db as unknown as { query: ReturnType<typeof vi.fn> }).query;
      const insertCalls = dbMock.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO spreadsheet_row_index'),
      );
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('appendRow ohne Table → Fallback via Range-Insert', async () => {
      const ctx = makeCredCtx();
      mockFetchSequence([
        // GET tables → keine Tabelle
        { ok: true, status: 200, body: { value: [] } },
        // GET usedRange → 3 Zeilen benutzt
        { ok: true, status: 200, body: { rowCount: 3, address: `Sheet!A1:P3` } },
        // PATCH auf A4:P4
        { ok: true, status: 200, body: {} },
      ]);

      const row = ['2026-01-01', 'Supplier'];
      const result = await adapter.appendRow(
        ctx, CUSTOMER_ID, SHEET_ID, TAB, RECEIPT_ID, row,
      );

      // nextRow = rowCount(3) + 1 = 4
      expect(result.row_index).toBe(4);
    });
  });

  // ── updateRow ───────────────────────────────────────────────────────────────

  describe('updateRow', () => {
    it('updateRow: PATCH auf korrekten Range', async () => {
      const ctx = makeCredCtx();
      const fetchSpy = mockFetchAlways(true, 200, {});

      const row = ['2026-01-01', 'Updated Supplier', 'RNr-002'];
      const rowIndex = 5;

      const result = await adapter.updateRow(
        ctx, CUSTOMER_ID, SHEET_ID, TAB, RECEIPT_ID, rowIndex, row,
      );

      expect(result.row_index).toBe(rowIndex);
      expect(result.url).toContain(SHEET_ID);

      // Prüfe dass PATCH auf richtigen Range-URL geht
      const patchCalls = fetchSpy.mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls).toHaveLength(1);
      const patchUrl = patchCalls[0][0] as string;
      expect(patchUrl).toContain(`A${rowIndex}`);
      expect(patchUrl).toContain(`C${rowIndex}`); // 3 Spalten → C
    });
  });
});
