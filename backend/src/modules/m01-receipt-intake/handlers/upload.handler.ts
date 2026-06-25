/**
 * M01 — Upload Handler
 *
 * POST /api/v1/belege/upload
 *
 * Staff-Upload eines Belegs. Auth/Tenant/Rolle prüft dieser Handler; die geprüfte
 * Upload-Pipeline (Magic-Bytes, SHA256-Dedup/Undelete, MinIO, insertBeleg,
 * OCR-Enqueue) liegt seit T070 im geteilten `processBelegUpload`-Service und wird
 * auch vom Web-Chat-Eingang (Wirt) genutzt.
 *
 * Sicherheit:
 *   - Auth: M14-JWT-Cookie (pp_auth)  →  m14StaffAuthHook
 *   - Tenant-Context: X-PP-Tenant-ID Header  →  m14TenantContextHook
 *   - Rolle 'support' darf NICHT uploaden (Beleg-Upload ist nicht ihr Job)
 *   - Tenant-Existenz-Check VOR Multipart-Parse (spart Bandbreite, M3)
 *
 * TODO bei >50 req/min auf Stream-Upload umstellen. Pilot-Limit: 1 Tenant,
 * 100 Belege/Monat — Buffer-in-Memory ist für diesen Rahmen korrekt.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { tenantExists } from '../../tenants/tenant.repository';
import { processBelegUpload } from '../services/beleg-upload.service';

export async function uploadHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  const tenantId = req.tenantId;

  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  // support kann Belege lesen (GET), aber nicht hochladen (POST).
  if (staff.role === 'support') {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Support-Rolle hat keinen Zugriff auf Beleg-Upload.',
    });
  }
  // M3: Tenant-Existenz prüfen VOR Multipart-Parse.
  if (!(await tenantExists(req.server.db, tenantId))) {
    return reply.code(404).send({ error: 'tenant_not_found', message: 'Tenant nicht gefunden.' });
  }

  const file = await req.file();
  if (!file) {
    return reply.code(400).send({
      error: 'no_file',
      message: 'Keine Datei im Multipart-Body gefunden.',
    });
  }
  const fileBuffer = await file.toBuffer();

  const result = await processBelegUpload(
    { db: req.server.db, s3: req.server.s3, logger: req.log },
    {
      tenantId,
      sourceChannel: 'manual_upload',
      fileBuffer,
      filename: file.filename || '',
      uploadedByUserId: staff.userId,
    },
  );

  if (!result.ok) {
    return reply.code(result.code).send(result.body);
  }

  const { beleg, isDuplicate, isUndeleted } = result;
  const statusCode = isDuplicate || isUndeleted ? 200 : 201;
  return reply.code(statusCode).send({
    beleg_id: beleg.id,
    storage_key: beleg.file_object_key,
    status: beleg.status,
    ...(isUndeleted ? { is_undeleted: true } : {}),
    ...(isDuplicate ? { is_duplicate: true } : {}),
  });
}
