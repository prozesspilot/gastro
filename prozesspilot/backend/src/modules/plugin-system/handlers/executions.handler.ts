/**
 * GET /api/v1/plugins/:pluginId/executions — Ausfuehrungshistorie eines Plugins
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { apiError, apiOk } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

export function buildExecutionsHandler() {
  return async function executionsHandler(
    req: FastifyRequest<{
      Params: { pluginId: string };
      Querystring: { limit?: string; offset?: string };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { pluginId } = req.params;
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;
    const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
    const offset = parseInt(req.query.offset ?? '0', 10);

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    try {
      // Prüfen ob Plugin dem Tenant gehört
      const { rows: existing } = await db.query(
        `SELECT plugin_id FROM plugin_registry WHERE plugin_id = $1 AND tenant_id = $2`,
        [pluginId, tenantId],
      );

      if (existing.length === 0) {
        return reply.code(404).send(
          apiError('NOT_FOUND', `Plugin ${pluginId} nicht gefunden`),
        );
      }

      const { rows } = await db.query(
        `SELECT execution_id, plugin_id, hook_event, receipt_id,
                response_status, response_body, duration_ms, success, error_message, executed_at
           FROM plugin_executions
          WHERE plugin_id = $1
          ORDER BY executed_at DESC
          LIMIT $2 OFFSET $3`,
        [pluginId, limit, offset],
      );

      const { rows: countRows } = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM plugin_executions WHERE plugin_id = $1`,
        [pluginId],
      );

      return reply.send(
        apiOk({
          executions: rows,
          count: rows.length,
          total: parseInt(countRows[0]?.count ?? '0', 10),
          limit,
          offset,
        }),
      );
    } catch (err) {
      logger.error({ err, pluginId, tenantId }, 'Plugin-Executions laden fehlgeschlagen');
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'Ausfuehrungshistorie konnte nicht geladen werden'),
      );
    }
  };
}
