/**
 * M04 — Fastify-Routen:
 *   POST /api/v1/customers/:customerId/datev/build
 *   POST /api/v1/customers/:customerId/datev/:exportId/send
 *   GET  /api/v1/customers/:customerId/datev
 *   GET  /api/v1/customers/:customerId/datev/:exportId/download/csv
 *   GET  /api/v1/customers/:customerId/datev/:exportId/download/zip
 */

import type { FastifyInstance } from 'fastify';
import { buildBuildHandler } from './handlers/build.handler';
import { buildDownloadCsvHandler, buildDownloadZipHandler } from './handlers/download.handler';
import { buildListHandler } from './handlers/list.handler';
import { buildSendHandler } from './handlers/send.handler';

/** Registriert unter /customers */
export async function m04DatevRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:customerId/datev/build', buildBuildHandler());
  app.post('/:customerId/datev/:exportId/send', buildSendHandler());
  app.get('/:customerId/datev', buildListHandler());
  app.get('/:customerId/datev/:exportId/download/csv', buildDownloadCsvHandler());
  app.get('/:customerId/datev/:exportId/download/zip', buildDownloadZipHandler());
}
