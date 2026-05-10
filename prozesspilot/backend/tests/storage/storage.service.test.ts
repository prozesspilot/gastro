/**
 * D8 — Unit-Tests Storage-Service
 *
 * S3Client wird via vi.mock gemockt — kein echter MinIO-Server nötig.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── S3 + Presigner mocken ─────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  const S3Client = vi.fn(() => ({ send: mockSend }));
  return {
    S3Client,
    PutObjectCommand: vi.fn((args: unknown) => ({ _type: 'PUT', args })),
    GetObjectCommand: vi.fn((args: unknown) => ({ _type: 'GET', args })),
    DeleteObjectCommand: vi.fn((args: unknown) => ({ _type: 'DELETE', args })),
    HeadObjectCommand: vi.fn((args: unknown) => ({ _type: 'HEAD', args })),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue('https://minio.example.com/bucket/key?X-Amz-Signature=abc'),
}));

import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  deleteObject,
  getPresignedDownloadUrl,
  headObject,
  uploadObject,
} from '../../src/core/storage/storage.service';

// ── Hilfsfunktion: Mock-Client ────────────────────────────────────────────────

function makeClient() {
  const send = vi.fn();
  // @ts-expect-error mock
  vi.mocked(S3Client).mockImplementation(() => ({ send }));
  return {
    send,
    client: new S3Client({}) as unknown as InstanceType<typeof S3Client> & { send: typeof send },
  };
}

// ── uploadObject ──────────────────────────────────────────────────────────────

describe('uploadObject', () => {
  afterEach(() => vi.clearAllMocks());

  it('ruft PutObjectCommand auf und gibt UploadResult zurück', async () => {
    const { send, client } = makeClient();
    send.mockResolvedValue({});

    const result = await uploadObject(
      client,
      'tenant/2024-01/doc.pdf',
      Buffer.from('PDF'),
      'application/pdf',
    );

    expect(send).toHaveBeenCalledOnce();
    expect(result.key).toBe('tenant/2024-01/doc.pdf');
    expect(result.size_bytes).toBe(3); // Buffer.from('PDF').length
    expect(result.content_type).toBe('application/pdf');
  });

  it('wirft weiter wenn S3 Fehler meldet', async () => {
    const { send, client } = makeClient();
    send.mockRejectedValue(new Error('NoSuchBucket'));

    await expect(uploadObject(client, 'k', Buffer.alloc(1), 'application/pdf')).rejects.toThrow(
      'NoSuchBucket',
    );
  });
});

// ── getPresignedDownloadUrl ───────────────────────────────────────────────────

describe('getPresignedDownloadUrl', () => {
  afterEach(() => vi.clearAllMocks());

  it('gibt eine signierte URL zurück', async () => {
    const { client } = makeClient();
    const url = await getPresignedDownloadUrl(client, 'tenant/2024-01/doc.pdf');

    expect(getSignedUrl).toHaveBeenCalledOnce();
    expect(url).toContain('X-Amz-Signature');
  });
});

// ── deleteObject ──────────────────────────────────────────────────────────────

describe('deleteObject', () => {
  afterEach(() => vi.clearAllMocks());

  it('gibt true zurück bei Erfolg', async () => {
    const { send, client } = makeClient();
    send.mockResolvedValue({});

    const result = await deleteObject(client, 'some/key');
    expect(result).toBe(true);
  });

  it('gibt false zurück bei Fehler (kein throw)', async () => {
    const { send, client } = makeClient();
    send.mockRejectedValue(new Error('NoSuchKey'));

    const result = await deleteObject(client, 'some/key');
    expect(result).toBe(false);
  });
});

// ── headObject ────────────────────────────────────────────────────────────────

describe('headObject', () => {
  afterEach(() => vi.clearAllMocks());

  it('gibt Metadaten zurück wenn Objekt vorhanden', async () => {
    const { send, client } = makeClient();
    send.mockResolvedValue({ ContentLength: 1024, ContentType: 'application/pdf' });

    const meta = await headObject(client, 'some/key');
    expect(meta).toEqual({ size_bytes: 1024, content_type: 'application/pdf' });
  });

  it('gibt null zurück wenn Objekt nicht existiert', async () => {
    const { send, client } = makeClient();
    send.mockRejectedValue(Object.assign(new Error('NotFound'), { name: 'NotFound' }));

    const meta = await headObject(client, 'missing/key');
    expect(meta).toBeNull();
  });
});
