/**
 * M07 — Fastify-Routen für `/api/v1/receipts/*` (Spreadsheet-Export-Endpoint).
 *
 * Registrierung in app.ts (nach D3-HMAC-Middleware):
 *   await apiApp.register(m07SpreadsheetRoutes, { prefix: '/receipts' });
 *
 * Endpoint:
 *   POST /:receipt_id/exports/spreadsheet — Append/Update Beleg in Sheet
 *
 * Spec-Referenz: M07 §6, §7
 */

import type { FastifyInstance } from 'fastify';
import { type AppendHandlerDeps, buildAppendHandler } from './handlers/append.handler';

export async function m07SpreadsheetRoutes(
  app: FastifyInstance,
  deps: AppendHandlerDeps = {},
): Promise<void> {
  app.post('/:receipt_id/exports/spreadsheet', buildAppendHandler(deps));
}
