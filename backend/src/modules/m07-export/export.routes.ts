/**
 * M07 — Export-Routes (belege-Welt).
 *
 * Registrierung in app.ts:
 *   await app.register(exportRoutes, { prefix: '/api/v1' });
 *
 * Endpoint:
 *   GET /api/v1/exports/belege.csv?year=&month=  — Belege-CSV-Download (mitarbeiter+, support→403)
 *
 * Auth: M14-JWT-Cookie (pp_auth) + X-PP-Tenant-ID-Header.
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { exportBelegeCsvHandler } from './handlers/export-csv.handler';

// Explizites Per-Route-Rate-Limit (CodeQL-Falle, Memory codeql-missing-rate-limiting).
const RL = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.get('/exports/belege.csv', RL, exportBelegeCsvHandler);
}
