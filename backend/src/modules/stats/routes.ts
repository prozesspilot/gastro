/**
 * Stats-Routen — GET /api/v1/customers/:customerId/stats
 *
 * Liefert Aggregationen für die StatsPage der Webapp.
 * Registrierung in app.ts unter Prefix '/customers'.
 */

import type { FastifyInstance } from 'fastify';
import { buildStatsHandler } from './handlers/stats.handler';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:customerId/stats', buildStatsHandler());
}
