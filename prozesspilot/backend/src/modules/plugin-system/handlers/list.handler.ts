/**
 * GET /api/v1/plugins — Alle Plugins des Tenants auflisten
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { apiError, apiOk } from '../../../core/schemas/common';

export function buildListHandler() {
  return async function listHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    try {
      const { rows } = await db.query(
        `SELECT plugin_id, tenant_id, name, version, description,
                webhook_url, hook_events, enabled, created_at, updated_at
           FROM plugin_registry
          WHERE tenant_id = $1
          ORDER BY created_at DESC`,
        [tenantId],
      );

      return reply.send(apiOk({ plugins: rows, count: rows.length }));
    } catch (err) {
      logger.error({ err, tenantId }, 'Plugin-Liste konnte nicht geladen werden');
      return reply
        .code(500)
        .send(apiError('INTERNAL_ERROR', 'Plugin-Liste konnte nicht geladen werden'));
    }
  };
}
