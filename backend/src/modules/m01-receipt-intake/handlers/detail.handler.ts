/**
 * M01 — Detail Handler
 *
 * GET /api/v1/belege/:id
 *
 * Gibt einen einzelnen Beleg zurück inkl. Signed-Download-URL (15 Min TTL).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getM14Staff } from '../../../core/auth/m14-staff-auth';
import { config } from '../../../core/config';
import { getPresignedDownloadUrl } from '../../../core/storage/storage.service';
import { getBelegById } from '../services/beleg.repository';

// ── Schemas ────────────────────────────────────────────────────────────────

const DetailParamsSchema = z.object({
  id: z.string().uuid({ message: 'id muss eine gültige UUID sein' }),
});

const TenantHeaderSchema = z.object({
  'x-pp-tenant-id': z.string().uuid({ message: 'X-PP-Tenant-ID muss eine gültige UUID sein' }),
});

// ── Handler ────────────────────────────────────────────────────────────────

export async function detailHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // 1. Auth-Check
  const staff = getM14Staff(req);
  if (!staff) {
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'M14-JWT-Authentifizierung erforderlich.',
    });
  }

  // 2. Tenant-Context
  const headerParse = TenantHeaderSchema.safeParse(req.headers);
  if (!headerParse.success) {
    return reply.code(400).send({
      error: 'missing_tenant',
      message: 'X-PP-Tenant-ID Header fehlt oder ist keine gültige UUID.',
    });
  }
  const tenantId = headerParse.data['x-pp-tenant-id'];

  // 3. Path-Params validieren
  const paramsParse = DetailParamsSchema.safeParse(req.params);
  if (!paramsParse.success) {
    return reply.code(400).send({
      error: 'invalid_params',
      message: paramsParse.error.errors[0]?.message ?? 'Ungültige Params',
    });
  }
  const { id } = paramsParse.data;

  // 4. Beleg laden (Tenant-Isolation via WHERE tenant_id = $2)
  const beleg = await getBelegById(req.server.db, tenantId, id);
  if (!beleg) {
    return reply.code(404).send({
      error: 'not_found',
      message: 'Beleg nicht gefunden.',
    });
  }

  // 5. Signed Download-URL generieren (TTL aus Config, Default 15 Min)
  const s3Client = req.server.s3;
  if (!s3Client) {
    req.log.error({ beleg_id: id }, 'S3-Client nicht initialisiert');
    return reply
      .code(500)
      .send({ error: 'storage_not_configured', message: 'Storage nicht konfiguriert.' });
  }
  const ttlSeconds = config.SIGNED_URL_TTL_SECONDS;
  const downloadUrl = await getPresignedDownloadUrl(s3Client, beleg.file_object_key, ttlSeconds);
  const downloadExpiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  return reply.code(200).send({
    beleg,
    download_url: downloadUrl,
    download_expires_at: downloadExpiresAt,
  });
}
