/**
 * Fastify-Plugin für POST /api/v1/routing/plan.
 *
 * Wird in app.ts SEPARAT vom alten routing.routes.ts (D9 jobs) registriert,
 * weil der bestehende Routing-Plan-Endpoint die Konzept-konforme TEXT-customer_id-
 * Welt nutzt, während routing.routes.ts auf der UUID/tenant-Welt arbeitet.
 */

import type { FastifyInstance } from 'fastify';
import { buildPlanHandler } from './handlers/plan.handler';

export async function routingPlanRoutes(app: FastifyInstance): Promise<void> {
  app.post('/plan', buildPlanHandler());
}
