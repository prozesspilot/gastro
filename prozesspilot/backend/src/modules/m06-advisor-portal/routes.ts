/**
 * M06 Steuerberater-Portal — Fastify-Routen:
 *
 *   GET  /api/v1/advisor/overview               → alle zugänglichen Kunden mit KPIs
 *   GET  /api/v1/advisor/receipts/pending       → Belege mit requires_review über alle Kunden
 *   POST /api/v1/advisor/receipts/bulk-approve  → mehrere Belege gleichzeitig genehmigen
 *   POST /api/v1/advisor/receipts/:id/comment   → Kommentar zu einem Beleg hinterlassen
 */

import type { FastifyInstance } from 'fastify';
import { buildCustomersOverviewHandler } from './handlers/customers-overview.handler';
import { buildReceiptsReviewHandler } from './handlers/receipts-review.handler';
import { buildBulkApproveHandler } from './handlers/bulk-approve.handler';
import { buildCommentsHandler } from './handlers/comments.handler';

/** Registriert unter /advisor */
export async function m06AdvisorPortalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/overview', buildCustomersOverviewHandler());
  app.get('/receipts/pending', buildReceiptsReviewHandler());
  app.post('/receipts/bulk-approve', buildBulkApproveHandler());
  app.post('/receipts/:id/comment', buildCommentsHandler());
}
