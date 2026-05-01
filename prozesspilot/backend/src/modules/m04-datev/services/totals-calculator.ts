/**
 * M04 — Totals Calculator.
 * Berechnet Summen über alle Receipts eines DATEV-Exports.
 */

import type { Receipt } from '../../_shared/receipts/receipt.repository';

export interface DatevTotals {
  gross_sum: number;
  net_sum: number;
  tax_sum: number;
  receipts_count: number;
}

/**
 * Summiert Brutto-, Netto- und Steuerbetrag über alle übergebenen Receipts.
 */
export function calculateTotals(receipts: Receipt[]): DatevTotals {
  let gross_sum = 0;
  let net_sum = 0;
  let tax_sum = 0;

  for (const receipt of receipts) {
    const fields = (
      (receipt.extraction as { fields?: Record<string, unknown> } | undefined)?.fields ?? {}
    ) as {
      total_gross?: number;
      total_net?: number;
      tax_lines?: Array<{ amount: number }>;
    };

    const gross = Number(fields.total_gross ?? 0);
    const net = Number(fields.total_net ?? gross);
    const tax = (fields.tax_lines ?? []).reduce((sum, t) => sum + Number(t.amount ?? 0), 0);

    gross_sum += gross;
    net_sum += net;
    tax_sum += tax;
  }

  return {
    gross_sum: round2(gross_sum),
    net_sum: round2(net_sum),
    tax_sum: round2(tax_sum),
    receipts_count: receipts.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
