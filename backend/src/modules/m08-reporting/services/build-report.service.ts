/**
 * T087/M08 — Orchestriert den Monats-Report-Build.
 *
 * aggregieren → PDF rendern → MinIO-Upload → `reports`-Upsert + Audit (atomar).
 * Reiner Service ohne HTTP — der Handler ruft `buildMonthlyReport` und mappt das
 * Ergebnis auf die Response (inkl. presigned Download-URL).
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import type { AuditActor } from '../../../core/audit/audit-log';
import { logAuditEvent } from '../../../core/audit/audit-log';
import { withTenant } from '../../../core/db/tenant';
import { uploadObject } from '../../../core/storage/storage.service';
import { type MonthlyAggregates, computeMonthlyAggregates } from './aggregator';
import { renderMonthlyReportPdf } from './report-pdf';
import { getTenantName, upsertReportRow } from './report.repository';

export interface BuildReportDeps {
  db: Pool;
  s3: S3Client;
}

export interface BuildReportResult {
  reportId: string;
  period: { year: number; month: number };
  totals: MonthlyAggregates;
  pdfObjectKey: string;
  createdAt: Date;
}

/** Objekt-Key des Report-PDF in MinIO. */
export function reportObjectKey(tenantId: string, year: number, month: number): string {
  return `${tenantId}/reports/${year}-${String(month).padStart(2, '0')}/monthly.pdf`;
}

/**
 * Baut den Monats-Report für (year, month). Idempotent: erneuter Build desselben
 * Monats überschreibt PDF + Row. `now` ist injizierbar (deterministische Tests).
 */
export async function buildMonthlyReport(
  deps: BuildReportDeps,
  tenantId: string,
  year: number,
  month: number,
  opts: { actor: AuditActor; now?: Date },
): Promise<BuildReportResult> {
  const { db, s3 } = deps;

  const totals = await computeMonthlyAggregates(db, tenantId, year, month);
  const tenantName = await getTenantName(db, tenantId);
  const pdf = await renderMonthlyReportPdf(totals, { tenantName, now: opts.now });

  const objectKey = reportObjectKey(tenantId, year, month);
  await uploadObject(s3, objectKey, pdf, 'application/pdf');

  const { id, created_at } = await withTenant(db, tenantId, async (client) => {
    const row = await upsertReportRow(client, tenantId, {
      periodYear: year,
      periodMonth: month,
      totals,
      pdfObjectKey: objectKey,
    });
    // Audit in derselben Transaktion wie der Upsert (GoBD-Atomicity). Kein PII —
    // nur Periode + Anzahl/Brutto-Aggregat.
    await logAuditEvent(client, {
      tenantId,
      entityType: 'report',
      entityId: row.id,
      eventType: 'report.monthly_built',
      actor: opts.actor,
      payloadAfter: {
        period_year: year,
        period_month: month,
        receipts_count: totals.totals.receipts_count,
        gross_sum: totals.totals.gross_sum,
      },
      metadata: { pdf_object_key: objectKey },
    });
    return row;
  });

  return {
    reportId: id,
    period: { year, month },
    totals,
    pdfObjectKey: objectKey,
    createdAt: created_at,
  };
}
