/**
 * M01 / T070 — Geteilte Beleg-Upload-Pipeline.
 *
 * Extrahiert aus upload.handler.ts, damit BEIDE Eingänge dieselbe geprüfte
 * Pipeline nutzen (DRY): der Staff-Upload (`POST /belege/upload`, sourceChannel
 * 'manual_upload') UND der Web-Chat-Eingang des Wirts (`POST /chat/:token/belege`,
 * sourceChannel 'web_chat', T070).
 *
 * Pipeline (nach Auth/Tenant-Resolve, die die jeweiligen Handler machen):
 *   Größen-/Magic-Bytes-Validierung → SHA256 → Duplikat-/Undelete-Check VOR
 *   MinIO-Upload → MinIO → insertBeleg (idempotent, Audit in Tx) → OCR-Enqueue.
 *
 * Die Funktion wirft NICHT für erwartbare Fehler (leere/zu große/unbekannte
 * Datei, Storage-Fehler) — sie liefert ein `{ ok:false, code, body }`, das der
 * Handler 1:1 als HTTP-Antwort sendet. Nur unerwartete DB-Fehler propagieren.
 */
import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import { config } from '../../../core/config';
import { enqueueOcrJob } from '../../../core/queue/ocr-queue';
import { uploadObject } from '../../../core/storage/storage.service';
import {
  type DbBeleg,
  getBelegById,
  getBelegBySha256,
  insertBeleg,
  undeleteBelegBySha256,
} from './beleg.repository';

// ── MIME / Magic-Bytes (B3) ──────────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'application/pdf',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const MIME_TO_EXT: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/**
 * B3: Magic-Bytes-Erkennung aus dem Datei-Buffer (eigene Implementierung statt
 * ESM-only `file-type`). JPEG (FF D8 FF), PNG (89 50 4E 47 …), PDF (%PDF),
 * HEIC (ftyp-Box ab Byte 4).
 */
export function detectMimeFromBytes(buf: Buffer): AllowedMimeType | null {
  if (buf.length < 4) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  if (buf.length >= 12) {
    const ftyp = buf.slice(4, 8).toString('ascii');
    if (ftyp === 'ftyp') {
      const brand = buf.slice(8, 12).toString('ascii');
      const heicBrands = ['heic', 'heis', 'hevc', 'hevx', 'heim', 'heix', 'mif1', 'msf1'];
      if (heicBrands.includes(brand)) {
        return 'image/heic';
      }
    }
  }
  return null;
}

/**
 * M1: Sanitisiert Dateinamen. Erlaubt a-z A-Z 0-9 . - _ und Leerzeichen, max 255.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]/g, '_').slice(0, 255);
}

/** B4: verwaistes MinIO-Objekt aufräumen (best-effort). */
async function deleteOrphanedObject(
  s3: S3Client,
  bucket: string,
  key: string,
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), keyPrefix: key.substring(0, 40) },
      '[m01] Orphaned MinIO object cleanup failed',
    );
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface BelegUploadLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
  info: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface BelegUploadDeps {
  db: Pool;
  s3: S3Client | undefined;
  logger: BelegUploadLogger;
}

export interface ProcessBelegUploadInput {
  tenantId: string;
  sourceChannel: 'manual_upload' | 'web_chat';
  fileBuffer: Buffer;
  filename: string;
  /** Staff-User-ID beim manual_upload; NULL beim web_chat-Eingang (Wirt). */
  uploadedByUserId: string | null;
}

export type ProcessBelegUploadResult =
  | { ok: false; code: number; body: Record<string, unknown> }
  | { ok: true; beleg: DbBeleg; isDuplicate: boolean; isUndeleted: boolean };

export async function processBelegUpload(
  deps: BelegUploadDeps,
  input: ProcessBelegUploadInput,
): Promise<ProcessBelegUploadResult> {
  const { db, s3, logger } = deps;
  const { tenantId, sourceChannel, fileBuffer, uploadedByUserId } = input;
  const fileSizeBytes = fileBuffer.length;

  if (fileSizeBytes === 0) {
    return { ok: false, code: 400, body: { error: 'empty_file', message: 'Datei ist leer.' } };
  }
  const maxBytes = config.MAX_UPLOAD_SIZE_BYTES;
  if (fileSizeBytes > maxBytes) {
    return {
      ok: false,
      code: 413,
      body: {
        error: 'file_too_large',
        message: `Datei zu groß (${fileSizeBytes} Bytes). Maximum: ${maxBytes} Bytes (${Math.round(maxBytes / 1024 / 1024)} MB).`,
        max_bytes: maxBytes,
        actual_bytes: fileSizeBytes,
      },
    };
  }

  const mimeType = detectMimeFromBytes(fileBuffer);
  if (!mimeType) {
    return {
      ok: false,
      code: 415,
      body: {
        error: 'unsupported_mime_type',
        message: 'Dateiformat nicht erkannt. Erlaubt: JPEG, PNG, HEIC, PDF.',
        allowed_types: [...ALLOWED_MIME_TYPES],
      },
    };
  }
  const ext = MIME_TO_EXT[mimeType];
  const fileSha256 = createHash('sha256').update(fileBuffer).digest('hex');

  // Audit-Actor je Eingang: Staff (manual_upload) vs. Customer (web_chat).
  const undeleteActor = uploadedByUserId
    ? ({ type: 'staff', id: uploadedByUserId } as const)
    : ({ type: 'customer', id: null } as const);

  // B4: SHA256-First — Duplikat/Undelete VOR MinIO-Upload (keine verwaisten Objekte).
  const existing = await getBelegBySha256(db, tenantId, fileSha256);
  if (existing) {
    if (existing.deleted_at !== null) {
      const undeleted = await undeleteBelegBySha256(db, tenantId, fileSha256, undeleteActor);
      if (undeleted !== null) {
        logger.info(
          { belegId: undeleted.id },
          '[m01] Soft-deleted Beleg via SHA256-Reupload reaktiviert',
        );
        return { ok: true, beleg: undeleted, isDuplicate: false, isUndeleted: true };
      }
      // Undelete-Race (parallel reaktiviert/verändert) → unten als Duplikat behandeln.
    }
    // Existierender Beleg (aktiv ODER nach Undelete-Race noch soft-deleted) → als
    // Duplikat zurückgeben, OHNE neuen MinIO-Write (Parität zu main: keine verwaisten
    // Objekte). includeDeleted, damit auch der soft-deleted Race-Fall ein vollständiges
    // Ergebnis liefert statt zur Upload-Strecke durchzufallen.
    const full = await getBelegById(db, tenantId, existing.id, { includeDeleted: true });
    if (full) {
      return { ok: true, beleg: full, isDuplicate: true, isUndeleted: false };
    }
    // (Theoretisch: Row zwischenzeitlich hart gelöscht — extrem selten → neuer Upload.)
  }

  if (!s3) {
    logger.error({ tenantId: tenantId.substring(0, 8) }, '[m01] S3-Client nicht initialisiert');
    return {
      ok: false,
      code: 500,
      body: { error: 'storage_not_configured', message: 'Storage nicht konfiguriert.' },
    };
  }

  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const storageKey = `${tenantId}/originals/${yyyy}/${mm}/${randomUUID()}.${ext}`;

  try {
    await uploadObject(s3, storageKey, fileBuffer, mimeType);
  } catch (err) {
    logger.error(
      {
        err: {
          message: err instanceof Error ? err.message : String(err),
          name: (err as Error)?.name,
        },
        storageKeyPrefix: storageKey.substring(0, 40),
      },
      '[m01] MinIO-Upload fehlgeschlagen',
    );
    return {
      ok: false,
      code: 502,
      body: { error: 'storage_error', message: 'Datei konnte nicht gespeichert werden.' },
    };
  }

  const safeFilename = sanitizeFilename(input.filename || `upload.${ext}`);

  let beleg: DbBeleg;
  let isDuplicate: boolean;
  try {
    const result = await insertBeleg(db, {
      tenantId,
      sourceChannel,
      fileObjectKey: storageKey,
      fileMimeType: mimeType,
      fileSizeBytes,
      fileSha256,
      uploadedByUserId,
      originalFilename: safeFilename,
    });
    beleg = result.beleg;
    isDuplicate = result.isDuplicate;
  } catch (err) {
    // B4: Race — paralleler Request hat denselben SHA256 eingetragen. MinIO aufräumen.
    await deleteOrphanedObject(s3, config.MINIO_BUCKET, storageKey, logger);
    throw err;
  }

  // OCR nur für neue Belege; Enqueue-Fehler darf den Upload nicht failen.
  if (!isDuplicate) {
    try {
      await enqueueOcrJob({ tenantId, belegId: beleg.id, reason: 'upload' });
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), belegId: beleg.id },
        '[m01] OCR-Enqueue fehlgeschlagen — Beleg verbleibt im status=received',
      );
    }
  }

  return { ok: true, beleg, isDuplicate, isUndeleted: false };
}
