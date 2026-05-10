/**
 * M02 — End-to-End-Tests für POST /api/v1/receipts/:id/archive
 *
 * Tests (gemäß Aufgabe):
 *   1. Status 'extracted' → erfolgreich archiviert → status='archived'
 *   2. Status 'received' → assertStatus → 422 INVALID_STATUS
 *   3. imageToPdf() wird nur bei image/jpeg aufgerufen, nicht bei application/pdf
 *   4. Token-Refresh: Drive 401 → Refresh → Retry erfolgreich
 *   5. Kollision: exists() liefert 3× true, dann false → Filename endet auf _003
 *
 * Adapter-Auswahl wird über Mock-Factory injiziert; image-to-pdf via vi.mock.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks (vor App-Import setzen)
const imageToPdfMock = vi.fn(async (bytes: Buffer, _mime: string) =>
  Buffer.concat([Buffer.from('%PDF-1.4\nFAKE-CONVERTED\n'), bytes]),
);

vi.mock('../../../core/pdf/image-to-pdf', () => ({
  imageToPdf: (bytes: Buffer, mime: string) => imageToPdfMock(bytes, mime),
  isPdf: (mime: string) => mime.toLowerCase() === 'application/pdf',
}));

vi.mock('../../m01-receipt-intake/services/storage-download', () => ({
  downloadObject: vi.fn(async () => Buffer.from('FAKE_ORIGINAL_BYTES')),
}));

import type {
  ArchiveStorageAdapter,
  ArchiveStorageAdapterFactory,
  UploadInput,
  UploadResult,
} from '../../../core/adapters/archive-storage/factory';
import { m02ArchiveRoutes } from '../routes';

// ── Mock Adapter ─────────────────────────────────────────────────────────────

interface MockAdapterState {
  uploads: UploadInput[];
  existsResponses: boolean[]; // Queue: jeder exists()-Call konsumiert eine Response
  uploadResult: UploadResult;
}

function makeMockAdapter(state: MockAdapterState): ArchiveStorageAdapter {
  return {
    id: 'google_drive',
    async exists(_path: string, _cust: string): Promise<boolean> {
      return state.existsResponses.length > 0 ? state.existsResponses.shift()! : false;
    },
    async upload(input: UploadInput): Promise<UploadResult> {
      state.uploads.push(input);
      return { ...state.uploadResult, path: input.path };
    },
    async delete(_id: string, _cust: string) {
      /* noop */
    },
    async download(_id: string, _cust: string) {
      return Buffer.from('');
    },
  };
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

interface FakeDb {
  receipts: FakeReceiptRow[];
  audits: { action: string; payload: unknown }[];
  reset(): void;
  query: ReturnType<typeof vi.fn>;
}

const fakeDb: FakeDb = {
  receipts: [],
  audits: [],
  reset() {
    this.receipts = [];
    this.audits = [];
  },
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO audit_log/i.test(sql)) {
      fakeDb.audits.push({
        action: String(params[2]),
        payload: JSON.parse(String(params[4])),
      });
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
      fakeDb.receipts[idx] = {
        ...fakeDb.receipts[idx],
        status,
        storage_key: key,
        file_sha256: sha,
        metadata: { ...fakeDb.receipts[idx].metadata, ...patch },
        updated_at: new Date(),
      };
      return { rows: [fakeDb.receipts[idx]] };
    }
    if (/FROM\s+receipts/i.test(sql)) {
      // findById: WHERE id = $1 AND customer_id = $2
      const [id, cid] = params as [string, string];
      const row = fakeDb.receipts.find((r) => r.id === id && r.customer_id === cid);
      return { rows: row ? [row] : [] };
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

interface TestApp {
  app: FastifyInstance;
  adapterState: MockAdapterState;
}

async function buildTestApp(): Promise<TestApp> {
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

  const adapterState: MockAdapterState = {
    uploads: [],
    existsResponses: [],
    uploadResult: {
      path: '/PLACEHOLDER',
      external_id: 'drive_file_xyz',
      url: 'https://drive.google.com/file/d/drive_file_xyz/view',
    },
  };
  const factory: ArchiveStorageAdapterFactory = {
    for: () => makeMockAdapter(adapterState),
  };

  await app.register(m02ArchiveRoutes, {
    prefix: '/api/v1/receipts',
    s3: {} as never,
    archiveStorageAdapterFactory: factory,
  });
  await app.ready();
  return { app, adapterState };
}

// ── Fixture-Profil ───────────────────────────────────────────────────────────

const profileWithDrive = {
  customer_id: 'cust_a3f4b2',
  display_name: 'Pizzeria Bella Italia',
  package: 'standard',
  modules_enabled: ['M02'],
  integrations: {
    archive: {
      provider: 'google_drive',
      config: {
        root_folder_id: 'root_xyz',
        structure: '{year}/{month_de}/{category_label}/',
        filename_template: '{document_date}_{supplier_name}_{document_number}_{total_gross}EUR.pdf',
        naming_collisions: 'append_counter',
      },
      credentials_ref: 'cred_drive_a3f4b2',
    },
  },
};

function seedReceipt(overrides: Record<string, unknown> = {}, mime = 'image/jpeg'): void {
  const status = (overrides.status as string) ?? 'extracted';
  fakeDb.receipts.push({
    id: '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
    customer_id: 'cust_a3f4b2',
    status,
    storage_key: 'cust_a3f4b2/originals/2026/04/foo.jpg',
    file_sha256: 'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
    mime_type: mime,
    file_size_bytes: 1024,
    metadata: {
      extraction: {
        fields: {
          supplier_name: 'Pizzeria Bella Italia',
          document_number: 'RE-2026-1042',
          document_date: '2026-04-28',
          total_gross: 142.85,
        },
      },
      categorization: {
        category: 'wareneinkauf_food',
        category_label: 'Wareneinkauf',
      },
      ...overrides,
    },
    created_at: new Date(),
    updated_at: new Date(),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.app.close();
});

beforeEach(() => {
  fakeDb.reset();
  testApp.adapterState.uploads = [];
  testApp.adapterState.existsResponses = [];
  vi.clearAllMocks();
});

describe('M02 archive handler — happy path', () => {
  it('Test 1: Status extracted → archiviert, status=archived', async () => {
    seedReceipt({ status: 'extracted' });
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/archive',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profileWithDrive, trace_id: 'trc_test' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.receipt_patch.status).toBe('archived');
    expect(body.data.receipt_patch.archive.target).toBe('google_drive');
    expect(body.data.receipt_patch.archive.path).toBe(
      '2026/April/Wareneinkauf/2026-04-28_Pizzeria_Bella_Italia_RE-2026-1042_142.85EUR.pdf',
    );
    expect(body.data.receipt_patch.archive.external_id).toBe('drive_file_xyz');
    expect(body.data.receipt_patch.archive.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);

    // Receipt in der Fake-DB ebenfalls auf 'archived'
    expect(fakeDb.receipts[0].status).toBe('archived');

    // Upload-Aufruf bekam 'application/pdf' (M02 §7.1)
    expect(testApp.adapterState.uploads).toHaveLength(1);
    expect(testApp.adapterState.uploads[0].mime).toBe('application/pdf');
    expect(testApp.adapterState.uploads[0].metadata?.receipt_id).toBe('01HVZ8X4M3R9K7N2P6T1Q5Y8B4');
    expect(testApp.adapterState.uploads[0].metadata?.sha256).toBeDefined();

    // Audit-Eintrag pp.receipt.archived
    expect(fakeDb.audits.some((a) => a.action === 'pp.receipt.archived')).toBe(true);

    // Event geXADDed auf pp:events:receipt
    expect(fakeRedis.xadd).toHaveBeenCalled();
    const xaddArgs = (fakeRedis.xadd as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(xaddArgs[0]).toBe('pp:events:receipt');

    // events_to_emit
    expect(body.data.events_to_emit).toContain('pp.receipt.archived');
  });
});

describe('M02 archive handler — Status-Mismatch', () => {
  it('Test 2: Status received → assertStatus → 422 INVALID_STATUS', async () => {
    seedReceipt({ status: 'received' });
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/archive',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profileWithDrive, trace_id: 'trc_test' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_STATUS');
  });
});

describe('M02 archive handler — Image→PDF nur bei Bildern', () => {
  it('Test 3a: image/jpeg → imageToPdf wird gerufen', async () => {
    seedReceipt({ status: 'extracted' }, 'image/jpeg');
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/archive',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profileWithDrive },
    });
    expect(imageToPdfMock).toHaveBeenCalledTimes(1);
    expect(imageToPdfMock).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg');
  });

  it('Test 3b: application/pdf → imageToPdf wird NICHT gerufen', async () => {
    seedReceipt({ status: 'extracted' }, 'application/pdf');
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/archive',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profileWithDrive },
    });
    expect(imageToPdfMock).not.toHaveBeenCalled();
  });
});

describe('M02 archive handler — Kollisionen', () => {
  it('Test 5: exists() 3× true, dann false → Filename endet auf _003', async () => {
    seedReceipt({ status: 'extracted' });
    testApp.adapterState.existsResponses = [true, true, true, false];
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/archive',
      headers: { 'content-type': 'application/json' },
      payload: { customer_profile: profileWithDrive },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const path: string = body.data.receipt_patch.archive.path;
    // Datei endet auf _003.pdf (drei Kollisionen)
    expect(path).toMatch(/_003\.pdf$/);
    expect(testApp.adapterState.uploads[0].path).toMatch(/_003\.pdf$/);
  });
});

// ── Token-Refresh ────────────────────────────────────────────────────────────

describe('M02 archive — Token-Refresh (Drive 401 → Refresh → Retry)', () => {
  it('Test 4: Drive 401 beim ersten Call → refreshAccessToken → Retry erfolgreich', async () => {
    /**
     * Wir testen die Adapter-Logik isoliert (ohne HTTP-Layer):
     * Stub-Drive-Client wirft beim ersten Call einen 401, erfolgreich beim zweiten.
     * Der Adapter MUSS ein refreshAccessToken machen und einmal retryen.
     */
    const { GoogleDriveAdapter } = await import(
      '../../../core/adapters/archive-storage/google-drive.adapter'
    );
    const { saveDriveCredential, loadDriveCredential } = await import(
      '../../../core/adapters/archive-storage/drive-credentials'
    );

    // Spies — wir patchen die Module-Funktionen indirekt: erste loadDriveCredential
    // gibt das alte Token, Adapter ruft saveDriveCredential nach Refresh.
    const credCalls: { customerId: string }[] = [];
    const savedTokens: { accessToken: string }[] = [];
    const driveCredentialModule = await import(
      '../../../core/adapters/archive-storage/drive-credentials'
    );
    vi.spyOn(driveCredentialModule, 'loadDriveCredential').mockImplementation(
      async (_db, customerId) => {
        credCalls.push({ customerId });
        return {
          credentialId: 'cred_drive_test',
          accessToken: 'old-access-token',
          refreshToken: 'refresh-xxx',
          rootFolderId: 'root_xyz',
          expiryMs: Date.now() - 1_000,
        };
      },
    );
    vi.spyOn(driveCredentialModule, 'saveDriveCredential').mockImplementation(
      async (_db, _cid, _credId, next) => {
        savedTokens.push({ accessToken: next.accessToken });
      },
    );
    void saveDriveCredential;
    void loadDriveCredential; // unused after spy

    // Stub-Drive-Client — files.list:
    //   - alter Token: 401 beim allerersten Call
    //   - frischer Token: gibt für Folder-Lookups einen folder-Hit, für den
    //     eigentlichen file-Existence-Check eine leere Liste zurück.
    const driveClientFactory = (cred: { accessToken: string }) => ({
      files: {
        list: vi.fn(async (params: { q?: string }) => {
          if (cred.accessToken === 'old-access-token') {
            const err: Error & { code?: number } = new Error('Invalid Credentials');
            err.code = 401;
            throw err;
          }
          // Folder-Lookups erkennen wir am mimeType-Filter im Query.
          const isFolderQuery = (params.q ?? '').includes('mimeType');
          return isFolderQuery
            ? { data: { files: [{ id: 'folder_xyz', name: 'X' }] } }
            : { data: { files: [] } };
        }) as unknown as never,
        create: vi.fn() as unknown as never,
        get: vi.fn() as unknown as never,
        delete: vi.fn() as unknown as never,
      },
    });

    // OAuth-Stub-Client — refreshAccessToken liefert frisches Token.
    const oauthClientFactory = vi.fn(
      () =>
        ({
          setCredentials: () => undefined,
          refreshAccessToken: async () => ({
            credentials: {
              access_token: 'new-access-token',
              refresh_token: 'refresh-xxx',
              expiry_date: Date.now() + 3600_000,
            },
          }),
        }) as unknown as import('google-auth-library').OAuth2Client,
    );

    const adapter = new GoogleDriveAdapter({
      db: fakeDb as never,
      redis: fakeRedis as never,
      driveClientFactory,
      oauthClientFactory,
    });

    const result = await adapter.exists('/2026/April/Wareneinkauf/foo.pdf', 'cust_a3f4b2');

    // Erfolgreich nach Refresh
    expect(result).toBe(false); // (kein File mit name='foo.pdf' in den Mock-Listings)
    // Refresh wurde ausgelöst
    expect(savedTokens).toHaveLength(1);
    expect(savedTokens[0].accessToken).toBe('new-access-token');
  });
});

// ── Dropbox-Adapter: Interface-Compliance ────────────────────────────────────

describe('M02 archive — Adapter-Austauschbarkeit', () => {
  it('DropboxAdapter implementiert das ArchiveStorageAdapter-Interface', async () => {
    const { DropboxAdapter } = await import(
      '../../../core/adapters/archive-storage/dropbox.adapter'
    );
    // Ohne db-Pool wirft der Adapter einen konfigurierten Fehler (kein Stub-Error mehr)
    const dx = new DropboxAdapter();
    expect(dx.id).toBe('dropbox');
    // Alle Methoden existieren und sind callable
    expect(typeof dx.upload).toBe('function');
    expect(typeof dx.exists).toBe('function');
    expect(typeof dx.delete).toBe('function');
    expect(typeof dx.download).toBe('function');
    // Ohne db-Pool → db-Pool-Fehler (nicht mehr DROPBOX_NOT_IMPLEMENTED)
    await expect(
      dx.upload({ customerId: 'c', path: 'p', bytes: Buffer.alloc(0), mime: 'application/pdf' }),
    ).rejects.toThrow(/db-Pool/);
    await expect(dx.exists('p', 'c')).rejects.toThrow(/db-Pool/);
    await expect(dx.delete('id', 'c')).rejects.toThrow(/db-Pool/);
    await expect(dx.download('id', 'c')).rejects.toThrow(/db-Pool/);
  });
});
