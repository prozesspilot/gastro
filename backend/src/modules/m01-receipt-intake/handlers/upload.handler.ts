/**
 * M01 — Upload Handler
 *
 * POST /api/v1/belege/upload
 *
 * Nimmt eine Multipart-Datei entgegen, berechnet SHA256, lädt sie in MinIO hoch
 * und legt einen Beleg-Eintrag in der DB an.
 *
 * Sicherheit:
 *   - Auth: M14-JWT-Cookie (pp_auth)
 *   - Tenant-Context: X-PP-Tenant-ID Header
 *   - MIME-Type-Validierung (nur PDF + Bilder)
 *   - Dateigröße max. 20 MB (konfigurierbar via MAX_UPLOAD_SIZE_BYTES)
 *   - SHA256-Idempotenz: Duplikate werden erkannt + zurückgegeben
 */

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getM14Staff } from '../../../core/auth/m14-staff-auth';
import { config } from '../../../core/config';
import { uploadObject } from '../../../core/storage/storage.service';
import { logAuthEvent } from '../../m14-auth/users.repository';
import { insertBeleg } from '../services/beleg.repository';

// ── Konstanten ─────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'application/pdf']);

// Dateiendung aus MIME-Type ableiten
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

// Tenant-Header-Schema
const TenantHeaderSchema = z.object({
  'x-pp-tenant-id': z.string().uuid({ message: 'X-PP-Tenant-ID muss eine gültige UUID sein' }),
});

// ── Handler ────────────────────────────────────────────────────────────────

export async function uploadHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // 1. Auth-Check
  const staff = getM14Staff(req);
  if (!staff) {
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'M14-JWT-Authentifizierung erforderlich.',
    });
  }

  // 2. Tenant-Context aus Header
  const headerParse = TenantHeaderSchema.safeParse(req.headers);
  if (!headerParse.success) {
    return reply.code(400).send({
      error: 'missing_tenant',
      message: 'X-PP-Tenant-ID Header fehlt oder ist keine gültige UUID.',
    });
  }
  const tenantId = headerParse.data['x-pp-tenant-id'];

  // 3. Multipart-Datei lesen
  // DECISION: @fastify/multipart liefert via req.file() den Datei-Stream.
  // Wir lesen alles in einen Buffer (max 20MB — limitiert durch multipart-Plugin-Konfiguration).
  // Für sehr große Dateien wäre Streaming zu MinIO besser, aber 20MB ist handhabbar in Memory.
  const file = await req.file();
  if (!file) {
    return reply.code(400).send({
      error: 'no_file',
      message: 'Keine Datei im Multipart-Body gefunden.',
    });
  }

  // 4. MIME-Type validieren
  const mimeType = file.mimetype;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    // Stream konsumieren damit keine Resource-Leaks entstehen
    await file.toBuffer().catch(() => undefined);
    return reply.code(415).send({
      error: 'unsupported_media_type',
      message: `Dateityp '${mimeType}' nicht unterstützt. Erlaubt: JPEG, PNG, HEIC, PDF.`,
      allowed_types: Array.from(ALLOWED_MIME_TYPES),
    });
  }

  // 5. Datei-Buffer + Größe prüfen
  const fileBuffer = await file.toBuffer();
  const fileSizeBytes = fileBuffer.length;
  const maxBytes = config.MAX_UPLOAD_SIZE_BYTES;

  if (fileSizeBytes > maxBytes) {
    return reply.code(413).send({
      error: 'file_too_large',
      message: `Datei zu groß (${fileSizeBytes} Bytes). Maximum: ${maxBytes} Bytes (${Math.round(maxBytes / 1024 / 1024)} MB).`,
      max_bytes: maxBytes,
      actual_bytes: fileSizeBytes,
    });
  }

  if (fileSizeBytes === 0) {
    return reply.code(400).send({
      error: 'empty_file',
      message: 'Datei ist leer.',
    });
  }

  // 6. SHA256 berechnen
  const fileSha256 = createHash('sha256').update(fileBuffer).digest('hex');

  // 7. Storage-Key generieren: <tenant_id>/originals/<yyyy>/<mm>/<uuid>.<ext>
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const ext = MIME_TO_EXT[mimeType] ?? 'bin';
  const fileUuid = randomUUID();
  const storageKey = `${tenantId}/originals/${yyyy}/${mm}/${fileUuid}.${ext}`;

  // 8. MinIO-Upload
  const s3Client = req.server.s3;
  if (!s3Client) {
    req.log.error({ storageKey, tenantId }, 'S3-Client nicht initialisiert');
    return reply
      .code(500)
      .send({ error: 'storage_not_configured', message: 'Storage nicht konfiguriert.' });
  }
  try {
    await uploadObject(s3Client, storageKey, fileBuffer, mimeType);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err, storageKey, tenantId }, 'MinIO-Upload fehlgeschlagen');
    return reply.code(502).send({
      error: 'storage_error',
      message: `Datei konnte nicht gespeichert werden: ${message}`,
    });
  }

  // 9. DB-Insert (idempotent via SHA256-Conflict)
  const originalFilename = file.filename ?? `upload.${ext}`;
  const { beleg, isDuplicate } = await insertBeleg(req.server.db, {
    tenantId,
    sourceChannel: 'manual_upload',
    fileObjectKey: storageKey,
    fileMimeType: mimeType,
    fileSizeBytes,
    fileSha256,
    uploadedByUserId: staff.userId,
    originalFilename,
  });

  // 10. Audit-Log: beleg_uploaded (fire-and-forget)
  await logAuthEvent(req.server.db, {
    userId: staff.userId,
    eventType: 'beleg_uploaded',
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    metadata: {
      beleg_id: beleg.id,
      tenant_id: tenantId,
      source_channel: 'manual_upload',
      is_duplicate: isDuplicate,
      file_mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
    },
  });

  // 11. Response
  const statusCode = isDuplicate ? 200 : 201;
  return reply.code(statusCode).send({
    beleg_id: beleg.id,
    storage_key: beleg.file_object_key,
    status: beleg.status,
    ...(isDuplicate ? { is_duplicate: true } : {}),
  });
}
