/**
 * M05 — Fastify-Routen:
 *   POST /api/v1/receipts/:receipt_id/exports/lexoffice
 *   GET  /api/v1/customers/:customerId/exports/lexoffice  (registered separately via customerLexofficeRoutes)
 *   POST /api/v1/integrations/lexoffice/test              (registered separately via integrationLexofficeRoutes)
 *   POST /api/v1/integrations/lexoffice/sync-categories   (registered separately)
 */

import type { FastifyInstance } from 'fastify';
import { buildExportsListHandler } from './handlers/exports.handler';
import {
  buildIntegrationTestHandler,
  buildSyncCategoriesHandler,
} from './handlers/integration.handler';
import { type PushHandlerDeps, buildPushHandler } from './handlers/push.handler';

/** Registriert unter /receipts */
export async function m05LexofficeRoutes(
  app: FastifyInstance,
  deps: PushHandlerDeps = {},
): Promise<void> {
  app.post('/:receipt_id/exports/lexoffice', buildPushHandler(deps));
}

/** Registriert unter /customers */
export async function m05CustomerLexofficeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:customerId/exports/lexoffice', buildExportsListHandler());
}

/** Registriert unter /integrations/lexoffice */
export async function m05IntegrationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/test', buildIntegrationTestHandler());
  app.post('/sync-categories', buildSyncCategoriesHandler());
}
