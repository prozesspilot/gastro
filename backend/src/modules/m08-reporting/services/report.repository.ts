/**
 * T087/M08 — Repository für die `reports`-Tabelle (belege-Welt, RLS via withTenant).
 *
 * `upsertReportRow` läuft mit einem bereits offenen PoolClient (innerhalb einer
 * `withTenant`-Transaktion), damit der Report-Insert + das Audit-Event atomar in
 * derselben Transaktion landen (GoBD). `getReportById`/`getTenantName` sind
 * eigenständige Lesezugriffe.
 */

import type { Pool, PoolClient } from 'pg';
import { withTenant } from '../../../core/db/tenant';
import type { MonthlyAggregates } from './aggregator';

export interface ReportRow {
  id: string;
  tenant_id: string;
  period_year: number;
  period_month: number;
  totals: MonthlyAggregates;
  pdf_object_key: string;
  created_at: Date;
}

export interface UpsertReportInput {
  periodYear: number;
  periodMonth: number;
  totals: MonthlyAggregates;
  pdfObjectKey: string;
}

/**
 * Legt einen Report an oder überschreibt den vorhandenen (Idempotenz pro
 * Tenant+Monat via UNIQUE-Constraint). Erwartet einen Client mit aktiver
 * Transaktion + gesetztem Tenant-GUC.
 */
export async function upsertReportRow(
  client: PoolClient,
  tenantId: string,
  input: UpsertReportInput,
): Promise<{ id: string; created_at: Date }> {
  const res = await client.query(
    `INSERT INTO reports (tenant_id, period_year, period_month, totals, pdf_object_key)
       VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (tenant_id, period_year, period_month)
       DO UPDATE SET totals = EXCLUDED.totals,
                     pdf_object_key = EXCLUDED.pdf_object_key,
                     created_at = now()
     RETURNING id, created_at`,
    [
      tenantId,
      input.periodYear,
      input.periodMonth,
      JSON.stringify(input.totals),
      input.pdfObjectKey,
    ],
  );
  return { id: res.rows[0].id, created_at: res.rows[0].created_at };
}

/** Liest einen Report (tenant-scoped). null, wenn nicht vorhanden / fremder Tenant. */
export async function getReportById(
  db: Pool,
  tenantId: string,
  reportId: string,
): Promise<ReportRow | null> {
  return withTenant(db, tenantId, async (client) => {
    const res = await client.query(
      `SELECT id, tenant_id, period_year, period_month, totals, pdf_object_key, created_at
         FROM reports
        WHERE id = $1`,
      [reportId],
    );
    return (res.rows[0] as ReportRow | undefined) ?? null;
  });
}

/** Liest den Firmennamen des Tenants für den PDF-Kopf. Fallback „Mandant". */
export async function getTenantName(db: Pool, tenantId: string): Promise<string> {
  return withTenant(db, tenantId, async (client) => {
    const res = await client.query('SELECT legal_name FROM tenants WHERE id = $1', [tenantId]);
    const name = res.rows[0]?.legal_name;
    return typeof name === 'string' && name.trim() ? name : 'Mandant';
  });
}

export interface TenantHandoverInfo {
  /** Anzeige-/Firmenname für Betreff + Anrede (legal_name, sonst display_name, sonst „Mandant"). */
  tenantName: string;
  /** Steuerberater-Mail (Spalte advisor_email); null, wenn nicht hinterlegt. */
  advisorEmail: string | null;
}

/**
 * Liest die für die Steuerberater-Übergabe (T089) nötigen Tenant-Stammdaten:
 * Empfänger-Mail + Anzeige-Name. Tenant-scoped (RLS).
 */
export async function getTenantHandoverInfo(
  db: Pool,
  tenantId: string,
): Promise<TenantHandoverInfo> {
  return withTenant(db, tenantId, async (client) => {
    const res = await client.query(
      'SELECT legal_name, display_name, advisor_email FROM tenants WHERE id = $1',
      [tenantId],
    );
    const row = res.rows[0];
    const legal =
      typeof row?.legal_name === 'string' && row.legal_name.trim() ? row.legal_name : '';
    const display =
      typeof row?.display_name === 'string' && row.display_name.trim() ? row.display_name : '';
    const advisor =
      typeof row?.advisor_email === 'string' && row.advisor_email.trim() ? row.advisor_email : null;
    return {
      tenantName: legal || display || 'Mandant',
      advisorEmail: advisor,
    };
  });
}
