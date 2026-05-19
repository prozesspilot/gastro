/**
 * T010/M12 — GET /api/v1/dsgvo/auskunft/:id
 *
 * Status-Check fuer einen Auskunfts-Antrag. Wenn 'ready', liefert Signed-URL
 * fuer das ZIP zurueck (gleiche URL, die per Mail an Subject ging).
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook.
 * Rolle: alle Mitarbeiter-Rollen duerfen Status lesen.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../../core/config';
import { getPresignedDownloadUrl } from '../../../core/storage/storage.service';
import { getDsgvoRequestById } from '../services/dsgvo-request.repository';

interface StatusParams {
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function auskunftStatusHandler(
  req: FastifyRequest<{ Params: StatusParams }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return reply
      .code(400)
      .send({ error: 'invalid_id', message: 'Request-ID ist keine gueltige UUID.' });
  }

  const request = await getDsgvoRequestById(req.server.db, tenantId, id);
  if (!request) {
    return reply.code(404).send({ error: 'not_found', message: 'Antrag nicht gefunden.' });
  }

  const body: Record<string, unknown> = {
    request_id: request.id,
    type: request.type,
    status: request.status,
    subject_email: request.subject_email,
    created_at: request.created_at,
    updated_at: request.updated_at,
    completed_at: request.completed_at,
    error_message: request.error_message,
  };

  // Bei status='ready' eine frische Signed-URL erzeugen (TTL: ENV DSGVO_EXPORT_TTL_DAYS)
  if (request.status === 'ready' && request.export_object_key) {
    const s3 = req.server.s3;
    if (s3) {
      try {
        body.download_url = await getPresignedDownloadUrl(
          s3,
          request.export_object_key,
          config.DSGVO_EXPORT_TTL_DAYS * 24 * 3600,
        );
        body.expires_at = request.expires_at;
      } catch (err) {
        req.log.warn(
          { err: err instanceof Error ? err.message : String(err), request_id: id },
          '[dsgvo-status] Signed-URL konnte nicht erzeugt werden',
        );
      }
    }
  }

  return reply.send(body);
}
