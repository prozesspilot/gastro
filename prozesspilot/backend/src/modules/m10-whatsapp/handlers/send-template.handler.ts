/**
 * M10 — POST /api/v1/internal/whatsapp/send-template
 *
 * Sendet ein WhatsApp-Template an einen Empfänger.
 *
 * Erlaubte Templates:
 *   - confirmation_received_de   (Beleg eingegangen ✓)
 *   - sender_not_registered      (Hint, wenn Sender nicht in allowed_senders)
 *
 * Response 200:
 *   { ok:true, data:{ message_id: 'wamid...' } }
 *
 * Spec-Referenz: M10 §5.3, §7.4
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { sendTemplateInputSchema } from '../schemas/send-template.input';
import { writeAudit } from '../services/audit.service';
import { CredentialNotFoundError, loadWaCredential } from '../services/credential.service';
import {
  type MetaGraphClient,
  MetaGraphError,
  defaultMetaGraphClient,
} from '../services/meta-graph.client';

export interface SendTemplateHandlerDeps {
  metaClient?: MetaGraphClient;
}

export function buildSendTemplateHandler(deps: SendTemplateHandlerDeps = {}) {
  return async function sendTemplateHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = sendTemplateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id, to, template_name, language } = parsed.data;
    const metaClient = deps.metaClient ?? defaultMetaGraphClient;

    try {
      const cred = await loadWaCredential(req.server.db, customer_id);
      if (!cred.phoneNumberId) {
        return reply
          .code(400)
          .send(apiError('VALIDATION_ERROR', 'phone_number_id fehlt im credential meta.'));
      }

      const res = await metaClient.sendTemplateMessage(
        cred.phoneNumberId,
        to,
        template_name,
        cred.accessToken,
        language,
      );

      void writeAudit(req.server.db, {
        customerId: customer_id,
        eventType: 'whatsapp.template.sent',
        payload: { to, template_name, message_id: res.message_id },
        traceId: req.headers['x-trace-id'] as string | undefined,
      });

      return reply.send(apiOk({ message_id: res.message_id }));
    } catch (err) {
      if (err instanceof CredentialNotFoundError) {
        return reply
          .code(404)
          .send(apiError('CREDENTIAL_NOT_FOUND', 'Kein WhatsApp-Access-Token für diesen Kunden.'));
      }
      if (err instanceof MetaGraphError) {
        const code = err.status >= 500 ? 'EXTERNAL_API_FAILED' : 'EXTERNAL_API_4XX';
        logger.warn({ status: err.status, body: err.body }, 'Meta-Graph-Fehler bei sendTemplate');
        return reply.code(502).send(apiError(code, err.message));
      }
      throw err;
    }
  };
}
