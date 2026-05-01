/**
 * Plugin-System — Fastify-Routen:
 *   POST   /api/v1/plugins                      → Plugin registrieren
 *   GET    /api/v1/plugins                      → Liste (nach tenant_id gefiltert)
 *   PUT    /api/v1/plugins/:pluginId             → Update
 *   DELETE /api/v1/plugins/:pluginId             → Loeschen
 *   GET    /api/v1/plugins/:pluginId/executions  → Ausfuehrungshistorie
 */

import type { FastifyInstance } from 'fastify';
import { buildRegisterHandler } from './handlers/register.handler';
import { buildListHandler } from './handlers/list.handler';
import { buildUpdateHandler } from './handlers/update.handler';
import { buildDeleteHandler } from './handlers/delete.handler';
import { buildExecutionsHandler } from './handlers/executions.handler';

/** Registriert unter /plugins */
export async function pluginSystemRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', buildRegisterHandler());
  app.get('/', buildListHandler());
  app.put('/:pluginId', buildUpdateHandler());
  app.delete('/:pluginId', buildDeleteHandler());
  app.get('/:pluginId/executions', buildExecutionsHandler());
}
