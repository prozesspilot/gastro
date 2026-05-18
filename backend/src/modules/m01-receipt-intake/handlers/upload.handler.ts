/**
 * M01 — Upload Handler
 *
 * POST /api/v1/belege/upload
 *
 * Nimmt eine Multipart-Datei entgegen, prüft Magic-Bytes, berechnet SHA256,
 * prüft auf Duplikat, lädt in MinIO hoch und legt einen Beleg-Eintrag in der DB an.
 *
 * Sicherheit:
 *   - Auth: M14-JWT-Cookie (pp_auth)  →  m14StaffAuthHook
 *   - Tenant-Context: X-PP-Tenant-ID Header  →  m14TenantContextHook
 *   - Magic-Bytes-Validation (B3) — nicht nur Content-Type-Header vertrauen
 *   - Dateigröße max. 20 MB (konfigurierbar via MAX_UPLOAD_SIZE_BYTES)
 *   - SHA256-Idempotenz: Duplikate werden erkannt VOR MinIO-Upload (B4)
 *   - Filename-Sanitization: nur sichere Zeichen (M1)
 *   - Tenant-Existenz-Check vor Upload (M3)
 *
 * TODO bei >50 req/min auf Stream-Upload umstellen. Pilot-Limit: 1 Tenant,
 * 100 Belege/Monat — Buffer-in-Memory ist für diesen Rahmen korrekt.
 * DECISION: Pilot hat max 1 Tenant + 100 Belege/Monat, daher kein Streaming nötig.
 */

import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../../core/config';
import { uploadObject } from '../../../core/storage/storage.service';
import { insertBeleg } from '../services/beleg.repository';

// ── Konstanten ─────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// Dateiendung aus MIME-Type ableiten
const MIME_TO_EXT: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * B3: Magic-Bytes-Erkennung aus dem Datei-Buffer.
 *
 * DECISION: Eigene Implementierung statt `file-type` npm-Paket, da file-type
 * ESM-only ist und unser tsconfig.json moduleResolution=node (CommonJS) nutzt.
 * Die erlaubten Typen sind bekannt und klein (4 Stück), eine eigene Implementierung
 * ist wartbarer als ein ESM-Interop-Workaround.
 *
 * Magic-Bytes-Referenzen:
 *   JPEG:  FF D8 FF
 *   PNG:   89 50 4E 47 0D 0A 1A 0A
 *   PDF:   25 50 44 46 ('%PDF')
 *   HEIC:  ftyp-Box ab Byte 4 (ISO Base Media File Format)
 */
function detectMimeFromBytes(buf: Buffer): AllowedMimeType | null {
  if (buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
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

  // PDF: 25 50 44 46 ('%PDF')
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }

  // HEIC/HEIF: ISO Base Media File Format (ftyp box)
  // Box-Größe (4 Bytes big-endian) + 'ftyp' (4 Bytes) + brand-Code
  // Brands für HEIC: heic, heis, hevc, hevx, heim, heix, hevm, hevs, mif1, msf1
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
 * M1: Sanitisiert Dateinamen für sichere Speicherung.
 * Erlaubt: a-z, A-Z, 0-9, Punkt, Bindestrich, Unterstrich, Leerzeichen.
 * Maximal 255 Zeichen.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]/g, '_').slice(0, 255);
}

/**
 * B4: Löscht ein verwaistes MinIO-Objekt (Best-effort, Fehler werden geloggt).
 * Wird aufgerufen wenn DB-Insert nach MinIO-Upload fehlschlägt (z. B. Duplicate).
 */
async function deleteOrphanedObject(s3: S3Client, bucket: string, key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    // Best-effort: bei Fehler nur loggen, nicht throwen
    console.warn(`[m01] Orphaned MinIO object cleanup failed: ${key.substring(0, 40)}...`, err);
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function uploadHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Auth + Tenant wurden bereits von preHandler-Hooks geprüft (belege.routes.ts).
  // req.tenantId ist von m14TenantContextHook gesetzt.
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  const tenantId = req.tenantId;

  if (!staff || !tenantId) {
    // Sollte nicht passieren wenn Hooks korrekt registriert — defensive Absicherung
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }

  // Minor: Role-Check — support darf NICHT uploaden (Beleg-Upload ist nicht support-Job)
  // DECISION: support kann Belege lesen (GET), aber nicht hochladen (POST).
  if (staff.role === 'support') {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Support-Rolle hat keinen Zugriff auf Beleg-Upload.',
    });
  }

  // M3: Tenant-Existenz prüfen VOR Multipart-Parse (spart Bandwidth bei ungültigem Tenant)
  const tenantCheck = await req.server.db.query(
    'SELECT 1 FROM tenants WHERE id = $1 AND deleted_at IS NULL',
    [tenantId],
  );
  if (tenantCheck.rows.length === 0) {
    return reply.code(404).send({ error: 'tenant_not_found', message: 'Tenant nicht gefunden.' });
  }

  // Multipart-Datei lesen
  // DECISION: Buffer-in-Memory (max 20MB). Für >50 req/min auf Streaming umstellen.
  const file = await req.file();
  if (!file) {
    return reply.code(400).send({
      error: 'no_file',
      message: 'Keine Datei im Multipart-Body gefunden.',
    });
  }

  // Buffer lesen (nach MIME-Check kommt Magic-Bytes-Check)
  const fileBuffer = await file.toBuffer();
  const fileSizeBytes = fileBuffer.length;

  if (fileSizeBytes === 0) {
    return reply.code(400).send({
      error: 'empty_file',
      message: 'Datei ist leer.',
    });
  }

  const maxBytes = config.MAX_UPLOAD_SIZE_BYTES;
  if (fileSizeBytes > maxBytes) {
    return reply.code(413).send({
      error: 'file_too_large',
      message: `Datei zu groß (${fileSizeBytes} Bytes). Maximum: ${maxBytes} Bytes (${Math.round(maxBytes / 1024 / 1024)} MB).`,
      max_bytes: maxBytes,
      actual_bytes: fileSizeBytes,
    });
  }

  // B3: Magic-Bytes-Validation — nicht dem Content-Type-Header des Clients vertrauen
  const detectedMime = detectMimeFromBytes(fileBuffer);

  if (!detectedMime) {
    return reply.code(415).send({
      error: 'unsupported_mime_type',
      message: 'Dateiformat nicht erkannt. Erlaubt: JPEG, PNG, HEIC, PDF.',
      allowed_types: [...ALLOWED_MIME_TYPES],
    });
  }

  // Ab hier: detectedMime ist zuverlässig (aus den Magic-Bytes, nicht vom Client-Header)
  const mimeType = detectedMime;
  const ext = MIME_TO_EXT[mimeType];

  // SHA256 berechnen
  const fileSha256 = createHash('sha256').update(fileBuffer).digest('hex');

  // B4: SHA256-First — Duplikat-Check VOR MinIO-Upload (verhindert verwaiste Objekte)
  // DECISION: Wir prüfen direkt via pool.query (kein Tenant-Context nötig für SELECT mit
  //   explizitem tenant_id=$1 — der RLS-Kontext wird im insertBeleg gesetzt).
  //   Alternative wäre via getBelegBySha256, aber direkter Query ist einfacher.
  const existingCheck = await req.server.db.query<{
    id: string;
    file_object_key: string;
    status: string;
  }>(
    "SELECT set_config('app.tenant_id', $1, false), id, file_object_key, status FROM belege WHERE tenant_id = $1 AND file_sha256 = $2",
    [tenantId, fileSha256],
  );

  if (existingCheck.rows.length > 0) {
    const existing = existingCheck.rows[0];
    // M9: PII-sicher — kein vollständiger Storage-Key im Response
    return reply.code(200).send({
      beleg_id: existing.id,
      storage_key: existing.file_object_key,
      status: existing.status,
      is_duplicate: true,
    });
  }

  // Storage-Key generieren: <tenant_id>/originals/<yyyy>/<mm>/<uuid>.<ext>
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const fileUuid = randomUUID();
  const storageKey = `${tenantId}/originals/${yyyy}/${mm}/${fileUuid}.${ext}`;

  // S3-Client prüfen
  const s3Client = req.server.s3;
  if (!s3Client) {
    req.log.error({ tenantId: tenantId.substring(0, 8) }, '[m01] S3-Client nicht initialisiert');
    return reply.code(500).send({
      error: 'storage_not_configured',
      message: 'Storage nicht konfiguriert.',
    });
  }

  // MinIO-Upload
  try {
    await uploadObject(s3Client, storageKey, fileBuffer, mimeType);
  } catch (err) {
    // M4: Keine err.message im Response — kein internes Leak nach außen
    req.log.error(
      {
        err: {
          message: err instanceof Error ? err.message : String(err),
          name: (err as Error)?.name,
        },
        storageKeyPrefix: storageKey.substring(0, 40),
      },
      '[m01] MinIO-Upload fehlgeschlagen',
    );
    return reply.code(502).send({
      error: 'storage_error',
      message: 'Datei konnte nicht gespeichert werden.',
    });
  }

  // M1: Filename sanitisieren
  const safeFilename = sanitizeFilename(file.filename || `upload.${ext}`);

  // DB-Insert (idempotent via SHA256-Conflict + B1 Audit-Log in Tx)
  let beleg: Awaited<ReturnType<typeof insertBeleg>>['beleg'];
  let isDuplicate: boolean;
  try {
    const result = await insertBeleg(req.server.db, {
      tenantId,
      sourceChannel: 'manual_upload',
      fileObjectKey: storageKey,
      fileMimeType: mimeType,
      fileSizeBytes,
      fileSha256,
      uploadedByUserId: staff.userId,
      originalFilename: safeFilename,
    });
    beleg = result.beleg;
    isDuplicate = result.isDuplicate;
  } catch (err) {
    // B4: Race-Condition — paralleler Request hat denselben SHA256 eingetragen.
    //     MinIO-Objekt aufräumen (Best-effort).
    await deleteOrphanedObject(s3Client, config.MINIO_BUCKET, storageKey);
    throw err; // Fastify-Error-Handler übernimmt
  }

  // Response
  const statusCode = isDuplicate ? 200 : 201;
  return reply.code(statusCode).send({
    beleg_id: beleg.id,
    storage_key: beleg.file_object_key,
    status: beleg.status,
    ...(isDuplicate ? { is_duplicate: true } : {}),
  });
}
