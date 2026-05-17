/**
 * Fastify-Plugin für POST /api/v1/receipts/:receipt_id/complete.
 *
 * Wird in app.ts unter dem `/receipts`-Prefix registriert (innerhalb der
 * HMAC-geschützten /api/v1-Sektion). Konzept-konforme TEXT-customer_id-Welt;
 * der bestehende receipts/receipt.routes.ts (UUID/tenant) bleibt unangetastet.
 */

import type { FastifyInstance } from 'fastify';
import { buildCompleteHandler } from './handlers/complete.handler';
import { buildUpdateStatusHandler } from './handlers/update-status.handler';

export async function receiptsCompleteRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:receipt_id/complete', buildCompleteHandler());
  // Welt-A-Variante des Status-Updates. Der bestehende PUT /:id/status in
  // receipts/receipt.routes.ts ist UUID/tenant-basiert; dieser hier nimmt
  // TEXT customer_id im Body und ist für WF-MASTER-RECEIPT/WF-ERROR-HANDLER
  // gedacht ("transition" macht den Pipeline-bound Charakter explizit).
  app.put('/:receipt_id/transition', buildUpdateStatusHandler());
}
