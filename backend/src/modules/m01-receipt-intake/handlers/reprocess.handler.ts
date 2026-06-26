/**
 * T007/M01 — POST /api/v1/belege/:id/reprocess
 *
 * Reicht einen Beleg erneut in die OCR-Queue ein. Wird genutzt wenn:
 *   * der Beleg im Status 'error' liegt (manueller Re-Run nach Fix)
 *   * der Beleg im Status 'requires_review' liegt und der Operator
 *     korrigierte Daten will (z. B. nach Anpassung der Regex-Heuristik)
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook (geerbt von belege.routes.ts).
 * Rolle: 'support' darf reprocessen (read-only-Equivalent für Operator).
 *
 * jobId-Strategie (T079, ohne `:`): reason='reprocess' → `ocr-<belegId>-reprocess-<ts>`
 * (immer eindeutig, läuft auch wenn der vorherige Upload-Job noch gecached ist);
 * der Upload-Pfad nutzt `ocr-<belegId>` (deduped). Siehe buildOcrJobId.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { enqueueOcrJob } from '../../../core/queue/ocr-queue';
import { getBelegById } from '../services/beleg.repository';

interface ReprocessParams {
  id: string;
}

export async function reprocessHandler(
  req: FastifyRequest<{ Params: ReprocessParams }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;

  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }

  const { id: belegId } = req.params;

  // UUID-Format-Check (defensive — Fastify validiert :id Param nicht)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(belegId)) {
    return reply
      .code(400)
      .send({ error: 'invalid_id', message: 'Beleg-ID ist keine gültige UUID.' });
  }

  // Beleg laden — sicherstellen, dass er existiert und zum Tenant gehört
  const beleg = await getBelegById(req.server.db, tenantId, belegId);
  if (!beleg) {
    return reply.code(404).send({ error: 'not_found', message: 'Beleg nicht gefunden.' });
  }

  // Status-Check: nur sinnvoll wenn der Beleg nicht gerade in extracting ist
  if (beleg.status === 'extracting') {
    return reply.code(409).send({
      error: 'already_processing',
      message: 'Beleg wird gerade verarbeitet. Bitte warten.',
    });
  }

  await enqueueOcrJob({ tenantId, belegId, reason: 'reprocess' });

  return reply.code(202).send({
    beleg_id: belegId,
    status: beleg.status,
    queued: true,
    message: 'Reprocess-Job in Queue eingereicht.',
  });
}
