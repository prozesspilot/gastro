/**
 * M10 — Media-Downloader
 *
 * Lädt eine WhatsApp-Mediendatei via Meta Graph API, persistiert sie nach MinIO
 * und ist idempotent gegenüber bereits hochgeladenen Dateien (sha256-Vergleich
 * mit `receipts.file_sha256`).
 *
 * Pseudocode aus M10 §8.1 — exakt umgesetzt:
 *   1) Access-Token aus customer_credentials laden + entschlüsseln.
 *   2) Meta-Graph: getMediaMeta(media_id) → URL + mime_type.
 *   3) Meta-Graph: downloadMediaBytes(url) → Buffer.
 *   4) sha256(bytes) berechnen.
 *   5) Idempotenz-Check: receipts WHERE customer_id=$1 AND file_sha256=$2
 *      → vorhanden? → return existing object_key, is_duplicate:true (kein Re-Upload).
 *   6) Upload nach MinIO: {customer_id}/originals/{yyyy}/{mm}/{ulid}.{ext}
 *   7) Result mit object_key, sha256, mime_type, size_bytes, is_duplicate:false.
 *
 * Spec-Referenz: M10 §7.3, §8.1
 */

import { createHash } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { uploadObject } from '../../../core/storage/storage.service';
import { loadWaCredential } from './credential.service';
import type { MetaGraphClient } from './meta-graph.client';
import { buildObjectKey } from './object-key';
import { findReceiptByHash } from './receipt.repository';

// ── Typen ──────────────────────────────────────────────────────────────────

export interface MediaPersisted {
  object_key: string;
  sha256: string;
  mime_type: string;
  size_bytes: number;
  is_duplicate: boolean;
}

export interface DownloadMediaDeps {
  db: Pool;
  s3: S3Client;
  metaClient: MetaGraphClient;
}

// ── Hilfsfunktion ──────────────────────────────────────────────────────────

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ── Hauptfunktion ──────────────────────────────────────────────────────────

export async function downloadMedia(
  deps: DownloadMediaDeps,
  customerId: string,
  mediaId: string,
): Promise<MediaPersisted> {
  // 1) Credential
  const cred = await loadWaCredential(deps.db, customerId);

  // 2) Meta-URL holen
  const meta = await deps.metaClient.getMediaMeta(mediaId, cred.accessToken);

  // 3) Bytes laden
  const bytes = await deps.metaClient.downloadMediaBytes(meta.url, cred.accessToken);

  // 4) sha256
  const sha = sha256Hex(bytes);

  // 5) Idempotenz-Check
  const existing = await findReceiptByHash(deps.db, customerId, sha);
  if (existing) {
    logger.info(
      { customerId, mediaId, sha, receiptId: existing.receiptId },
      'Media-Download Idempotenz-Treffer — kein Re-Upload',
    );
    return {
      object_key: existing.objectKey,
      sha256: existing.sha256,
      mime_type: existing.mimeType || meta.mime_type,
      size_bytes: existing.sizeBytes || bytes.length,
      is_duplicate: true,
    };
  }

  // 6) Upload
  const key = buildObjectKey(customerId, meta.mime_type);
  await uploadObject(deps.s3, key, bytes, meta.mime_type);
  logger.info(
    { customerId, mediaId, key, sizeBytes: bytes.length },
    'Media nach MinIO hochgeladen',
  );

  // 7) Result
  return {
    object_key: key,
    sha256: sha,
    mime_type: meta.mime_type,
    size_bytes: bytes.length,
    is_duplicate: false,
  };
}
