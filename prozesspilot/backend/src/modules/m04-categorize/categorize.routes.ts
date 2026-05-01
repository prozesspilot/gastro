/**
 * M04 — Categorize-Routen
 *
 * Endpoints:
 *   POST /api/v1/receipts/:id/categorize
 */

import type { FastifyInstance } from 'fastify';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { rateLimit } from '../../core/rate-limit/rate-limit.middleware';
import { buildCategorizeHandler } from './categorize.handler';

export async function m04CategorizeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', tenantContextHook);
  app.post<{ Params: { id: string } }>(
    '/:id/categorize',
    { preHandler: rateLimit('receipts_categorize') },
    buildCategorizeHandler(),
  );
}
