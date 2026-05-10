/**
 * Unit-Tests für den Dropbox-Adapter (M02).
 *
 * Alle HTTP-Calls werden via vi.spyOn(global, 'fetch') gemockt.
 * Kein echter DB-Zugriff — db-Pool wird als Mock übergeben.
 */

import type { Pool, QueryResult } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadInput } from '../../src/core/adapters/archive-storage/adapter.interface';
import { DropboxAdapter } from '../../src/core/adapters/archive-storage/dropbox.adapter';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(
  queryFn?: (text: string, values?: unknown[]) => Promise<Partial<QueryResult>>,
): Pool {
  return {
    query: queryFn ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as Pool;
}

/** Erstellt einen Mock-DB der immer ein gültiges Credential zurückgibt. */
function makeCredDb(): Pool {
  const credRow = {
    credential_id: 'cred-dbx-1',
    // Simuliert entschlüsseltes JSON
    plaintext: JSON.stringify({
      access_token: 'dbx-access-token',
      refresh_token: 'dbx-refresh-token',
      account_id: 'dbid:account-123',
    }),
    expires_at: null,
  };

  return makeDb(
    vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('customer_credentials')) {
        return Promise.resolve({ rows: [credRow] });
      }
      return Promise.resolve({ rows: [] });
    }),
  );
}

/**
 * Mock-fetch mit sequenziellen Responses.
 */
function mockFetchSequence(
  responses: Array<{ ok: boolean; status: number; body?: unknown; binaryBody?: ArrayBuffer }>,
): ReturnType<typeof vi.spyOn> {
  let callIndex = 0;
  return vi.spyOn(global, 'fetch').mockImplementation(async () => {
    const r = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
      arrayBuffer: async () => r.binaryBody ?? new TextEncoder().encode('pdf-content').buffer,
    } as unknown as Response;
  });
}

function mockFetchAlways(ok: boolean, status: number, body?: unknown) {
  return mockFetchSequence([{ ok, status, body }]);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CUSTOMER_ID = 'customer-dbx-1';
const PATH = '/2026/04/Wareneinkauf/rechnung.pdf';
const EXTERNAL_ID = 'id:AbCdEfGhIjKlMnOp';

const UPLOAD_INPUT: UploadInput = {
  customerId: CUSTOMER_ID,
  path: PATH,
  bytes: Buffer.from('PDF content'),
  mime: 'application/pdf',
  metadata: { receipt_id: 'receipt-001' },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DropboxAdapter', () => {
  let adapter: DropboxAdapter;

  beforeEach(() => {
    process.env.PP_PGCRYPTO_KEY = 'test-key-32-bytes-xxxxxxxxxxxxxxxxxx';
    process.env.DROPBOX_APP_KEY = 'dbx-app-key';
    process.env.DROPBOX_APP_SECRET = 'dbx-app-secret';

    const db = makeCredDb();
    adapter = new DropboxAdapter(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── exists ──────────────────────────────────────────────────────────────────

  describe('exists', () => {
    it('200 → true', async () => {
      mockFetchAlways(true, 200, {
        '.tag': 'file',
        id: EXTERNAL_ID,
        path_display: PATH,
        name: 'rechnung.pdf',
      });

      const result = await adapter.exists(PATH, CUSTOMER_ID);
      expect(result).toBe(true);
    });

    it('409 (path_not_found) → false', async () => {
      mockFetchAlways(false, 409, {
        error_summary: 'path/not_found/...',
        error: { '.tag': 'path', path: { '.tag': 'not_found' } },
      });

      const result = await adapter.exists(PATH, CUSTOMER_ID);
      expect(result).toBe(false);
    });
  });

  // ── upload ──────────────────────────────────────────────────────────────────

  describe('upload', () => {
    it('korrekte Headers + Body, gibt external_id und url zurück', async () => {
      const fetchSpy = mockFetchSequence([
        // POST /2/files/upload
        {
          ok: true,
          status: 200,
          body: {
            id: EXTERNAL_ID,
            path_display: PATH,
            name: 'rechnung.pdf',
          },
        },
        // POST /2/sharing/create_shared_link_with_settings
        {
          ok: true,
          status: 200,
          body: { url: 'https://www.dropbox.com/s/abc123/rechnung.pdf?dl=0' },
        },
      ]);

      const result = await adapter.upload(UPLOAD_INPUT);

      expect(result.external_id).toBe(EXTERNAL_ID);
      expect(result.path).toBe(PATH);
      expect(result.url).toBe('https://www.dropbox.com/s/abc123/rechnung.pdf?dl=0');

      // Prüfe Upload-Call
      const uploadCalls = fetchSpy.mock.calls.filter((c) =>
        (c[0] as string).includes('/2/files/upload'),
      );
      expect(uploadCalls).toHaveLength(1);

      // Prüfe Dropbox-API-Arg Header
      const uploadHeaders = (uploadCalls[0][1] as RequestInit).headers as Record<string, string>;
      expect(uploadHeaders['Dropbox-API-Arg']).toBeDefined();
      const apiArg = JSON.parse(uploadHeaders['Dropbox-API-Arg']) as { path: string; mode: string };
      expect(apiArg.path).toBe(PATH);
      expect(apiArg.mode).toBe('overwrite');
    });

    it('korrekte Body-Bytes werden übergeben', async () => {
      const fetchSpy = mockFetchSequence([
        {
          ok: true,
          status: 200,
          body: { id: EXTERNAL_ID, path_display: PATH, name: 'rechnung.pdf' },
        },
        { ok: true, status: 200, body: { url: 'https://www.dropbox.com/share' } },
      ]);

      await adapter.upload(UPLOAD_INPUT);

      const uploadCalls = fetchSpy.mock.calls.filter((c) =>
        (c[0] as string).includes('/2/files/upload'),
      );
      const uploadBody = (uploadCalls[0][1] as RequestInit).body;
      // Body sollte die übergebenen Bytes sein
      expect(uploadBody).toBe(UPLOAD_INPUT.bytes);
    });

    it('Share-Link-Fehler → Upload trotzdem erfolgreich (url undefined)', async () => {
      mockFetchSequence([
        // Upload OK
        {
          ok: true,
          status: 200,
          body: { id: EXTERNAL_ID, path_display: PATH, name: 'rechnung.pdf' },
        },
        // Share-Link schlägt fehl
        { ok: false, status: 403, body: { error_summary: 'no_permission' } },
      ]);

      const result = await adapter.upload(UPLOAD_INPUT);

      expect(result.external_id).toBe(EXTERNAL_ID);
      expect(result.url).toBeUndefined();
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('path korrekt übergeben', async () => {
      const fetchSpy = mockFetchAlways(true, 200, {
        metadata: { '.tag': 'file', id: EXTERNAL_ID, path_display: PATH, name: 'rechnung.pdf' },
      });

      await adapter.delete(EXTERNAL_ID, CUSTOMER_ID);

      const deleteCalls = fetchSpy.mock.calls.filter((c) =>
        (c[0] as string).includes('/2/files/delete_v2'),
      );
      expect(deleteCalls).toHaveLength(1);

      const body = JSON.parse((deleteCalls[0][1] as RequestInit).body as string) as {
        path: string;
      };
      expect(body.path).toBe(EXTERNAL_ID);
    });

    it('API-Fehler → wirft Error', async () => {
      mockFetchAlways(false, 409, { error_summary: 'path_lookup/not_found' });

      await expect(adapter.delete(EXTERNAL_ID, CUSTOMER_ID)).rejects.toThrow();
    });
  });

  // ── download ────────────────────────────────────────────────────────────────

  describe('download', () => {
    it('gibt Buffer zurück', async () => {
      const pdfContent = new TextEncoder().encode('mock PDF content');
      mockFetchSequence([{ ok: true, status: 200, body: {}, binaryBody: pdfContent.buffer }]);

      const result = await adapter.download(EXTERNAL_ID, CUSTOMER_ID);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('Dropbox-API-Arg Header gesetzt', async () => {
      const fetchSpy = mockFetchSequence([
        { ok: true, status: 200, body: {}, binaryBody: new TextEncoder().encode('pdf').buffer },
      ]);

      await adapter.download(EXTERNAL_ID, CUSTOMER_ID);

      const downloadCalls = fetchSpy.mock.calls.filter((c) =>
        (c[0] as string).includes('/2/files/download'),
      );
      expect(downloadCalls).toHaveLength(1);

      const headers = (downloadCalls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['Dropbox-API-Arg']).toBeDefined();
      const apiArg = JSON.parse(headers['Dropbox-API-Arg']) as { path: string };
      expect(apiArg.path).toBe(EXTERNAL_ID);
    });

    it('401 bei download → wirft Error (kein Refresh-Token im Test)', async () => {
      // Dieser Adapter-Test prüft dass 401 korrekt propagiert wird
      // wenn kein Refresh-Token vorhanden (kein refresh_token in credRow)
      const db = makeDb(
        vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('customer_credentials')) {
            return Promise.resolve({
              rows: [
                {
                  credential_id: 'cred-no-refresh',
                  plaintext: JSON.stringify({ access_token: 'expired-token' }),
                  expires_at: null,
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
      );
      const adapterNoRefresh = new DropboxAdapter(db);

      mockFetchAlways(false, 401, { error_summary: 'expired_access_token' });

      await expect(adapterNoRefresh.download(EXTERNAL_ID, CUSTOMER_ID)).rejects.toThrow();
    });
  });
});
