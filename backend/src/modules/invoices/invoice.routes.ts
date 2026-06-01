/**
 * T035 — Invoice-Routes
 *
 * GET  /api/v1/invoices              → Liste aller Rechnungen (Mitarbeiter)
 * GET  /api/v1/invoices/:id          → Einzelne Rechnung
 * POST /api/v1/invoices/:id/pay      → Als bezahlt markieren
 * POST /api/v1/invoices/:id/cancel   → Stornieren
 * POST /api/v1/invoices/generate     → Manuell Monatsabrechnung triggern (Admin)
 *
 * Auth: HMAC-Middleware (alle Routen im /api/v1-Block).
 * Tenant-Isolation: Mitarbeiter-Webapp ist cross-tenant — alle Routen nutzen
 * den Owner-Pool (app.db). Kein X-Tenant-ID-Scoping nötig (Mitarbeiter-Only).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generateMonthlyInvoices } from './invoice.generator';
import {
  cancelInvoice,
  findInvoiceById,
  listInvoices,
  markInvoicePaid,
} from './invoice.repository';
import { invoiceParamsSchema, listInvoicesQuerySchema, markPaidBodySchema } from './invoice.schema';

// ── Zod-Schema für manuellen Trigger ──────────────────────────────────────────

const generateBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

// ── Plugin ────────────────────────────────────────────────────────────────────

export const invoiceRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/v1/invoices
   * Liste aller Rechnungen (optional gefiltert nach tenant_id, status, type, year, month).
   */
  app.get('/', async (req, reply) => {
    const parseResult = listInvoicesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'invalid_query',
        message: parseResult.error.errors[0]?.message ?? 'Ungültige Query-Parameter',
      });
    }

    const { data, total } = await listInvoices(app.db, parseResult.data);
    return reply.send({ data, total });
  });

  /**
   * GET /api/v1/invoices/:id
   */
  app.get('/:id', async (req, reply) => {
    const parseResult = invoiceParamsSchema.safeParse(req.params);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_params' });
    }

    const invoice = await findInvoiceById(app.db, parseResult.data.id);
    if (!invoice) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send(invoice);
  });

  /**
   * POST /api/v1/invoices/:id/pay
   * Mitarbeiter markiert Rechnung als bezahlt.
   */
  app.post('/:id/pay', async (req, reply) => {
    const paramsResult = invoiceParamsSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ error: 'invalid_params' });
    }

    const bodyResult = markPaidBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        message: bodyResult.error.errors[0]?.message ?? 'Ungültiger Body',
      });
    }

    const { paid_amount, paid_at } = bodyResult.data;
    const paidAt = paid_at ? new Date(paid_at) : undefined;

    const updated = await markInvoicePaid(app.db, paramsResult.data.id, paid_amount, paidAt);
    if (!updated) {
      return reply.code(404).send({ error: 'not_found_or_already_cancelled' });
    }
    return reply.send(updated);
  });

  /**
   * POST /api/v1/invoices/:id/cancel
   * Rechnung stornieren (Mitarbeiter/Admin).
   */
  app.post('/:id/cancel', async (req, reply) => {
    const paramsResult = invoiceParamsSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ error: 'invalid_params' });
    }

    const updated = await cancelInvoice(app.db, paramsResult.data.id);
    if (!updated) {
      return reply.code(404).send({
        error: 'not_found_or_already_closed',
        message: 'Rechnung nicht gefunden oder bereits bezahlt/storniert.',
      });
    }
    return reply.send(updated);
  });

  /**
   * POST /api/v1/invoices/generate
   * Manuell Monatsabrechnung für year/month triggern (Admin-Only).
   * DECISION: Kein Cron-Framework im Backend (Tendenz: n8n-Cron-Trigger ruft
   * diesen Endpoint auf). Alternativ: node-cron im server.ts — folgt in T036.
   */
  app.post('/generate', async (req, reply) => {
    const parseResult = generateBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        message: parseResult.error.errors[0]?.message ?? 'year und month erforderlich',
      });
    }

    const { year, month } = parseResult.data;
    const results = await generateMonthlyInvoices(app.db, year, month);

    const created = results.filter((r) => !r.skipped && !r.error).length;
    const skipped = results.filter((r) => r.skipped).length;
    const errored = results.filter((r) => r.error != null).length;

    return reply.send({
      year,
      month,
      summary: { created, skipped, errored, total: results.length },
      results,
    });
  });
};
