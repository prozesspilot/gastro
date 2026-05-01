/**
 * Stats Handler — GET /api/v1/customers/:customerId/stats
 *
 * Liefert Aggregationen für die StatsPage der Webapp:
 *   - receipts_by_month: letzte 12 Monate
 *   - by_category: Ausgaben pro Kategorie
 *   - top_suppliers: Top 10 Lieferanten nach Umsatz
 *   - export_rate: Anteil der nach Lexoffice/DATEV exportierten Belege
 *   - processing_times: Ø und p95 Durchlaufzeit
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { apiOk } from '../../../core/schemas/common';

interface ReceiptsByMonth {
  year: number;
  month: number;
  count: number;
  gross_sum: number;
}

interface ByCategory {
  category_name: string;
  category_id: string;
  count: number;
  gross_sum: number;
}

interface TopSupplier {
  supplier_name: string;
  count: number;
  gross_sum: number;
}

interface ExportRate {
  lexoffice: number;
  datev: number;
}

interface ProcessingTimes {
  avg_ms: number | null;
  p95_ms: number | null;
}

export interface CustomerStats {
  customer_id: string;
  receipts_by_month: ReceiptsByMonth[];
  by_category: ByCategory[];
  top_suppliers: TopSupplier[];
  export_rate: ExportRate;
  processing_times: ProcessingTimes;
}

export function buildStatsHandler() {
  return async function statsHandler(
    req: FastifyRequest<{
      Params: { customerId: string };
      Querystring: { from?: string; to?: string };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId } = req.params;
    const db: Pool = req.server.db;

    // Default: letzte 12 Monate
    const now = new Date();
    const fromDefault = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const from = req.query.from ?? fromDefault.toISOString().slice(0, 10);
    const to = req.query.to ?? now.toISOString().slice(0, 10);

    const [
      receiptsByMonth,
      byCategory,
      topSuppliers,
      exportRate,
      processingTimes,
    ] = await Promise.all([
      queryReceiptsByMonth(db, customerId, from, to),
      queryByCategory(db, customerId, from, to),
      queryTopSuppliers(db, customerId, from, to),
      queryExportRate(db, customerId),
      queryProcessingTimes(db, customerId),
    ]);

    const stats: CustomerStats = {
      customer_id: customerId,
      receipts_by_month: receiptsByMonth,
      by_category: byCategory,
      top_suppliers: topSuppliers,
      export_rate: exportRate,
      processing_times: processingTimes,
    };

    return reply.send(apiOk(stats));
  };
}

// ── SQL-Aggregationen ─────────────────────────────────────────────────────────

async function queryReceiptsByMonth(
  db: Pool,
  customerId: string,
  from: string,
  to: string,
): Promise<ReceiptsByMonth[]> {
  const { rows } = await db.query<{
    year: string;
    month: string;
    count: string;
    gross_sum: string | null;
  }>(
    `SELECT
       EXTRACT(YEAR FROM COALESCE(
         to_date(payload->'extraction'->'fields'->>'document_date', 'YYYY-MM-DD'),
         created_at::date
       ))::int                                                                     AS year,
       EXTRACT(MONTH FROM COALESCE(
         to_date(payload->'extraction'->'fields'->>'document_date', 'YYYY-MM-DD'),
         created_at::date
       ))::int                                                                     AS month,
       COUNT(*)                                                                    AS count,
       COALESCE(SUM((payload->'extraction'->'fields'->>'total_gross')::numeric), 0) AS gross_sum
     FROM receipts
    WHERE customer_id = $1
      AND status IN ('archived','exported','completed','categorized')
      AND COALESCE(
            to_date(payload->'extraction'->'fields'->>'document_date', 'YYYY-MM-DD'),
            created_at::date
          ) BETWEEN $2::date AND $3::date
    GROUP BY 1, 2
    ORDER BY 1, 2`,
    [customerId, from, to],
  );

  return rows.map((r) => ({
    year: Number(r.year),
    month: Number(r.month),
    count: Number(r.count),
    gross_sum: Number(r.gross_sum ?? 0),
  }));
}

async function queryByCategory(
  db: Pool,
  customerId: string,
  from: string,
  to: string,
): Promise<ByCategory[]> {
  const { rows } = await db.query<{
    category_name: string | null;
    category_id: string | null;
    count: string;
    gross_sum: string | null;
  }>(
    `SELECT
       COALESCE(payload->'categorization'->>'category_label',
                payload->'categorization'->>'category',
                'Unkategorisiert')                                                  AS category_name,
       COALESCE(payload->'categorization'->>'category', 'unknown')                 AS category_id,
       COUNT(*)                                                                     AS count,
       COALESCE(SUM((payload->'extraction'->'fields'->>'total_gross')::numeric), 0) AS gross_sum
     FROM receipts
    WHERE customer_id = $1
      AND status IN ('archived','exported','completed','categorized')
      AND COALESCE(
            to_date(payload->'extraction'->'fields'->>'document_date', 'YYYY-MM-DD'),
            created_at::date
          ) BETWEEN $2::date AND $3::date
    GROUP BY 1, 2
    ORDER BY gross_sum DESC NULLS LAST
    LIMIT 20`,
    [customerId, from, to],
  );

  return rows.map((r) => ({
    category_name: r.category_name ?? 'Unkategorisiert',
    category_id: r.category_id ?? 'unknown',
    count: Number(r.count),
    gross_sum: Number(r.gross_sum ?? 0),
  }));
}

async function queryTopSuppliers(
  db: Pool,
  customerId: string,
  from: string,
  to: string,
): Promise<TopSupplier[]> {
  const { rows } = await db.query<{
    supplier_name: string | null;
    count: string;
    gross_sum: string | null;
  }>(
    `SELECT
       COALESCE(payload->'extraction'->'fields'->>'supplier_name', 'Unbekannt') AS supplier_name,
       COUNT(*)                                                                   AS count,
       COALESCE(SUM((payload->'extraction'->'fields'->>'total_gross')::numeric), 0) AS gross_sum
     FROM receipts
    WHERE customer_id = $1
      AND status IN ('archived','exported','completed','categorized')
      AND COALESCE(
            to_date(payload->'extraction'->'fields'->>'document_date', 'YYYY-MM-DD'),
            created_at::date
          ) BETWEEN $2::date AND $3::date
    GROUP BY 1
    ORDER BY gross_sum DESC NULLS LAST
    LIMIT 10`,
    [customerId, from, to],
  );

  return rows.map((r) => ({
    supplier_name: r.supplier_name ?? 'Unbekannt',
    count: Number(r.count),
    gross_sum: Number(r.gross_sum ?? 0),
  }));
}

async function queryExportRate(db: Pool, customerId: string): Promise<ExportRate> {
  const { rows } = await db.query<{
    total: string;
    lexoffice_count: string;
    datev_count: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1
           FROM jsonb_array_elements(COALESCE(payload->'exports', '[]'::jsonb)) AS exp
          WHERE exp->>'target' = 'lexoffice' AND exp->>'status' = 'pushed'
       )) AS lexoffice_count,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1
           FROM jsonb_array_elements(COALESCE(payload->'exports', '[]'::jsonb)) AS exp
          WHERE exp->>'target' = 'datev' AND exp->>'status' = 'pushed'
       )) AS datev_count
     FROM receipts
    WHERE customer_id = $1
      AND status NOT IN ('received', 'extracting', 'error')`,
    [customerId],
  );

  const row = rows[0];
  const total = Number(row?.total ?? 0);
  if (total === 0) return { lexoffice: 0, datev: 0 };

  return {
    lexoffice: Math.round((Number(row.lexoffice_count) / total) * 100),
    datev: Math.round((Number(row.datev_count) / total) * 100),
  };
}

async function queryProcessingTimes(db: Pool, customerId: string): Promise<ProcessingTimes> {
  const { rows } = await db.query<{
    avg_ms: string | null;
    p95_ms: string | null;
  }>(
    `SELECT
       AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)  AS avg_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000
       )                                                                                   AS p95_ms
     FROM receipts
    WHERE customer_id = $1
      AND processing_started_at IS NOT NULL
      AND processing_completed_at IS NOT NULL
      AND processing_completed_at > processing_started_at`,
    [customerId],
  );

  const row = rows[0];
  return {
    avg_ms: row?.avg_ms ? Math.round(Number(row.avg_ms)) : null,
    p95_ms: row?.p95_ms ? Math.round(Number(row.p95_ms)) : null,
  };
}
