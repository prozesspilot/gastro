/**
 * T058/A3 — GET /api/v1/tenants (Staff-Cross-Tenant-Listing).
 *
 * Liefert der internen Mitarbeiter-Webapp die Mandanten-Liste für den
 * Tenant-Selector (setzt anschließend `x-pp-tenant-id` für die belege-Endpoints).
 *
 * Auth: NUR `m14StaffAuthHook` (JWT-Cookie) — bewusst OHNE `m14TenantContextHook`,
 * weil das Listing NICHT tenant-scoped ist (es listet ja gerade alle Mandanten).
 *
 * Registrierung in app.ts:
 *   await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../core/auth/m14-staff-auth';
import { apiOk } from '../core/schemas/common';
import { listTenantsForStaff } from './tenants.repository';

export async function tenantsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);

  // GET /api/v1/tenants
  app.get('/', async (req, reply) => {
    const tenants = await listTenantsForStaff(req.server.db);
    return reply.send(apiOk(tenants));
  });
}
