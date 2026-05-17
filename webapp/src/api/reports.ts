/**
 * API-Client für M08 Monatsreporting.
 */

import { apiBlob, apiRequest, unwrap } from './_client';

export interface ReportTotals {
  receipts_count: number;
  gross_sum: number;
  net_sum: number;
  trend_pct: number | null;
  top_categories: Array<{ id: string; label: string; n: number; gross_sum: number }>;
  top_suppliers: Array<{ supplier: string; n: number; gross_sum: number }>;
}

export interface Report {
  report_id: string;
  customer_id: string;
  period: string;
  status: 'building' | 'done' | 'failed';
  pdf_object_key: string | null;
  totals: ReportTotals | null;
  delivery_log: Array<{
    channel: string;
    to: string;
    status: string;
    delivered_at: string;
    error?: string;
  }>;
  created_at: string;
}

export interface BuildReportInput {
  period?: string;         // 'YYYY-MM', default = previous month
  customer_name?: string;
}

export interface DeliverReportInput {
  period: string;
  customer_profile?: Record<string, unknown>;
}

/** Bericht erstellen */
export async function buildReport(
  customerId: string,
  input: BuildReportInput = {},
): Promise<{ report_id: string; period: string; status: string; totals: ReportTotals | null }> {
  return unwrap(
    await apiRequest(`/customers/${customerId}/reports/monthly/build`, {
      method: 'POST',
      body: input,
    }),
  );
}

/** Bericht zustellen */
export async function deliverReport(
  customerId: string,
  input: DeliverReportInput,
): Promise<{ report_id: string; period: string; delivered: Array<{ channel: string; to: string; status: string }> }> {
  return unwrap(
    await apiRequest(`/customers/${customerId}/reports/monthly/deliver`, {
      method: 'POST',
      body: input,
    }),
  );
}

/** Alle Berichte eines Kunden laden */
export async function getReports(customerId: string): Promise<Report[]> {
  const result = unwrap<Report[]>(
    await apiRequest(`/customers/${customerId}/reports`),
  );
  return Array.isArray(result) ? result : [];
}

/** PDF-Download eines Reports (öffnet presigned URL) */
export async function downloadReport(customerId: string, reportId: string): Promise<Blob> {
  return apiBlob(`/customers/${customerId}/reports/${reportId}/download`);
}

/** Lexoffice-Push für einen Beleg */
export async function pushToLexoffice(
  receiptId: string,
  customerProfile: Record<string, unknown>,
): Promise<{ receipt_patch: { status: string; exports: unknown[] } }> {
  return unwrap(
    await apiRequest(`/receipts/${receiptId}/exports/lexoffice`, {
      method: 'POST',
      body: { customer_profile: customerProfile },
    }),
  );
}
