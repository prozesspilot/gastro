/**
 * D5 — Customer-Routen
 *
 * Endpunkte:
 *   POST   /api/v1/customers           Kunden anlegen
 *   GET    /api/v1/customers           Kunden auflisten (paginiert)
 *   GET    /api/v1/customers/:id       Einzelnen Kunden laden
 *   PATCH  /api/v1/customers/:id       Kunden aktualisieren
 *   DELETE /api/v1/customers/:id       Kunden (soft) löschen
 *
 * Alle Routen erfordern den Header x-pp-tenant-id (UUID).
 */

import type { FastifyInstance } from 'fastify';
import { requireTenantId } from '../../core/auth/m14-tenant-context';
import { publishCustomerEvent } from '../../core/events/publisher';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { apiError, apiOk, apiOkPaged, zodToApiError } from '../../core/schemas/common';
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '../../core/schemas/customer';
import {
  createCustomer,
  findCustomerById,
  listCustomers,
  softDeleteCustomer,
  updateCustomer,
} from './customer.repository';

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  // Tenant-Kontext für alle Routen in diesem Plugin setzen
  app.addHook('preHandler', tenantContextHook);

  // ── POST /customers ────────────────────────────────────────────────────

  app.post('/', async (req, reply) => {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    try {
      const customer = await createCustomer(app.db, requireTenantId(req), parsed.data);
      // Event best-effort — darf Route nicht blockieren
      void publishCustomerEvent(app.redis, 'customer.created', requireTenantId(req), {
        customer_id: customer.id,
        external_id: customer.external_id,
      });
      return reply.code(201).send(apiOk(customer));
    } catch (err: unknown) {
      // Unique-Constraint: (tenant_id, external_id)
      if (isUniqueViolation(err)) {
        return reply
          .code(409)
          .send(
            apiError(
              'DUPLICATE_EXTERNAL_ID',
              'Ein Kunde mit dieser externen ID existiert bereits.',
            ),
          );
      }
      throw err;
    }
  });

  // ── GET /customers ─────────────────────────────────────────────────────

  app.get('/', async (req, reply) => {
    const parsed = listCustomersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const { data, pagination } = await listCustomers(app.db, requireTenantId(req), parsed.data);
    return reply.send(apiOkPaged(data, pagination));
  });

  // ── GET /customers/:id ─────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const customer = await findCustomerById(app.db, requireTenantId(req), req.params.id);

    if (!customer) {
      return reply.code(404).send(apiError('NOT_FOUND', `Kunde ${req.params.id} nicht gefunden.`));
    }

    return reply.send(apiOk(customer));
  });

  // ── PATCH /customers/:id ───────────────────────────────────────────────

  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const customer = await updateCustomer(app.db, requireTenantId(req), req.params.id, parsed.data);

    if (!customer) {
      return reply.code(404).send(apiError('NOT_FOUND', `Kunde ${req.params.id} nicht gefunden.`));
    }

    void publishCustomerEvent(app.redis, 'customer.updated', requireTenantId(req), {
      customer_id: customer.id,
      external_id: customer.external_id,
    });
    return reply.send(apiOk(customer));
  });

  // ── DELETE /customers/:id ──────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const deleted = await softDeleteCustomer(app.db, requireTenantId(req), req.params.id);

    if (!deleted) {
      return reply.code(404).send(apiError('NOT_FOUND', `Kunde ${req.params.id} nicht gefunden.`));
    }

    void publishCustomerEvent(app.redis, 'customer.soft_deleted', requireTenantId(req), {
      customer_id: req.params.id,
    });
    return reply.code(204).send();
  });
}

// ── Hilfsfunktion ──────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}
