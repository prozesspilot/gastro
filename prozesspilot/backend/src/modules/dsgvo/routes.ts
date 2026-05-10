/**
 * DSGVO-Compliance — Fastify-Routen (Task 504):
 *   POST /api/v1/dsgvo/delete-request                  → Loeschantrag stellen
 *   GET  /api/v1/dsgvo/delete-request/:id               → Status abfragen
 *   POST /api/v1/dsgvo/delete-request/:id/execute       → Loeschung ausfuehren (Admin)
 *   GET  /api/v1/dsgvo/export-data                      → JSON-Export aller Kundendaten
 *   GET  /api/v1/dsgvo/pii-inventory                    → Liste aller PII-Felder
 */

import type { FastifyInstance } from 'fastify';
import { buildDataExportHandler } from './handlers/data-export.handler';
import {
  buildDeletionStatusHandler,
  buildExecuteDeletionHandler,
} from './handlers/deletion-status.handler';
import { buildPiiInventoryHandler } from './handlers/pii-inventory.handler';
import { buildRequestDeletionHandler } from './handlers/request-deletion.handler';

/** Registriert unter /dsgvo */
export async function dsgvoRoutes(app: FastifyInstance): Promise<void> {
  app.post('/delete-request', buildRequestDeletionHandler());
  app.get('/delete-request/:id', buildDeletionStatusHandler());
  app.post('/delete-request/:id/execute', buildExecuteDeletionHandler());
  app.get('/export-data', buildDataExportHandler());
  app.get('/pii-inventory', buildPiiInventoryHandler());
}
