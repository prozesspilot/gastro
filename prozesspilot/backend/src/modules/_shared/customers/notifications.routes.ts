/**
 * Operator-Notifications-Stub.
 *
 * Wird vom WF-ERROR-HANDLER aufgerufen, wenn ein Workflow scheitert.
 * Aktuell: nur logger.warn + audit_log-Eintrag. Phase 2: SMTP/Slack-Adapter.
 *
 * POST /api/v1/internal/notifications/operator
 *   Body: { channel, subject, workflow?, node?, error?, execution_id? }
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

const SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const operatorNotifSchema = z.object({
  channel: z.enum(['email', 'slack', 'log']).default('log'),
  subject: z.string().min(1),
  workflow: z.string().optional(),
  node: z.string().optional(),
  error: z.unknown().optional(),
  execution_id: z.string().optional(),
  receipt_id: z.string().optional(),
  trace_id: z.string().optional(),
});

export async function operatorNotificationsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/notifications/operator', async (req, reply) => {
    const parsed = operatorNotifSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    logger.warn(parsed.data, 'Operator-Notification (STUB)');
    try {
      await app.db.query(
        `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          SENTINEL_TENANT_ID,
          'operator',
          'operator.notification',
          parsed.data.workflow ?? 'unknown',
          JSON.stringify(parsed.data),
        ],
      );
    } catch (err) {
      logger.warn({ err }, 'Operator-Notification konnte nicht persistiert werden');
      return reply.code(202).send(apiError('PARTIAL_SUCCESS', 'Loggt, aber audit_log fehlgeschlagen.'));
    }
    return reply.send(apiOk({ delivered: 'log' }));
  });
}
