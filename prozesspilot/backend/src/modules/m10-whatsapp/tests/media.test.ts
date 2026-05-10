/**
 * M10 — Tests für media-downloader (Idempotenz, Mocked Meta + Storage)
 *
 * Pflicht-Fall:
 *   - zweimal gleicher sha256 → is_duplicate:true beim zweiten Aufruf,
 *     genau 1 Storage-Upload insgesamt.
 *
 * Wir mocken alle Seiteneffekte: Meta-Graph-Client, Postgres-Pool, S3-Client
 * und den Credential-Loader. Das hält den Test unabhängig von Infrastruktur.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadMedia, sha256Hex } from '../services/media-downloader';
import type { MetaGraphClient } from '../services/meta-graph.client';

// ── credential.service.loadWaCredential mocken ────────────────────────────

vi.mock('../services/credential.service', () => ({
  loadWaCredential: vi.fn(async () => ({
    credentialId: 'cred_test_1',
    accessToken: 'EAAtest-token',
    phoneNumberId: '123456789012345',
    graphApiVersion: 'v19.0',
  })),
  CredentialNotFoundError: class extends Error {
    readonly code = 'CREDENTIAL_NOT_FOUND';
  },
}));

// ── Storage-Service mocken (statt MinIO laufen lassen) ───────────────────

vi.mock('../../../core/storage/storage.service', () => ({
  uploadObject: vi.fn(async (_client, key: string, body: Buffer, contentType: string) => ({
    key,
    bucket: 'prozesspilot-raw',
    size_bytes: body.length,
    content_type: contentType,
  })),
  createS3Client: vi.fn(() => ({}) as never),
}));

// Importe nach den vi.mock-Calls (vi.mock wird hoisted, aber dieser Stil ist klarer)
import { uploadObject } from '../../../core/storage/storage.service';

// ── Helpers ───────────────────────────────────────────────────────────────

const SAMPLE_BYTES = Buffer.from('JPEGFAKEBYTES_FOR_TESTING_PURPOSE');
const SAMPLE_SHA = sha256Hex(SAMPLE_BYTES);

function makeMetaClient(overrides: Partial<MetaGraphClient> = {}): MetaGraphClient {
  return {
    getMediaMeta: vi.fn(async () => ({
      url: 'https://lookaside.fbsbx.com/whatsapp/test',
      mime_type: 'image/jpeg',
      sha256: SAMPLE_SHA,
      file_size: SAMPLE_BYTES.length,
    })),
    downloadMediaBytes: vi.fn(async () => SAMPLE_BYTES),
    sendTemplateMessage: vi.fn(async () => ({ message_id: 'wamid.MOCK' })),
    ...overrides,
  };
}

interface FakeReceiptRow {
  receipt_id: string;
  file_object_key: string;
  file_sha256: string;
  payload: { file?: { mime_type?: string; size_bytes?: number } };
}

function fakeDb(receipts: FakeReceiptRow[]) {
  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (/FROM receipts/i.test(sql)) {
        const customerId = params[0] as string;
        const sha = params[1] as string;
        const matched = receipts.filter((r) => r.file_sha256 === sha && customerId.length > 0);
        return { rows: matched };
      }
      return { rows: [] };
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadMedia (M10 §8.1)', () => {
  it('lädt neue Datei: Storage-Upload erfolgt, is_duplicate=false', async () => {
    const db = fakeDb([]);
    const meta = makeMetaClient();
    const s3 = {} as never;

    const res = await downloadMedia(
      { db: db as never, s3, metaClient: meta },
      'cust_a3f4b2',
      'media-id-1',
    );

    expect(res.is_duplicate).toBe(false);
    expect(res.sha256).toBe(SAMPLE_SHA);
    expect(res.mime_type).toBe('image/jpeg');
    expect(res.size_bytes).toBe(SAMPLE_BYTES.length);
    expect(res.object_key).toMatch(/^cust_a3f4b2\/originals\/\d{4}\/\d{2}\/[0-9A-Z]{26}\.jpg$/);

    expect(meta.getMediaMeta).toHaveBeenCalledTimes(1);
    expect(meta.downloadMediaBytes).toHaveBeenCalledTimes(1);
    expect(uploadObject).toHaveBeenCalledTimes(1);
  });

  it('zweiter Aufruf mit gleichem sha256 → is_duplicate=true, KEIN Re-Upload', async () => {
    // 1. Aufruf: noch kein Receipt — wird upgeloadet
    const receipts: FakeReceiptRow[] = [];
    const db = fakeDb(receipts);
    const meta = makeMetaClient();
    const s3 = {} as never;

    const first = await downloadMedia(
      { db: db as never, s3, metaClient: meta },
      'cust_a3f4b2',
      'media-id-1',
    );
    expect(first.is_duplicate).toBe(false);

    // Wir simulieren, dass jetzt ein Receipt mit diesem sha existiert.
    receipts.push({
      receipt_id: '01HVZTEST',
      file_object_key: first.object_key,
      file_sha256: first.sha256,
      payload: { file: { mime_type: 'image/jpeg', size_bytes: SAMPLE_BYTES.length } },
    });

    const second = await downloadMedia(
      { db: db as never, s3, metaClient: meta },
      'cust_a3f4b2',
      'media-id-1',
    );

    expect(second.is_duplicate).toBe(true);
    expect(second.object_key).toBe(first.object_key);
    expect(second.sha256).toBe(first.sha256);

    // genau 1 Upload insgesamt
    expect(uploadObject).toHaveBeenCalledTimes(1);
    // Meta wird zweimal aufgerufen (URL + Bytes), das ist spec-konform —
    // Idempotenz greift nach sha256-Berechnung.
    expect(meta.downloadMediaBytes).toHaveBeenCalledTimes(2);
  });

  it('berechnet sha256 aus heruntergeladenen Bytes (nicht aus Meta-Antwort)', async () => {
    const db = fakeDb([]);
    // Meta lügt über sha256 → uns interessiert der echte Hash der Bytes
    const lyingMeta = makeMetaClient({
      getMediaMeta: vi.fn(async () => ({
        url: 'https://x.test/file',
        mime_type: 'image/jpeg',
        sha256: 'deadbeef'.repeat(8),
        file_size: SAMPLE_BYTES.length,
      })),
    });

    const res = await downloadMedia(
      { db: db as never, s3: {} as never, metaClient: lyingMeta },
      'cust_a3f4b2',
      'media-id-1',
    );

    expect(res.sha256).toBe(SAMPLE_SHA); // echte Bytes, nicht Meta-Wert
  });
});
