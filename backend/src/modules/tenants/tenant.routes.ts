/**
 * Tenant-Routen
 *
 * Endpunkte:
 *   POST   /api/v1/tenants        Mandanten anlegen
 *   GET    /api/v1/tenants        Mandanten auflisten (paginiert)
 *   GET    /api/v1/tenants/:id    Einzelnen Mandanten laden
 *   PATCH  /api/v1/tenants/:id    Mandanten aktualisieren
 *
 * Kein x-pp-tenant-id-Header erforderlich — Tenants sind Top-Level.
 */

import type { FastifyInstance } from 'fastify';
import {
  apiError,
  apiOk,
  apiOkPaged,
  paginationQuerySchema,
  zodToApiError,
} from '../../core/schemas/common';
import { createTenantSchema, updateTenantSchema } from '../../core/schemas/tenant';
import { createTenant, findTenantById, listTenants, updateTenant } from './tenant.repository';

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /tenants ──────────────────────────────────────────────────────────

  app.post('/', async (req, reply) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    try {
      const tenant = await createTenant(app.db, parsed.data);
      return reply.code(201).send(apiOk(tenant));
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        return reply
          .code(409)
          .send(apiError('DUPLICATE_SLUG', 'Ein Mandant mit diesem Slug existiert bereits.'));
      }
      throw err;
    }
  });

  // ── GET /tenants ───────────────────────────────────────────────────────────

  app.get('/', async (req, reply) => {
    const base = paginationQuerySchema.safeParse(req.query);
    if (!base.success) {
      return reply.code(422).send(zodToApiError(base.error));
    }

    const { data, pagination } = await listTenants(app.db, base.data);
    return reply.send(apiOkPaged(data, pagination));
  });

  // ── GET /tenants/:id ───────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const tenant = await findTenantById(app.db, req.params.id);
    if (!tenant) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Mandant ${req.params.id} nicht gefunden.`));
    }
    return reply.send(apiOk(tenant));
  });

  // ── PATCH /tenants/:id ─────────────────────────────────────────────────────

  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const tenant = await updateTenant(app.db, req.params.id, parsed.data);
    if (!tenant) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Mandant ${req.params.id} nicht gefunden.`));
    }
    return reply.send(apiOk(tenant));
  });
}

// ── Hilfsfunktion ──────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}
