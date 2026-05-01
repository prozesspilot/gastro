/**
 * M03 — Fastify-Route für `POST /api/v1/receipts/:receipt_id/categorize`.
 *
 * Registrierung in app.ts (innerhalb des HMAC-geschützten /api/v1-Plugins):
 *   await apiApp.register(m03CategorizationRoutes, { prefix: '/receipts' });
 */

import type { FastifyInstance } from 'fastify';
import { buildCategorizeHandler, type CategorizeHandlerDeps } from './handlers/categorize.handler';

export async function m03CategorizationRoutes(
  app: FastifyInstance,
  deps: CategorizeHandlerDeps = {},
): Promise<void> {
  app.post('/:receipt_id/categorize', buildCategorizeHandler(deps));
}
