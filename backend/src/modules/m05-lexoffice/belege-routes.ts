/**
 * T009/M05 — Neue Lexware-Office-Export-Routes fuer die belege-Tabelle.
 *
 * Liegt parallel zu modules/m05-lexoffice/routes.ts (alt, gegen receipts).
 * Registrierung in app.ts:
 *   await app.register(belegeLexwareRoutes, { prefix: '/api/v1' });
 *
 * Endpoints:
 *   POST /api/v1/belege/:id/exports/lexware   — Single-Push (mitarbeiter+)
 *   POST /api/v1/exports/lexware/batch        — Tenant-Batch (gf only)
 *
 * Beide Routes brauchen M14-JWT-Cookie + X-PP-Tenant-ID Header.
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { belegeBatchHandler } from './handlers/belege-batch.handler';
import { belegePushHandler } from './handlers/belege-push.handler';

export async function belegeLexwareRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.post<{ Params: { id: string } }>('/belege/:id/exports/lexware', belegePushHandler);
  app.post('/exports/lexware/batch', belegeBatchHandler);
}
