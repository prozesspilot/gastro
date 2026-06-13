/**
 * T048/F2 — Kategorisier-Route für die belege-Welt.
 *
 * Registrierung in app.ts (LIVE-Block, JWT — nicht HMAC):
 *   await app.register(belegeCategorizeRoutes, { prefix: '/api/v1' });
 *
 * Endpoint: POST /api/v1/belege/:id/categorize (m14-JWT-Cookie + X-PP-Tenant-ID).
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { buildBelegeCategorizeHandler } from './handlers/belege-categorize.handler';

export async function belegeCategorizeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);
  app.post<{ Params: { id: string } }>('/belege/:id/categorize', buildBelegeCategorizeHandler());
}
