/**
 * M01 — List Handler
 *
 * GET /api/v1/belege?page=1&page_size=50&status=received
 *
 * Liefert eine paginierte Liste von Belegen für den angegebenen Tenant.
 * Sortierung: received_at DESC.
 *
 * M7: Auth + Tenant-Context werden von Hooks in belege.routes.ts gesetzt.
 *   req.m14Staff und req.tenantId sind hier bereits verfügbar.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { type BelegStatus, listBelege } from '../services/beleg.repository';

// ── Schemas ────────────────────────────────────────────────────────────────

const BelegStatusEnum = z.enum([
  'received',
  'extracting',
  'extracted',
  'categorizing',
  'categorized',
  'archiving',
  'archived',
  'exporting',
  'exported',
  'completed',
  'requires_review',
  'error',
]);

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
  status: BelegStatusEnum.optional(),
});

// ── Handler ────────────────────────────────────────────────────────────────

export async function listHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // M7: tenantId von m14TenantContextHook gesetzt; staff von m14StaffAuthHook gesetzt.
  // Beide Hooks laufen als preHandler in belege.routes.ts — hier immer vorhanden.
  // DECISION: Defensive Check statt Non-Null-Assertion — gibt 401 wenn Hook nicht gelaufen.
  const tenantId = req.tenantId;
  if (!tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Tenant-Context fehlt.' });
  }
  const _staff = (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff;

  // Query-Params validieren
  const queryParse = ListQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    return reply.code(400).send({
      error: 'invalid_query',
      message: queryParse.error.errors[0]?.message ?? 'Ungültige Query-Parameter',
    });
  }

  const { page, page_size, status } = queryParse.data;
  const offset = (page - 1) * page_size;

  // Belege aus DB holen (M8: Window-Function, kein payload im List-Result)
  const { belege, total } = await listBelege(req.server.db, tenantId, {
    limit: page_size,
    offset,
    status: status as BelegStatus | undefined,
  });

  const totalPages = Math.ceil(total / page_size);

  return reply.code(200).send({
    belege,
    pagination: {
      page,
      page_size,
      total,
      total_pages: totalPages,
    },
  });
}
