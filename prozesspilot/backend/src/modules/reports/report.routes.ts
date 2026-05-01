/**
 * Report-Routen
 *
 * GET /api/v1/reports/receipts → PDF-Export der Belege.
 *   Query: date_from?, date_to?, status?
 *   Header: x-pp-tenant-id (Pflicht)
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { apiError, zodToApiError } from '../../core/schemas/common';
import { generateReceiptReport, type ReportReceipt } from './report.generator';

const reportQuerySchema = z.object({
  date_from: z.string().datetime().optional(),
  date_to:   z.string().datetime().optional(),
  status:    z.enum(['pending', 'processing', 'done', 'error']).optional(),
});

interface ReportRow {
  id:            string;
  status:        string;
  original_name: string | null;
  metadata:      Record<string, unknown>;
  created_at:    Date;
}

async function loadReportData(
  db: Pool,
  tenantId: string,
  filters: z.infer<typeof reportQuerySchema>,
): Promise<{ receipts: ReportReceipt[]; tenantName: string }> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let i = 2;

  if (filters.date_from) {
    conditions.push(`created_at >= $${i}`);
    params.push(filters.date_from);
    i++;
  }
  if (filters.date_to) {
    conditions.push(`created_at <= $${i}`);
    params.push(filters.date_to);
    i++;
  }
  if (filters.status) {
    conditions.push(`status = $${i}`);
    params.push(filters.status);
    i++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await db.query<ReportRow>(
    `
    SELECT id, status, original_name, metadata, created_at
    FROM receipts
    ${where}
    ORDER BY created_at DESC
    `,
    params,
  );

  const tenantQ = await db.query<{ name: string }>(
    `SELECT name FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const tenantName = tenantQ.rows[0]?.name ?? 'Unbekannt';

  const receipts: ReportReceipt[] = rows.map((row) => {
    const m = (row.metadata ?? {}) as { categorization?: Record<string, unknown> };
    const c = m.categorization ?? {};
    return {
      id:            row.id,
      status:        row.status,
      original_name: row.original_name,
      category:      typeof c.category === 'string' ? (c.category as string) : null,
      amount:        typeof c.amount === 'number' ? (c.amount as number) : null,
      currency:      typeof c.currency === 'string' ? (c.currency as string) : null,
      date:          typeof c.date === 'string' ? (c.date as string) : null,
      created_at:    row.created_at.toISOString(),
    };
  });

  return { receipts, tenantName };
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', tenantContextHook);

  app.get('/receipts', async (req, reply) => {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    try {
      const { receipts, tenantName } = await loadReportData(app.db, req.tenantId, parsed.data);
      const pdf = await generateReceiptReport(receipts, tenantName);
      const filename = `belege-${new Date().toISOString().slice(0, 10)}.pdf`;
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(pdf);
    } catch (err) {
      return reply.code(500).send(
        apiError('REPORT_FAILED', 'PDF-Erzeugung fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }
  });
}
