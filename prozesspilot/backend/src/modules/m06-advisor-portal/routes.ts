/**
 * M06 Steuerberater-Portal — Fastify-Routen:
 *
 * AKTIVE Routen (Scope: Export-Empfänger-Sicht):
 *   GET  /api/v1/advisor/exports/:customerId    → Liste herunterladbarer Exporte
 *
 * DEPRECATED Routen (A3-Scope-Reduktion — bleiben als Stubs, X-Deprecated-Header):
 *   GET  /api/v1/advisor/overview               → DEPRECATED
 *   GET  /api/v1/advisor/receipts/pending       → DEPRECATED
 *   POST /api/v1/advisor/receipts/bulk-approve  → DEPRECATED
 *   POST /api/v1/advisor/receipts/:id/comment   → DEPRECATED
 *
 * Begründung (A3): Das Advisor-Portal wird zur reinen Export-Empfänger-Sicht
 * vereinfacht. Bulk-Approve, Pending-Review und Comment-Threads sind aus dem
 * Produkt-Scope raus. Routen werden als deprecated markiert, nicht gelöscht,
 * um bestehende Integrationen nicht zu brechen.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildCustomersOverviewHandler } from './handlers/customers-overview.handler';
import { buildReceiptsReviewHandler } from './handlers/receipts-review.handler';
import { buildBulkApproveHandler } from './handlers/bulk-approve.handler';
import { buildCommentsHandler } from './handlers/comments.handler';
import { apiOk, zodToApiError } from '../../core/schemas/common';

// ── Zod-Schema für Export-Query ───────────────────────────────────────────

const advisorExportsQuerySchema = z.object({
  from:          z.string().regex(/^\d{4}-\d{2}$/, 'Format YYYY-MM').optional(),
  to:            z.string().regex(/^\d{4}-\d{2}$/, 'Format YYYY-MM').optional(),
  advisor_id:    z.string().min(1).optional(),
});

/** Registriert unter /advisor */
export async function m06AdvisorPortalRoutes(app: FastifyInstance): Promise<void> {
  // ── AKTIV: Export-Empfänger-Sicht ─────────────────────────────────────
  // GET /advisor/exports/:customerId?from=YYYY-MM&to=YYYY-MM
  // Liefert eine Liste herunterladbarer Exporte (DATEV-CSV, Reports, ZIP)
  // für einen bestimmten Kunden im angegebenen Zeitraum.

  app.get<{ Params: { customerId: string } }>(
    '/exports/:customerId',
    async (req, reply) => {
      const queryParsed = advisorExportsQuerySchema.safeParse(req.query);
      if (!queryParsed.success) {
        return reply.code(422).send(zodToApiError(queryParsed.error));
      }

      // DECISION: Exporte werden aus der reports-Tabelle aggregiert.
      // In Phase 3: signed URLs aus MinIO. Für jetzt: Metadaten-Liste.
      const { from, to } = queryParsed.data;

      const conditions: string[] = [
        'r.tenant_id = $1',
        'r.customer_id = $2',
      ];
      const params: unknown[] = [req.headers['x-pp-tenant-id'] as string, req.params.customerId];
      let pi = 3;

      if (from) {
        conditions.push(`r.created_at >= $${pi}::timestamptz`);
        params.push(`${from}-01`);
        pi++;
      }
      if (to) {
        conditions.push(`r.created_at < $${pi}::timestamptz`);
        params.push(`${to}-01`);
        pi++;
      }

      const { rows } = await app.db.query<{
        id: string; status: string; created_at: Date; storage_key: string | null;
        original_name: string | null; mime_type: string | null;
      }>(
        `SELECT id, status, created_at, storage_key, original_name, mime_type
         FROM receipts r
         WHERE ${conditions.join(' AND ')}
           AND r.status IN ('exported', 'completed', 'archived')
         ORDER BY r.created_at DESC
         LIMIT 200`,
        params,
      );

      const exports = rows.map((r) => ({
        receipt_id:    r.id,
        status:        r.status,
        original_name: r.original_name,
        mime_type:     r.mime_type,
        has_file:      Boolean(r.storage_key),
        // In Phase 3: signierte Download-URL aus MinIO
        download_url:  r.storage_key
          ? `/api/v1/receipts/${r.id}/download`
          : null,
        created_at: r.created_at.toISOString(),
      }));

      return reply.send(apiOk({ customer_id: req.params.customerId, from, to, exports }));
    },
  );

  // ── DEPRECATED: Ältere Advisor-Portal-Routen ──────────────────────────
  // Behalten für Rückwärtskompatibilität, aber mit Deprecated-Header.

  app.addHook('onSend', async (_req, reply, payload) => {
    // Füge Deprecated-Header hinzu wenn Route als deprecated markiert ist
    const url = _req.routeOptions?.url ?? '';
    const deprecatedRoutes = ['/overview', '/receipts/pending', '/receipts/bulk-approve'];
    if (deprecatedRoutes.some((r) => url.endsWith(r)) || url.includes('/receipts/') && url.endsWith('/comment')) {
      reply.header('X-Deprecated', 'true');
      reply.header('X-Deprecated-Info', 'Nutze GET /advisor/exports/:customerId');
    }
    return payload;
  });

  app.get('/overview', buildCustomersOverviewHandler());
  app.get('/receipts/pending', buildReceiptsReviewHandler());
  app.post('/receipts/bulk-approve', buildBulkApproveHandler());
  app.post('/receipts/:id/comment', buildCommentsHandler());
}
