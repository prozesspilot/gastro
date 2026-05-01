/**
 * API-Client für Stats-Aggregationen (Block D).
 */

import { apiRequest, unwrap } from './_client';

export interface ReceiptsByMonth {
  year: number;
  month: number;
  count: number;
  gross_sum: number;
}

export interface CategoryStat {
  category_name: string;
  category_id: string;
  count: number;
  gross_sum: number;
}

export interface SupplierStat {
  supplier_name: string;
  count: number;
  gross_sum: number;
}

export interface ExportRate {
  lexoffice: number;
  datev: number;
}

export interface ProcessingTimes {
  avg_ms: number | null;
  p95_ms: number | null;
}

export interface CustomerStats {
  customer_id: string;
  receipts_by_month: ReceiptsByMonth[];
  by_category: CategoryStat[];
  top_suppliers: SupplierStat[];
  export_rate: ExportRate;
  processing_times: ProcessingTimes;
}

export async function getCustomerStats(
  customerId: string,
  opts?: { from?: string; to?: string },
): Promise<CustomerStats> {
  const params = new URLSearchParams();
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return unwrap(await apiRequest(`/customers/${customerId}/stats${qs}`));
}
