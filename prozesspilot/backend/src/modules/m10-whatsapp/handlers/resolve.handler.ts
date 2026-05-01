/**
 * M10 — POST /api/v1/internal/whatsapp/resolve
 *
 * Mapped (phone_number_id, from) → customer_id + allowed-Flag.
 *
 * Response 200 (allowed):
 *   { ok:true, data:{ customer_id, allowed:true,  sender:{name,role} } }
 * Response 200 (not whitelisted):
 *   { ok:true, data:{ customer_id, allowed:false, reason:'sender_not_whitelisted' } }
 * Response 404:
 *   { ok:false, error:{ code:'CUSTOMER_NOT_FOUND' } }
 *
 * Spec-Referenz: M10 §7.2
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { resolveInputSchema } from '../schemas/resolve.input';
import {
  CustomerNotFoundError,
  resolveCustomer,
} from '../services/customer-resolver';
import { writeAudit } from '../services/audit.service';

export async function resolveHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = resolveInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(422).send(zodToApiError(parsed.error));
  }
  const { phone_number_id, from } = parsed.data;

  try {
    const result = await resolveCustomer(req.server.db, phone_number_id, from);

    if (!result.allowed) {
      // Audit: nicht-whitelisted Sender (Best-Effort)
      void writeAudit(req.server.db, {
        customerId: result.customerId,
        eventType:  'whatsapp.sender.rejected',
        payload:    { from, phone_number_id, reason: result.reason },
        traceId:    req.headers['x-trace-id'] as string | undefined,
      });

      return reply.send(
        apiOk({
          customer_id: result.customerId,
          allowed:     false,
          reason:      result.reason,
        }),
      );
    }

    return reply.send(
      apiOk({
        customer_id: result.customerId,
        allowed:     true,
        sender: {
          name: result.sender?.name,
          role: result.sender?.role,
        },
      }),
    );
  } catch (err) {
    if (err instanceof CustomerNotFoundError) {
      return reply.code(404).send(
        apiError('CUSTOMER_NOT_FOUND', `Kein Kunde für phone_number_id=${phone_number_id}.`),
      );
    }
    throw err;
  }
}
