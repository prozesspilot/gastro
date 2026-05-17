/**
 * M06 — Fastify-Routen:
 *   POST /api/v1/receipts/:receiptId/exports/sevdesk
 *   GET  /api/v1/customers/:customerId/exports/sevdesk
 *   POST /api/v1/integrations/sevdesk/test
 *   POST /api/v1/integrations/sevdesk/sync-accounts
 */

import type { FastifyInstance } from 'fastify';
import { buildExportsListHandler } from './handlers/exports.handler';
import {
  buildIntegrationTestHandler,
  buildSyncAccountsHandler,
} from './handlers/integration.handler';
import { type PushHandlerDeps, buildPushHandler } from './handlers/push.handler';

/** Registriert unter /receipts */
export async function m06SevdeskRoutes(
  app: FastifyInstance,
  deps: PushHandlerDeps = {},
): Promise<void> {
  app.post('/:receiptId/exports/sevdesk', buildPushHandler(deps));
}

/** Registriert unter /customers */
export async function m06CustomerSevdeskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:customerId/exports/sevdesk', buildExportsListHandler());
}

/** Registriert unter /integrations/sevdesk */
export async function m06IntegrationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/test', buildIntegrationTestHandler());
  app.post('/sync-accounts', buildSyncAccountsHandler());
}
