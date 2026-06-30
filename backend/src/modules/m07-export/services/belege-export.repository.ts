/**
 * M07 — Belege-Fetch für den CSV-Export (belege-Welt).
 *
 * Lädt alle VERBUCHTEN Belege eines Tenants für (year, month) tenant-scoped
 * (RLS via `withTenant`) und löst die für die CSV nötigen Felder aus den
 * denormalisierten Spalten + `payload` auf. Status-/Monats-Filter identisch zum
 * M08-Aggregator (`BOOKED_STATUS`, `document_date`-Fenster), damit dieselbe
 * Beleg-Menge wie im Monats-Report exportiert wird.
 */

import type { Pool } from 'pg';
import { withTenant } from '../../../core/db/tenant';
import { findCategory } from '../../m03-categorization/system-categories';
import { BOOKED_STATUS } from '../../m08-reporting/services/aggregator';
import type { BelegExportRow } from './belege-csv';

interface DbRow {
  id: string;
  document_date: Date | string | null;
  supplier_name: string | null;
  total_gross: number | string | null;
  currency: string | null;
  category: string | null;
  status: string;
  received_at: Date | string | null;
  payload: Record<string, unknown> | null;
}

interface ExtractionFields {
  document_number?: string;
  total_net?: number;
  tax_rate?: number;
  tax_lines?: Array<{ rate?: number; amount?: number }>;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoOf(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** Dominanter MwSt-Satz (Prozent) aus tax_rate oder dem größten tax_lines-Eintrag. */
function resolveTaxRate(fields: ExtractionFields): number | null {
  if (typeof fields.tax_rate === 'number') return fields.tax_rate;
  const lines = fields.tax_lines ?? [];
  if (lines.length === 0) return null;
  const dominant = [...lines].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
  return typeof dominant?.rate === 'number' ? Math.round(dominant.rate * 100) : null;
}

/** Σ tax_lines.amount, sonst brutto − netto, sonst null. */
function resolveTaxAmount(
  fields: ExtractionFields,
  gross: number | null,
  net: number | null,
): number | null {
  const lines = fields.tax_lines ?? [];
  if (lines.length > 0) {
    const sum = lines.reduce((s, l) => s + (typeof l.amount === 'number' ? l.amount : 0), 0);
    return Math.round(sum * 100) / 100;
  }
  if (gross !== null && net !== null) return Math.round((gross - net) * 100) / 100;
  return null;
}

function mapRow(row: DbRow): BelegExportRow {
  const payload = (row.payload ?? {}) as {
    extraction?: { fields?: ExtractionFields };
    categorization?: { skr_account?: string };
  };
  const fields = payload.extraction?.fields ?? {};
  const gross = num(row.total_gross);
  const net = num(fields.total_net);
  return {
    id: row.id,
    document_date: isoOf(row.document_date),
    supplier_name: row.supplier_name,
    document_number: fields.document_number ?? null,
    category: row.category,
    category_label: row.category ? (findCategory(row.category)?.name ?? null) : null,
    skr_account: payload.categorization?.skr_account ?? null,
    total_gross: gross,
    total_net: net,
    tax_amount: resolveTaxAmount(fields, gross, net),
    tax_rate: resolveTaxRate(fields),
    currency: row.currency ?? 'EUR',
    status: row.status,
    received_at: isoOf(row.received_at),
  };
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
function nextMonthStart(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Verbuchte Belege des Tenants für (year, month), sortiert nach Belegdatum. */
export async function fetchBelegeForMonth(
  db: Pool,
  tenantId: string,
  year: number,
  month: number,
): Promise<BelegExportRow[]> {
  const start = monthStart(year, month);
  const end = nextMonthStart(year, month);
  const statusList = [...BOOKED_STATUS];

  return withTenant(db, tenantId, async (client) => {
    // `tenant_id = $1` zusätzlich zur RLS (Defense-in-depth, wie M08-Aggregator).
    const res = await client.query<DbRow>(
      `SELECT id, document_date, supplier_name, total_gross, currency, category, status,
              received_at, payload
         FROM belege
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND status = ANY($2)
          AND document_date >= $3::date
          AND document_date <  $4::date
        ORDER BY document_date ASC, received_at ASC`,
      [tenantId, statusList, start, end],
    );
    return res.rows.map(mapRow);
  });
}
