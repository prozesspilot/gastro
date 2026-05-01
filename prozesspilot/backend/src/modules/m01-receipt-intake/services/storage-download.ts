/**
 * M01 — Storage-Download-Helper.
 *
 * Lädt eine Datei aus MinIO/S3 vollständig in einen Buffer. Wird vom
 * Extraction-Handler genutzt, um die Original-Datei vor dem OCR-Call
 * zu lesen.
 *
 * Lebt hier (statt im Core), weil aktuell nur M01 Bytes als Buffer braucht.
 * Sobald ein zweites Modul (z. B. M02) das ebenfalls braucht, gehört der
 * Helper nach `core/storage/`.
 */

import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { config } from '../../../core/config';

export async function downloadObject(
  s3: S3Client,
  objectKey: string,
): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({
    Bucket: config.MINIO_BUCKET,
    Key:    objectKey,
  }));
  const stream = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!stream?.transformToByteArray) {
    throw new Error(`Storage-Download: leerer Body für ${objectKey}`);
  }
  const arr = await stream.transformToByteArray();
  return Buffer.from(arr);
}
