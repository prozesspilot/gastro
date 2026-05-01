/**
 * M08 — Fastify-Routen.
 *
 * Wird unter Prefix '/customers' registriert (in app.ts), nicht unter
 * '/reports', weil die Endpoints customer-scoped sind:
 *   POST /customers/:customer_id/reports/monthly/build
 *   POST /customers/:customer_id/reports/monthly/deliver
 *   GET  /customers/:customer_id/reports
 */

import type { FastifyInstance } from 'fastify';
import { buildBuildHandler } from './handlers/build.handler';
import { buildDeliverHandler } from './handlers/deliver.handler';
import { buildListHandler } from './handlers/list.handler';
import { buildDownloadHandler } from './handlers/download.handler';

export async function m08ReportingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:customer_id/reports/monthly/build', buildBuildHandler());
  app.post('/:customer_id/reports/monthly/deliver', buildDeliverHandler());
  app.get('/:customer_id/reports', buildListHandler());
  app.get('/:customer_id/reports/:report_id/download', buildDownloadHandler());
}
