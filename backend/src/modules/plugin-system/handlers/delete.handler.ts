/**
 * DELETE /api/v1/plugins/:pluginId — Plugin loeschen
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { apiError, apiOk } from '../../../core/schemas/common';

export function buildDeleteHandler() {
  return async function deleteHandler(
    req: FastifyRequest<{ Params: { pluginId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { pluginId } = req.params;
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    try {
      // Prüfen ob Plugin dem Tenant gehört
      const { rows: existing } = await db.query(
        'SELECT plugin_id FROM plugin_registry WHERE plugin_id = $1 AND tenant_id = $2',
        [pluginId, tenantId],
      );

      if (existing.length === 0) {
        return reply.code(404).send(apiError('NOT_FOUND', `Plugin ${pluginId} nicht gefunden`));
      }

      // Ausfuehrungs-Historie loeschen (FK-Constraint)
      await db.query('DELETE FROM plugin_executions WHERE plugin_id = $1', [pluginId]);

      // Plugin loeschen
      await db.query('DELETE FROM plugin_registry WHERE plugin_id = $1', [pluginId]);

      logger.info({ plugin_id: pluginId, tenant_id: tenantId }, 'Plugin geloescht');

      return reply.send(apiOk({ deleted: true, plugin_id: pluginId }));
    } catch (err) {
      logger.error({ err, pluginId, tenantId }, 'Plugin-Loeschung fehlgeschlagen');
      return reply
        .code(500)
        .send(apiError('INTERNAL_ERROR', 'Plugin konnte nicht geloescht werden'));
    }
  };
}
