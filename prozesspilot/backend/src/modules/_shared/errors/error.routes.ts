/**
 * Error-Log-API.
 *
 * Endpoints (registriert mit prefix /errors → /api/v1/errors):
 *   POST /errors                  — Error-Eintrag anlegen (vom WF-ERROR-HANDLER)
 *   GET  /errors                  — Liste pro Customer (header x-customer-id)
 *   GET  /errors?receipt_id=...   — gefiltert auf Receipt
 *
 * Auth: HMAC-Middleware global (PP_AUTH_DISABLED=1 in Dev).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { insertError, listErrors } from './error.repository';

const errorInputSchema = z.object({
  customer_id: z.string().min(1),
  receipt_id: z.string().optional(),
  stage: z.string().optional(),
  error_type: z.string().optional(),
  error_message: z.string().min(1),
  stack_trace: z.string().optional(),
  trace_id: z.string().optional(),
});

const listQuerySchema = z.object({
  receipt_id: z.string().optional(),
  resolved: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function errorRoutes(app: FastifyInstance): Promise<void> {
  // POST /errors
  app.post('/', async (req, reply) => {
    const parsed = errorInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const row = await insertError(app.db, parsed.data);
    return reply.code(201).send(apiOk(row));
  });

  // GET /errors
  app.get('/', async (req, reply) => {
    const customerId = (req.headers['x-customer-id'] ?? '') as string;
    if (!customerId) {
      return reply.code(400).send(apiError('MISSING_CUSTOMER', 'Header x-customer-id fehlt'));
    }
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const rows = await listErrors(app.db, customerId, parsed.data);
    return reply.send(apiOk(rows));
  });
}
