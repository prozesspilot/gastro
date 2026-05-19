/**
 * T005/M15 — Kasse + SumUp-Sync Routes.
 *
 * Registrierung in app.ts:
 *   await app.register(kasseRoutes, { prefix: '/api/v1/m15' });
 *
 * Endpoints:
 *   POST /api/v1/m15/sumup/sync        — manueller Sync-Trigger (gf only)
 *   GET  /api/v1/m15/kasse/transactions — Daily-Z-Bon-Liste (mitarbeiter+)
 *
 * Beide: M14-JWT + X-PP-Tenant-ID.
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { kasseListHandler } from './handlers/kasse-list.handler';
import { sumupSyncHandler } from './handlers/sumup-sync.handler';

export async function kasseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.post('/sumup/sync', sumupSyncHandler);
  app.get('/kasse/transactions', kasseListHandler);
}
