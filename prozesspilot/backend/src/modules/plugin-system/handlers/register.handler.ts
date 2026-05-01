/**
 * POST /api/v1/plugins — Plugin registrieren
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  webhook_url: z.string().url(),
  webhook_secret: z.string().min(16, 'Webhook-Secret muss mindestens 16 Zeichen haben'),
  hook_events: z.array(z.string().min(1)).min(1, 'Mindestens ein Hook-Event erforderlich'),
  version: z.string().optional().default('1.0.0'),
});

type RegisterInput = z.infer<typeof registerSchema>;

const ALLOWED_HOOK_EVENTS = [
  'after_categorization',
  'after_export',
  'after_archive',
  'before_extraction',
  'after_extraction',
  'before_categorization',
  'before_archive',
  'before_export.lexoffice',
  'after_export.lexoffice',
  'before_export.sevdesk',
  'after_export.sevdesk',
  'before_export.datev',
  'after_export.datev',
  'on_requires_review',
  'before_report.monthly',
  'after_report.monthly',
  'on_export_failed',
];

export function buildRegisterHandler() {
  return async function registerHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const input = parsed.data as RegisterInput;
    const db: Pool = req.server.db;

    // Tenant-ID aus Header
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;
    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    // Webhook-URL validieren: muss https:// sein (außer localhost in dev)
    const isLocalhost = input.webhook_url.includes('localhost') ||
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

    // Hook-Events validieren
    const invalidEvents = input.hook_events.filter(
      (e) => !ALLOWED_HOOK_EVENTS.includes(e),
    );
    if (invalidEvents.length > 0) {
      return reply.code(422).send(
        apiError('INVALID_HOOK_EVENTS', `Unbekannte Hook-Events: ${invalidEvents.join(', ')}`, {
          allowed: ALLOWED_HOOK_EVENTS,
        }),
      );
    }

    try {
      const { rows } = await db.query<{ plugin_id: string }>(
        `INSERT INTO plugin_registry
           (tenant_id, name, version, description, webhook_url, webhook_secret, hook_events)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING plugin_id`,
        [
          tenantId,
          input.name,
          input.version,
          input.description ?? null,
          input.webhook_url,
          input.webhook_secret,
          input.hook_events,
        ],
      );

      const plugin_id = rows[0]?.plugin_id;

      logger.info({ plugin_id, tenant_id: tenantId, name: input.name }, 'Plugin registriert');

      return reply.code(201).send(
        apiOk({
          plugin_id,
          name: input.name,
          version: input.version,
          hook_events: input.hook_events,
          enabled: true,
          created_at: new Date().toISOString(),
        }),
      );
    } catch (err) {
      logger.error({ err, tenantId }, 'Plugin-Registrierung fehlgeschlagen');
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'Plugin konnte nicht registriert werden'),
      );
    }
  };
}
