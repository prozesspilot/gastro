/**
 * T087/M08 — Reporting-Routes (belege-Welt).
 *
 * Registrierung in app.ts:
 *   await app.register(reportingRoutes, { prefix: '/api/v1' });
 *
 * Endpoints:
 *   POST /api/v1/reports/monthly/build  — Monats-Report bauen (mitarbeiter+, support→403)
 *
 * Auth: M14-JWT-Cookie (pp_auth) + X-PP-Tenant-ID-Header.
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { buildReportHandler } from './handlers/build-report.handler';

// Explizites Per-Route-Rate-Limiting (zusätzlich zum globalen Limit aus app.ts).
// Greift nur mit @fastify/rate-limit (Prod; im Test ignoriert) und verhindert den
// CodeQL-Missing-Rate-Limiting-Alert (Memory codeql-missing-rate-limiting).
// Report-Build ist teuer (Aggregation + PDF + Upload) → bewusst niedrig.
const RL = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export async function reportingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.post('/reports/monthly/build', RL, buildReportHandler);
}
