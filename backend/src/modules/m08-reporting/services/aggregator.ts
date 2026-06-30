/**
 * T087/M08 — Monats-Aggregation über die `belege`-Tabelle.
 *
 * Portierung der M08-Spec §8 auf die **belege-Welt**: die Spec-SQL liest aus
 * `receipts.payload->...` (tote Geister-Tabelle). Wir nutzen stattdessen die
 * **denormalisierten `belege`-Spalten** (`total_gross`, `category`,
 * `supplier_name`, `document_date`, `status`) — schneller und ohne JSONB-Pfade.
 *
 * Nur **verbuchte** Belege fließen ein (Status-Whitelist {@link BOOKED_STATUS}):
 * ein Beleg in `received`/`extracted`/`requires_review` ist noch nicht final und
 * würde die Monatszahlen verfälschen.
 *
 * NUMERIC-Falle: `total_gross` ist `NUMERIC(12,2)` → der pg-Driver liefert
 * String. Wir casten in der Query auf `float8` und coercen defensiv (kein
 * globaler `setTypeParser` im Repo).
 */

import type { Pool } from 'pg';
import { withTenant } from '../../../core/db/tenant';
import { findCategory } from '../../m03-categorization/system-categories';
import { type UstSplit, computeUstSplit } from './ust-split';

/** Status, ab dem ein Beleg als verbucht gilt und in die Monatszahlen einfließt. */
export const BOOKED_STATUS = [
  'categorized',
  'archiving',
  'archived',
  'exporting',
  'exported',
  'completed',
] as const;

export interface CategoryAggregate {
  category: string;
  label: string;
  count: number;
  gross_sum: number;
}

export interface SupplierAggregate {
  supplier: string;
  count: number;
  gross_sum: number;
}

export interface MonthlyAggregates {
  period: { year: number; month: number };
  totals: {
    receipts_count: number;
    gross_sum: number;
    largest_single: number;
  };
  by_category: CategoryAggregate[];
  top_suppliers: SupplierAggregate[];
  /** USt-Split (19/7/0 + nicht zuordenbar) — für die Steuerberater-Übergabe (T089). */
  ust_split: UstSplit;
  comparison_prev_month: {
    gross_sum: number;
    /** Prozentuale Veränderung ggü. Vormonat; null, wenn Vormonat 0 war (Division undefiniert). */
    delta_percent: number | null;
  };
  /** Belege ohne erkanntes `document_date` (fallen aus dem Monatsfenster). */
  receipts_without_date: number;
}

/** Label für eine Kategorie-ID; null/unbekannt → Sammelzeile „Nicht kategorisiert". */
function categoryLabel(category: string | null): { category: string; label: string } {
  if (!category) return { category: 'uncategorized', label: 'Nicht kategorisiert' };
  return { category, label: findCategory(category)?.name ?? category };
}

function coerceNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Erster Tag des Monats als ISO-`YYYY-MM-DD` (Monatsfenster `>= start`). */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Erster Tag des Folgemonats (exklusive Obergrenze `< nextStart`). */
function nextMonthStart(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/**
 * Aggregiert alle verbuchten Belege eines Tenants für (year, month). Läuft
 * tenant-scoped (RLS via `withTenant`) — Belege anderer Tenants sind unsichtbar.
 */
export async function computeMonthlyAggregates(
  db: Pool,
  tenantId: string,
  year: number,
  month: number,
): Promise<MonthlyAggregates> {
  const start = monthStart(year, month);
  const end = nextMonthStart(year, month);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevStart = monthStart(prevYear, prevMonth);
  const prevEnd = start; // Vormonat endet, wo der aktuelle Monat beginnt.

  const statusList = [...BOOKED_STATUS];

  // Das explizite `tenant_id = $1` ist Defense-in-depth ZUSÄTZLICH zur RLS
  // (withTenant setzt den GUC): ein Geld-Aggregat soll nicht allein vom
  // Session-GUC abhängen — und der Filter macht die Tenant-Isolation auch unter
  // einer RLS-bypassenden Rolle (Superuser im Test) testbar.
  return withTenant(db, tenantId, async (client) => {
    const totalsRes = await client.query(
      `SELECT COUNT(*)::int                          AS receipts_count,
              COALESCE(SUM(total_gross), 0)::float8  AS gross_sum,
              COALESCE(MAX(total_gross), 0)::float8   AS largest_single
         FROM belege
        WHERE tenant_id = $1
          AND status = ANY($2)
          AND document_date >= $3::date
          AND document_date <  $4::date`,
      [tenantId, statusList, start, end],
    );

    const byCategoryRes = await client.query(
      `SELECT category,
              COUNT(*)::int                          AS count,
              COALESCE(SUM(total_gross), 0)::float8  AS gross_sum
         FROM belege
        WHERE tenant_id = $1
          AND status = ANY($2)
          AND document_date >= $3::date
          AND document_date <  $4::date
        GROUP BY category
        ORDER BY gross_sum DESC`,
      [tenantId, statusList, start, end],
    );

    const topSuppliersRes = await client.query(
      `SELECT COALESCE(supplier_name, 'Unbekannt')   AS supplier,
              COUNT(*)::int                          AS count,
              COALESCE(SUM(total_gross), 0)::float8  AS gross_sum
         FROM belege
        WHERE tenant_id = $1
          AND status = ANY($2)
          AND document_date >= $3::date
          AND document_date <  $4::date
        GROUP BY COALESCE(supplier_name, 'Unbekannt')
        ORDER BY gross_sum DESC
        LIMIT 10`,
      [tenantId, statusList, start, end],
    );

    const prevRes = await client.query(
      `SELECT COALESCE(SUM(total_gross), 0)::float8  AS gross_sum
         FROM belege
        WHERE tenant_id = $1
          AND status = ANY($2)
          AND document_date >= $3::date
          AND document_date <  $4::date`,
      [tenantId, statusList, prevStart, prevEnd],
    );

    const noDateRes = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM belege
        WHERE tenant_id = $1
          AND status = ANY($2)
          AND document_date IS NULL`,
      [tenantId, statusList],
    );

    // USt-Split: braucht den `payload` je Beleg (Satz aus extraction.fields).
    // Eigene Query (nicht in den Aggregat-Queries oben, die nur denormalisierte
    // Spalten lesen) — selber Monats-/Status-Filter wie `gross_sum`, damit
    // Σ(Split) == gross_sum reconciled.
    const ustRowsRes = await client.query(
      `SELECT total_gross, payload
         FROM belege
        WHERE tenant_id = $1
          AND status = ANY($2)
          AND document_date >= $3::date
          AND document_date <  $4::date`,
      [tenantId, statusList, start, end],
    );
    const ustSplit = computeUstSplit(
      ustRowsRes.rows.map((r) => ({
        total_gross: r.total_gross,
        payload: (r.payload as Record<string, unknown> | null) ?? {},
      })),
    );

    const grossSum = coerceNum(totalsRes.rows[0].gross_sum);
    const prevGross = coerceNum(prevRes.rows[0].gross_sum);
    const deltaPercent =
      prevGross > 0 ? Math.round(((grossSum - prevGross) / prevGross) * 1000) / 10 : null;

    return {
      period: { year, month },
      totals: {
        receipts_count: coerceNum(totalsRes.rows[0].receipts_count),
        gross_sum: grossSum,
        largest_single: coerceNum(totalsRes.rows[0].largest_single),
      },
      by_category: byCategoryRes.rows.map((r) => {
        const { category, label } = categoryLabel(r.category);
        return { category, label, count: coerceNum(r.count), gross_sum: coerceNum(r.gross_sum) };
      }),
      top_suppliers: topSuppliersRes.rows.map((r) => ({
        supplier: r.supplier,
        count: coerceNum(r.count),
        gross_sum: coerceNum(r.gross_sum),
      })),
      ust_split: ustSplit,
      comparison_prev_month: { gross_sum: prevGross, delta_percent: deltaPercent },
      receipts_without_date: coerceNum(noDateRes.rows[0].n),
    };
  });
}
