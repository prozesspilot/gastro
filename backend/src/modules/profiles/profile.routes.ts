/**
 * Customer-Profile-Routen
 *
 * Tenant-geschützte Endpunkte (verlangen x-pp-tenant-id):
 *   GET    /api/v1/customers/:customerId/profile
 *   PUT    /api/v1/customers/:customerId/profile   — vollständiges Speichern
 *   PATCH  /api/v1/customers/:customerId/profile   — flacher Merge
 *
 * Interne Routen (für n8n; KEIN tenantContextHook):
 *   GET    /api/v1/internal/profile/:customerId    — Profil + Stammdaten
 *
 * Hinweis zur Tenant-Isolation: Bei den /customers/:customerId/profile-Routen
 * laden wir den Customer über findCustomerById(tenantId, …); existiert er
 * nicht für diesen Tenant, antworten wir mit 404.
 */

import type { FastifyInstance } from 'fastify';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { apiError, apiOk, zodToApiError } from '../../core/schemas/common';
import { patchProfileSchema, upsertProfileSchema } from '../../core/schemas/profile';
import { findCustomerById } from '../customers/customer.repository';
import { getProfile, listProfileHistory, mergeProfile, upsertProfile } from './profile.repository';

// ── Tenant-geschützte Routen ──────────────────────────────────────────────

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', tenantContextHook);

  // ── GET /:customerId/profile ─────────────────────────────────────────
  app.get<{ Params: { customerId: string } }>('/:customerId/profile', async (req, reply) => {
    const customer = await findCustomerById(app.db, req.tenantId!, req.params.customerId);
    if (!customer) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Kunde ${req.params.customerId} nicht gefunden.`));
    }
    const profile = await getProfile(app.db, req.params.customerId);
    return reply.send(apiOk(profile));
  });

  // ── PUT /:customerId/profile ─────────────────────────────────────────
  app.put<{ Params: { customerId: string } }>('/:customerId/profile', async (req, reply) => {
    const parsed = upsertProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const customer = await findCustomerById(app.db, req.tenantId!, req.params.customerId);
    if (!customer) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Kunde ${req.params.customerId} nicht gefunden.`));
    }

    const profile = await upsertProfile(app.db, req.params.customerId, parsed.data);
    return reply.send(apiOk(profile));
  });

  // ── GET /:customerId/profile/history ────────────────────────────────
  app.get<{ Params: { customerId: string }; Querystring: { limit?: string } }>(
    '/:customerId/profile/history',
    async (req, reply) => {
      const customer = await findCustomerById(app.db, req.tenantId!, req.params.customerId);
      if (!customer) {
        return reply
          .code(404)
          .send(apiError('NOT_FOUND', `Kunde ${req.params.customerId} nicht gefunden.`));
      }
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 100);
      const entries = await listProfileHistory(app.db, req.params.customerId, limit);
      return reply.send(apiOk({ entries }));
    },
  );

  // ── PATCH /:customerId/profile ───────────────────────────────────────
  app.patch<{ Params: { customerId: string } }>('/:customerId/profile', async (req, reply) => {
    const parsed = patchProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const customer = await findCustomerById(app.db, req.tenantId!, req.params.customerId);
    if (!customer) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Kunde ${req.params.customerId} nicht gefunden.`));
    }

    const profile = await mergeProfile(app.db, req.params.customerId, parsed.data);
    return reply.send(apiOk(profile));
  });
}

// ── Interne Routen (n8n) ──────────────────────────────────────────────────

export async function internalProfileRoutes(app: FastifyInstance): Promise<void> {
  // Bewusst KEIN tenantContextHook — n8n hat keinen Tenant-Header,
  // greift aber bereits auf eine bekannte customerId zu.

  app.get<{ Params: { customerId: string } }>('/profile/:customerId', async (req, reply) => {
    const { customerId } = req.params;

    // Zugehörigen Tenant des Kunden ermitteln, dann mit dessen Kontext laden,
    // damit RLS-Policies auf customers greifen.
    const { rows } = await app.db.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM customers WHERE id = $1',
      [customerId],
    );
    const tenantId = rows[0]?.tenant_id;
    if (!tenantId) {
      return reply.code(404).send(apiError('NOT_FOUND', `Kunde ${customerId} nicht gefunden.`));
    }

    const customer = await findCustomerById(app.db, tenantId, customerId);
    if (!customer) {
      return reply.code(404).send(apiError('NOT_FOUND', `Kunde ${customerId} nicht gefunden.`));
    }

    const profile = await getProfile(app.db, customerId);
    return reply.send(apiOk({ customer, profile }));
  });
}
