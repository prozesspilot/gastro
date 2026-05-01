/**
 * POST /api/v1/dsgvo/delete-request — Loeschantrag stellen (DSGVO Art. 17)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

const requestSchema = z.object({
  customer_id: z.string().optional(),
  reason: z.string().max(1000).optional(),
  requested_by: z.string().min(1, 'Anfragender muss angegeben werden'),
});

export function buildRequestDeletionHandler() {
  return async function requestDeletionHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const { customer_id, reason, requested_by } = parsed.data;
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    try {
      const { rows } = await db.query<{ request_id: string }>(
        `INSERT INTO deletion_requests
           (customer_id, tenant_id, requested_by, reason, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING request_id`,
        [customer_id ?? null, tenantId, requested_by, reason ?? null],
      );

      const request_id = rows[0]?.request_id;

      // Bestaetigungsmail nur loggen (kein SMTP in MVP)
      logger.info(
        {
          request_id,
          tenant_id: tenantId,
          customer_id: customer_id ?? 'ALLE',
          requested_by,
        },
        'DSGVO Loeschantrag erstellt — Bestaetigung wuerde per E-Mail gesendet werden (kein SMTP konfiguriert)',
      );

      return reply.code(201).send(
        apiOk({
          request_id,
          status: 'pending',
          message: 'Ihr Loeschantrag wurde eingereicht und wird innerhalb von 30 Tagen bearbeitet.',
          customer_id: customer_id ?? null,
          tenant_id: tenantId,
          created_at: new Date().toISOString(),
        }),
      );
    } catch (err) {
      logger.error({ err, tenantId }, 'Loeschantrag konnte nicht erstellt werden');
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'Loeschantrag konnte nicht erstellt werden'),
      );
    }
  };
}
