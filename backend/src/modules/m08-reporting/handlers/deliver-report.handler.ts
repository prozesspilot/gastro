/**
 * T089/M08 — POST /api/v1/reports/:id/deliver
 *
 * Stellt einen bereits gebauten Monats-Report (T087) per Mail an den
 * Steuerberater des Tenants zu (PDF-Anhang).
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook. Rolle `support` → 403 (read-only).
 * Pfad: :id = Report-UUID.
 *
 * Status-Mapping:
 *   200 sent (inkl. Dry-Run ohne SMTP) · 400 ungültige ID · 403 support
 *   404 Report nicht gefunden / PDF fehlt · 422 kein Steuerberater hinterlegt
 *   502 SMTP-Versand fehlgeschlagen (Delivery als 'failed' protokolliert)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { deliverReport } from '../services/handover-mail.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deliverReportHandler(
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
      .send({ error: 'forbidden', message: 'Support-Rolle darf keine Reports versenden.' });
  }

  const reportId = req.params.id;
  if (!UUID_RE.test(reportId)) {
    return reply
      .code(400)
      .send({ error: 'invalid_id', message: 'Report-ID ist keine gültige UUID.' });
  }

  const s3 = req.server.s3;
  if (!s3) {
    return reply
      .code(500)
      .send({ error: 'storage_not_configured', message: 'S3-Client nicht initialisiert.' });
  }

  const result = await deliverReport({ db: req.server.db, s3 }, tenantId, reportId, {
    actor: { type: 'staff', id: staff.userId },
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'report_not_found':
        return reply
          .code(404)
          .send({ error: 'report_not_found', message: 'Report nicht gefunden.' });
      case 'pdf_missing':
        return reply
          .code(404)
          .send({ error: 'pdf_missing', message: 'Report-PDF nicht im Speicher gefunden.' });
      case 'no_recipient':
        return reply.code(422).send({
          error: 'no_recipient',
          message: 'Für diesen Mandanten ist keine Steuerberater-Mail hinterlegt.',
        });
      case 'send_failed':
        return reply.code(502).send({
          error: 'send_failed',
          message: 'Mail-Versand fehlgeschlagen.',
          delivery_id: result.deliveryId,
        });
    }
  }

  return reply.code(200).send({
    delivery_id: result.deliveryId,
    status: 'sent',
    dry_run: result.dryRun,
    ...(result.messageId ? { message_id: result.messageId } : {}),
  });
}
