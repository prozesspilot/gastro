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
import { buildBelegeConfirmReviewHandler } from './handlers/belege-confirm-review.handler';

// Explizites Per-Route-Rate-Limiting (greift nur mit @fastify/rate-limit in Prod,
// im Test ignoriert). Verhindert zugleich den CodeQL-Missing-Rate-Limiting-Alert
// (Memory codeql-missing-rate-limiting) beim Anfassen dieser Routen-Datei.
const RL = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

export async function belegeCategorizeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);
  app.post<{ Params: { id: string } }>(
    '/belege/:id/categorize',
    RL,
    buildBelegeCategorizeHandler(),
  );
  // T078 — geprüften requires_review-Beleg als categorized bestätigen.
  app.post<{ Params: { id: string } }>(
    '/belege/:id/confirm-review',
    RL,
    buildBelegeConfirmReviewHandler(),
  );
}
