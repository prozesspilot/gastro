/**
 * M01 — Detail Handler
 *
 * GET /api/v1/belege/:id
 *
 * Gibt einen einzelnen Beleg zurück inkl. Signed-Download-URL (15 Min TTL).
 *
 * M7: Auth + Tenant-Context werden von Hooks in belege.routes.ts gesetzt.
 *   req.m14Staff und req.tenantId sind hier bereits verfügbar.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { config } from '../../../core/config';
import { getPresignedDownloadUrl } from '../../../core/storage/storage.service';
import { getBelegById } from '../services/beleg.repository';

// ── Schemas ────────────────────────────────────────────────────────────────

const DetailParamsSchema = z.object({
  id: z.string().uuid({ message: 'id muss eine gültige UUID sein' }),
});

// ── Handler ────────────────────────────────────────────────────────────────

export async function detailHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // M7: tenantId von m14TenantContextHook gesetzt; staff von m14StaffAuthHook gesetzt.
  // Beide Hooks laufen als preHandler in belege.routes.ts — hier immer vorhanden.
  // DECISION: Defensive Check statt Non-Null-Assertion — gibt 401 wenn Hook nicht gelaufen.
  const tenantId = req.tenantId;
  if (!tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Tenant-Context fehlt.' });
  }
  const _staff = (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff;

  // Path-Params validieren
  const paramsParse = DetailParamsSchema.safeParse(req.params);
  if (!paramsParse.success) {
    return reply.code(400).send({
      error: 'invalid_params',
      message: paramsParse.error.errors[0]?.message ?? 'Ungültige Params',
    });
  }
  const { id } = paramsParse.data;

  // Beleg laden (Tenant-Isolation via WHERE tenant_id = $2 + RLS)
  const beleg = await getBelegById(req.server.db, tenantId, id);
  if (!beleg) {
    return reply.code(404).send({
      error: 'not_found',
      message: 'Beleg nicht gefunden.',
    });
  }

  // Signed Download-URL generieren (TTL aus Config, Default 15 Min)
  const s3Client = req.server.s3;
  if (!s3Client) {
    req.log.error({ beleg_id: id }, '[m01] S3-Client nicht initialisiert');
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
