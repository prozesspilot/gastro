/**
 * T009/M05 — POST /api/v1/belege/:id/exports/lexware
 *
 * Pushes einen Beleg an Lexware Office. Idempotent: wenn schon gepusht,
 * 200 mit `status: 'skipped'` und existing external_id.
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook.
 * Rolle: mitarbeiter+ (kein support — support darf nur lesen).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { exportBelegToLexware } from '../services/belege-lexware-exporter';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function belegePushHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role === 'support') {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Support-Rolle darf keine Exporte ausloesen.' });
  }

  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return reply
      .code(400)
      .send({ error: 'invalid_id', message: 'Beleg-ID ist keine gueltige UUID.' });
  }

  const s3 = req.server.s3;
  if (!s3) {
    return reply
      .code(500)
      .send({ error: 'storage_not_configured', message: 'S3-Client nicht initialisiert.' });
  }

  const result = await exportBelegToLexware(tenantId, id, staff.userId, {
    pool: req.server.db,
    s3,
  });

  // Bei 'failed' geben wir 502 zurueck (kommunizierter externer Fehler),
  // sonst 200/202.
  if (result.status === 'failed') {
    return reply.code(502).send({
      error: 'export_failed',
      beleg_id: id,
      message: result.error ?? 'Export fehlgeschlagen.',
      attempts: result.attempts,
    });
  }

  return reply.send(result);
}
