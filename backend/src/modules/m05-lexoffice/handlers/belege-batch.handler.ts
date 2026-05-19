/**
 * T009/M05 — POST /api/v1/exports/lexware/batch
 *
 * Pushes alle noch nicht exportierten Belege eines Tenants. Sequentiell —
 * Lexoffice rate-limited intern ja auch.
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook.
 * Rolle: nur geschaeftsfuehrer (Batch ist Operator-Aktion).
 *
 * Body (optional):
 *   { limit?: number }  // max Anzahl pro Batch-Run, default 50
 *
 * Response:
 *   {
 *     pushed: number,
 *     skipped: number,
 *     failed: number,
 *     results: ExportBelegResult[]
 *   }
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exportBelegToLexware } from '../services/belege-lexware-exporter';
import { findBelegIdsPendingExport } from '../services/export-log.repository';

const bodySchema = z
  .object({
    limit: z.number().int().positive().max(500).optional(),
  })
  .partial()
  .optional();

export async function belegeBatchHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role !== 'geschaeftsfuehrer') {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Nur Geschaeftsfuehrer duerfen den Batch-Export ausloesen.',
    });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }
  const limit = parsed.data?.limit ?? 50;

  const s3 = req.server.s3;
  if (!s3) {
    return reply
      .code(500)
      .send({ error: 'storage_not_configured', message: 'S3-Client nicht initialisiert.' });
  }

  const candidates = await findBelegIdsPendingExport(
    req.server.db,
    tenantId,
    'lexware_office',
    limit,
  );
  if (candidates.length === 0) {
    return reply.send({ pushed: 0, skipped: 0, failed: 0, results: [] });
  }

  const results: Awaited<ReturnType<typeof exportBelegToLexware>>[] = [];
  for (const belegId of candidates) {
    try {
      const r = await exportBelegToLexware(tenantId, belegId, staff.userId, {
        pool: req.server.db,
        s3,
      });
      results.push(r);
    } catch (err) {
      req.log.error(
        { err: err instanceof Error ? err.message : String(err), belegId },
        '[lexware-batch] Export crashed unexpected',
      );
      results.push({
        beleg_id: belegId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'internal_error',
        attempts: 0,
      });
    }
  }

  const summary = {
    pushed: results.filter((r) => r.status === 'pushed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
  return reply.send(summary);
}
