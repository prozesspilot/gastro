/**
 * M01 — List Handler
 *
 * GET /api/v1/belege?page=1&page_size=50&status=received
 *
 * Liefert eine paginierte Liste von Belegen für den angegebenen Tenant.
 * Sortierung: received_at DESC.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getM14Staff } from '../../../core/auth/m14-staff-auth';
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

const TenantHeaderSchema = z.object({
  'x-pp-tenant-id': z.string().uuid({ message: 'X-PP-Tenant-ID muss eine gültige UUID sein' }),
});

// ── Handler ────────────────────────────────────────────────────────────────

export async function listHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
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

  // 3. Query-Params validieren
  const queryParse = ListQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    return reply.code(400).send({
      error: 'invalid_query',
      message: queryParse.error.errors[0]?.message ?? 'Ungültige Query-Parameter',
    });
  }

  const { page, page_size, status } = queryParse.data;
  const offset = (page - 1) * page_size;

  // 4. Belege aus DB holen
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
