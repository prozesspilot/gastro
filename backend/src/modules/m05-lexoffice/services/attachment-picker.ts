/**
 * M05 — Attachment-Picker.
 *
 * Auswahl der Beleg-Datei für den Lexoffice-Anhang:
 *   1) Wenn receipt.archive vorhanden: PDF aus Archive (Drive/Dropbox)
 *   2) Fallback: Original aus MinIO (S3)
 *
 * Aktuell ist die Drive-Lese-Implementierung stub — die meisten Setups laden
 * direkt aus MinIO (Original). Sobald der Drive-Adapter download() fertig
 * unterstützt wird die erste Strategie aktiviert.
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { Receipt } from '../../_shared/receipts/receipt.repository';
import { downloadObject } from '../../m01-receipt-intake/services/storage-download';

export interface PickAttachmentInput {
  receipt: Receipt;
  s3: S3Client;
}

export interface AttachmentPick {
  bytes: Buffer;
  filename: string;
  contentType: string;
}

export async function pickAttachmentBytes(input: PickAttachmentInput): Promise<AttachmentPick> {
  // MVP: laden direkt aus MinIO (Original-Datei)
  const objectKey = input.receipt.file.object_key;
  const bytes = await downloadObject(input.s3, objectKey);

  // Wenn Original kein PDF ist, geben wir trotzdem die Bytes weiter — Lexoffice
  // akzeptiert Bilder. Der spätere Drive-Adapter kann hier auf das archivierte
  // PDF zurückgreifen.
  const archive = input.receipt.archive as { path?: string } | undefined;
  const filename =
    (archive?.path && lastSegment(archive.path)) ?? `${input.receipt.receipt_id}.pdf`;

  const mime =
    input.receipt.file.mime_type === 'application/pdf'
      ? 'application/pdf'
      : input.receipt.file.mime_type;

  return { bytes, filename, contentType: mime };
}

function lastSegment(p: string): string | undefined {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1];
}
