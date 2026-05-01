/**
 * PUT /api/v1/plugins/:pluginId — Plugin aktualisieren (aktivieren/deaktivieren, URL aendern)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  webhook_url: z.string().url().optional(),
  webhook_secret: z.string().min(16).optional(),
  hook_events: z.array(z.string().min(1)).min(1).optional(),
  enabled: z.boolean().optional(),
});

export function buildUpdateHandler() {
  return async function updateHandler(
    req: FastifyRequest<{ Params: { pluginId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const input = parsed.data;
    const { pluginId } = req.params;
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    // Webhook-URL validieren wenn angegeben
    if (input.webhook_url) {
      const isLocalhost =
        input.webhook_url.includes('localhost') ||
        input.webhook_url.includes('127.0.0.1');
      const isHttps = input.webhook_url.startsWith('https://');
      if (!isHttps && !isLocalhost) {
        return reply.code(422).send(
          apiError(
            'WEBHOOK_URL_INVALID',
            'Webhook-URL muss HTTPS verwenden (außer localhost in Entwicklung)',
          ),
        );
      }
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

      // Dynamisches UPDATE aufbauen
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (input.name !== undefined) {
        updates.push(`name = $${idx++}`);
        params.push(input.name);
      }
      if (input.description !== undefined) {
        updates.push(`description = $${idx++}`);
        params.push(input.description);
      }
      if (input.webhook_url !== undefined) {
        updates.push(`webhook_url = $${idx++}`);
        params.push(input.webhook_url);
      }
      if (input.webhook_secret !== undefined) {
        updates.push(`webhook_secret = $${idx++}`);
        params.push(input.webhook_secret);
      }
      if (input.hook_events !== undefined) {
        updates.push(`hook_events = $${idx++}`);
        params.push(input.hook_events);
      }
      if (input.enabled !== undefined) {
        updates.push(`enabled = $${idx++}`);
        params.push(input.enabled);
      }

      if (updates.length === 0) {
        return reply.code(422).send(
          apiError('NO_CHANGES', 'Keine Felder zum Aktualisieren angegeben'),
        );
      }

      updates.push(`updated_at = now()`);
      params.push(pluginId);

      const { rows } = await db.query(
        `UPDATE plugin_registry
            SET ${updates.join(', ')}
          WHERE plugin_id = $${idx}
          RETURNING plugin_id, name, version, description, webhook_url,
                    hook_events, enabled, created_at, updated_at`,
        params,
      );

      logger.info({ plugin_id: pluginId, tenant_id: tenantId }, 'Plugin aktualisiert');

      return reply.send(apiOk(rows[0]));
    } catch (err) {
      logger.error({ err, pluginId, tenantId }, 'Plugin-Update fehlgeschlagen');
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'Plugin konnte nicht aktualisiert werden'),
      );
    }
  };
}
