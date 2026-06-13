/**
 * M03 — GET /api/v1/categories
 *
 * Liefert die Systemkategorien für die KI-Kategorisierung.
 * Tenant-Isolation: In Zukunft können Tenant-spezifische Kategorien
 * ergänzt werden (Custom SKR-Konten). Für jetzt: Systemkategorien.
 *
 * Registrierung in app.ts:
 *   await apiApp.register(categoriesRoutes, { prefix: '/categories' });
 */

import type { FastifyInstance } from 'fastify';
import { apiOk } from '../../core/schemas/common';
import { SYSTEM_CATEGORIES } from './system-categories';

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  // GET /categories — Liste aller Systemkategorien
  app.get('/', async (_req, reply) => {
    return reply.send(apiOk(SYSTEM_CATEGORIES));
  });
}
