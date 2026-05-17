/**
 * M08 — Aggregator.
 *
 * Aggregiert receipts.payload (JSONB) für einen gegebenen Monat. Nutzt das
 * Welt-A-Schema (TEXT customer_id, payload-JSONB, status). Receipts mit
 * Status 'archived', 'exported', 'completed' fließen ins Reporting ein.
 *
 * Fallback: Wenn der payload->extraction->fields keine total_gross enthält,
 * ignorieren wir die Zeile bei Summen.
 */

import type { Pool } from 'pg';

export interface MonthlyTotals {
  customer_id: string;
  period: string; // 'YYYY-MM'
  receipts_count: number;
  gross_sum: number;
  net_sum: number;
  top_categories: Array<{ id: string; label: string; n: number; gross_sum: number }>;
  top_suppliers: Array<{ supplier: string; n: number; gross_sum: number }>;
  trend_pct: number | null; // Differenz zum Vormonat in %
}

export interface BuildAggregationOptions {
  customerId: string;
  year: number;
  month: number; // 1-12
}

export async function buildMonthlyAggregation(
  pool: Pool,
  opts: BuildAggregationOptions,
): Promise<MonthlyTotals> {
  const { customerId, year, month } = opts;
  const period = `${year}-${String(month).padStart(2, '0')}`;

  const totals = await aggregateOne(pool, customerId, year, month);
  const prev = await aggregateOne(pool, customerId, prevYear(year, month), prevMonth(month));
  const trend = computeTrend(totals.gross_sum, prev.gross_sum);

  return {
    customer_id: customerId,
    period,
    receipts_count: totals.receipts_count,
    gross_sum: totals.gross_sum,
    net_sum: totals.net_sum,
    top_categories: totals.top_categories,
    top_suppliers: totals.top_suppliers,
    trend_pct: trend,
  };
}

interface AggOnePart {
  receipts_count: number;
  gross_sum: number;
  net_sum: number;
  top_categories: Array<{ id: string; label: string; n: number; gross_sum: number }>;
  top_suppliers: Array<{ supplier: string; n: number; gross_sum: number }>;
}

async function aggregateOne(
  pool: Pool,
  customerId: string,
  year: number,
  month: number,
): Promise<AggOnePart> {
  // Wir filtern auf created_at-Monat (M08-Spec §8 nennt document_date — aber
  // unsere _shared/receipts hält document_date nur in payload->extraction->fields).
  // Wir nutzen beides: bevorzugt fields.document_date, Fallback created_at.
  const totalsQ = await pool.query<{
    receipts_count: string;
    gross_sum: string | null;
    net_sum: string | null;
  }>(
    `SELECT COUNT(*)                                                                            AS receipts_count,
            COALESCE(SUM((payload->'extraction'->'fields'->>'total_gross')::numeric), 0)        AS gross_sum,
            COALESCE(SUM((payload->'extraction'->'fields'->>'total_net'  )::numeric), 0)        AS net_sum
       FROM receipts
      WHERE customer_id = $1
        AND status IN ('archived','exported','completed','categorized')
        AND COALESCE(
              to_date(payload->'extraction'->'fields'->>'document_date', 'YYYY-MM-DD'),
              created_at::date
            ) BETWEEN $2::date AND $3::date`,
    [customerId, firstDay(year, month), lastDay(year, month)],
  );
  const totalsRow = totalsQ.rows[0];

  const catRes = await pool.query<{
    id: string | null;
    label: string | null;
    n: string;
    gross_sum: string | null;
  }>(
    `SELECT payload->'categorization'->>'category'        AS id,
            payload->'categorization'->>'category_label'  AS label,
            COUNT(*)                                       AS n,
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
      LIMIT 5`,
    [customerId, firstDay(year, month), lastDay(year, month)],
  );

  const supRes = await pool.query<{
    supplier: string | null;
    n: string;
    gross_sum: string | null;
  }>(
    `SELECT payload->'extraction'->'fields'->>'supplier_name' AS supplier,
            COUNT(*) AS n,
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
      LIMIT 5`,
    [customerId, firstDay(year, month), lastDay(year, month)],
  );

  return {
    receipts_count: Number(totalsRow.receipts_count ?? 0),
    gross_sum: Number(totalsRow.gross_sum ?? 0),
    net_sum: Number(totalsRow.net_sum ?? 0),
    top_categories: catRes.rows.map((r) => ({
      id: r.id ?? 'unknown',
      label: r.label ?? r.id ?? 'unbekannt',
      n: Number(r.n),
      gross_sum: Number(r.gross_sum ?? 0),
    })),
    top_suppliers: supRes.rows.map((r) => ({
      supplier: r.supplier ?? 'unbekannt',
      n: Number(r.n),
      gross_sum: Number(r.gross_sum ?? 0),
    })),
  };
}

function firstDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function lastDay(year: number, month: number): string {
  // Last day = first day of next month - 1 day. Postgres handles `EOM` via interval.
  // Wir berechnen es lieber in JS.
  const next = new Date(year, month, 0); // month=12 → Dezember 31
  const y = next.getFullYear();
  const m = next.getMonth() + 1;
  const d = next.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function prevYear(year: number, month: number): number {
  return month === 1 ? year - 1 : year;
}

function prevMonth(month: number): number {
  return month === 1 ? 12 : month - 1;
}

function computeTrend(curr: number, prev: number): number | null {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}
