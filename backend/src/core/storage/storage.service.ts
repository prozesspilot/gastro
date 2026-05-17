/**
 * D8 — Storage-Service (MinIO / S3-kompatibel)
 *
 * Kapselt alle Operationen auf dem Objekt-Speicher:
 *   uploadObject()           – Datei hochladen
 *   getPresignedDownloadUrl() – zeitlich begrenzte Download-URL erzeugen
 *   deleteObject()           – Datei löschen
 *   headObject()             – Metadaten prüfen (Datei vorhanden?)
 *
 * MinIO-Besonderheit: forcePathStyle = true
 * Authentifizierung: MINIO_ACCESS_KEY / MINIO_SECRET_KEY aus config.ts
 *
 * Öffentliche API:
 *   createS3Client()
 *   uploadObject(client, key, body, contentType, sizeBytes?)
 *   getPresignedDownloadUrl(client, key, expiresInSeconds?)
 *   deleteObject(client, key)
 *   headObject(client, key)
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from '../logger';

// ── Client-Factory ────────────────────────────────────────────────────────────

export function createS3Client(overrides?: Partial<S3ClientConfig>): S3Client {
  return new S3Client({
    endpoint: config.MINIO_ENDPOINT,
    region: 'us-east-1', // MinIO ignoriert die Region, muss aber gesetzt sein
    forcePathStyle: true, // MinIO-Pflicht: http://host/bucket/key statt Subdomain
    credentials: {
      accessKeyId: config.MINIO_ACCESS_KEY,
      secretAccessKey: config.MINIO_SECRET_KEY,
    },
    ...overrides,
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  key: string;
  bucket: string;
  size_bytes: number;
  content_type: string;
}

/**
 * Lädt ein Objekt in den konfigurierten MinIO-Bucket hoch.
 *
 * @param client      S3Client-Instanz
 * @param key         Objekt-Key, z. B. "tenant-1/2024/doc-uuid.pdf"
 * @param body        Datei-Inhalt als Buffer
 * @param contentType MIME-Typ, z. B. "application/pdf"
 */
export async function uploadObject(
  client: S3Client,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<UploadResult> {
  logger.debug({ key, bucket: config.MINIO_BUCKET, size: body.length }, 'Datei hochladen');

  await client.send(
    new PutObjectCommand({
      Bucket: config.MINIO_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
    }),
  );

  return {
    key,
    bucket: config.MINIO_BUCKET,
    size_bytes: body.length,
    content_type: contentType,
  };
}

// ── Presigned Download-URL ────────────────────────────────────────────────────

/**
 * Erzeugt eine zeitlich begrenzte, vorgezeichnete Download-URL.
 * Gültig standardmäßig 1 Stunde.
 *
 * @param expiresIn  Gültigkeitsdauer in Sekunden (Standard: 3600)
 */
export async function getPresignedDownloadUrl(
  client: S3Client,
  key: string,
  expiresIn = 3_600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.MINIO_BUCKET,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Löscht ein Objekt aus dem Bucket.
 * Gibt true zurück wenn gelöscht, false wenn nicht vorhanden.
 */
export async function deleteObject(client: S3Client, key: string): Promise<boolean> {
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.MINIO_BUCKET,
        Key: key,
      }),
    );
    return true;
  } catch (err) {
    logger.warn({ err, key }, 'Objekt konnte nicht gelöscht werden');
    return false;
  }
}

// ── Head (Existenz-Check) ─────────────────────────────────────────────────────

/**
 * Prüft ob ein Objekt im Bucket vorhanden ist.
 * Gibt Metadaten zurück oder null.
 */
export async function headObject(
  client: S3Client,
  key: string,
): Promise<{ size_bytes: number; content_type: string } | null> {
  try {
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: config.MINIO_BUCKET,
        Key: key,
      }),
    );
    return {
      size_bytes: res.ContentLength ?? 0,
      content_type: res.ContentType ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}
