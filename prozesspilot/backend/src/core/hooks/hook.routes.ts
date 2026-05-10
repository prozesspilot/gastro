/**
 * Hook-CRUD-Routen.
 *
 * Konzept-konforme Welt-A-Variante: Hook-Definitionen sind kunden-scoped
 * (customer_id TEXT). Die Routen liegen auf /api/v1/hooks und erfordern
 * den `x-customer-id`-Header (analog zu allen anderen Welt-A-Endpoints).
 *
 * Endpoints:
 *   GET    /hooks                    — alle Hooks des Customers
 *   POST   /hooks                    — Hook anlegen
 *   GET    /hooks/:hookId            — einzelner Hook
 *   PUT    /hooks/:hookId            — Hook ändern (vollständiger Patch)
 *   DELETE /hooks/:hookId            — Hook löschen
 *   GET    /hooks/:hookId/executions — Letzte 50 Ausführungen
 *
 * HMAC-Auth wird global durch hmacMiddleware in app.ts erzwungen
 * (PP_AUTH_DISABLED=1 für Dev/Tests).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiError, apiOk, zodToApiError } from '../schemas/common';
import {
  createHook,
  deleteHook,
  findHookById,
  listExecutions,
  listHooks,
  updateHook,
} from './hook.repository';

const HOOK_POINTS = [
  'before_extraction',
  'after_extraction',
  'before_categorization',
  'after_categorization',
  'before_archive',
  'after_archive',
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
] as const;

const IMPLEMENTATIONS = ['http_webhook', 'js_inline', 'plugin_id', 'disabled'] as const;

const createHookSchema = z.object({
  hook_point: z.enum(HOOK_POINTS),
  implementation: z.enum(IMPLEMENTATIONS),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
});

const updateHookSchema = createHookSchema.partial();

function readCustomerId(req: { headers: Record<string, string | string[] | undefined> }):
  | string
  | null {
  const v = req.headers['x-customer-id'];
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

export async function hookRoutes(app: FastifyInstance): Promise<void> {
  // GET /hooks
  app.get('/', async (req, reply) => {
    const customerId = readCustomerId(req);
    if (!customerId) {
      return reply.code(400).send(apiError('MISSING_CUSTOMER', 'Header x-customer-id fehlt'));
    }
    const hooks = await listHooks(app.db, customerId);
    return reply.send(apiOk(hooks));
  });

  // POST /hooks
  app.post('/', async (req, reply) => {
    const customerId = readCustomerId(req);
    if (!customerId) {
      return reply.code(400).send(apiError('MISSING_CUSTOMER', 'Header x-customer-id fehlt'));
    }
    const parsed = createHookSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const hook = await createHook(app.db, {
      customer_id: customerId,
      hook_point: parsed.data.hook_point,
      implementation: parsed.data.implementation,
      config: parsed.data.config,
      enabled: parsed.data.enabled,
      priority: parsed.data.priority,
    });
    return reply.code(201).send(apiOk(hook));
  });

  // GET /hooks/:hookId
  app.get<{ Params: { hookId: string } }>('/:hookId', async (req, reply) => {
    const customerId = readCustomerId(req);
    if (!customerId) {
      return reply.code(400).send(apiError('MISSING_CUSTOMER', 'Header x-customer-id fehlt'));
    }
    const hook = await findHookById(app.db, customerId, req.params.hookId);
    if (!hook) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Hook ${req.params.hookId} nicht gefunden.`));
    }
    return reply.send(apiOk(hook));
  });

  // PUT /hooks/:hookId
  app.put<{ Params: { hookId: string } }>('/:hookId', async (req, reply) => {
    const customerId = readCustomerId(req);
    if (!customerId) {
      return reply.code(400).send(apiError('MISSING_CUSTOMER', 'Header x-customer-id fehlt'));
    }
    const parsed = updateHookSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const updated = await updateHook(app.db, customerId, req.params.hookId, parsed.data);
    if (!updated) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Hook ${req.params.hookId} nicht gefunden.`));
    }
    return reply.send(apiOk(updated));
  });

  // DELETE /hooks/:hookId
  app.delete<{ Params: { hookId: string } }>('/:hookId', async (req, reply) => {
    const customerId = readCustomerId(req);
    if (!customerId) {
      return reply.code(400).send(apiError('MISSING_CUSTOMER', 'Header x-customer-id fehlt'));
    }
    const ok = await deleteHook(app.db, customerId, req.params.hookId);
    if (!ok) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Hook ${req.params.hookId} nicht gefunden.`));
    }
    return reply.send(apiOk({ deleted: true }));
  });

  // GET /hooks/:hookId/executions
  app.get<{ Params: { hookId: string } }>('/:hookId/executions', async (req, reply) => {
    const customerId = readCustomerId(req);
    if (!customerId) {
      return reply.code(400).send(apiError('MISSING_CUSTOMER', 'Header x-customer-id fehlt'));
    }
    const hook = await findHookById(app.db, customerId, req.params.hookId);
    if (!hook) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Hook ${req.params.hookId} nicht gefunden.`));
    }
    const rows = await listExecutions(app.db, customerId, req.params.hookId, 50);
    return reply.send(apiOk(rows));
  });
}
