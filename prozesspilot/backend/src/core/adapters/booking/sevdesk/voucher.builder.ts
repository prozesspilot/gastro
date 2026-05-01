/**
 * sevDesk Voucher-Builder (M06 §6).
 *
 * Mappt einen ProzessPilot-Receipt auf einen sevDesk-Voucher.
 * Account- und Tax-Mapping werden als Parameter übergeben (bereits aufgelöst).
 */

import type { Receipt } from '../../../../modules/_shared/receipts/receipt.repository';
import type {
  SevDeskVoucherFactory,
  SevDeskVoucherPos,
} from './types';

export interface BuildSevDeskVoucherInput {
  receipt: Receipt;
  /** Aufgelöste sevDesk AccountingType-ID */
  accountingTypeId: number;
  /** Aufgelöste sevDesk TaxRule-ID */
  taxRuleId: number;
}

export function buildSevDeskVoucher(
  input: BuildSevDeskVoucherInput,
): SevDeskVoucherFactory {
  const { receipt, accountingTypeId, taxRuleId } = input;

  const fields = (
    (receipt.extraction as { fields?: Record<string, unknown> } | undefined)?.fields ?? {}
  ) as {
    document_date?: string;
    document_number?: string;
    vendor_name?: string;
    total_gross?: number;
    total_net?: number;
    tax_lines?: Array<{ rate: number; base: number; amount: number }>;
  };

  const totalGross = round2(Number(fields.total_gross ?? 0));
  const totalNet = round2(Number(fields.total_net ?? totalGross));
  const totalTax = round2(totalGross - totalNet);

  // Dominanter Steuersatz (höchster absoluter Steueranteil)
  const taxRatePct = dominantTaxRatePct(fields.tax_lines ?? []);

  const voucherDate = fields.document_date ?? new Date().toISOString().slice(0, 10);
  const supplierName = (fields.vendor_name as string | undefined) ?? '';
  const description = truncate(fields.document_number ?? receipt.receipt_id, 255);

  // VoucherPos — eine Position für den Gesamtbetrag
  const voucherPos: SevDeskVoucherPos = {
    objectName: 'VoucherPos',
    mapAll: true,
    sumGross: totalGross,
    sumNet: totalNet,
    sumTax: totalTax,
    taxRate: taxRatePct,
    accountingType: {
      id: accountingTypeId,
      objectName: 'AccountingType',
    },
  };

  const voucher: SevDeskVoucherFactory = {
    objectName: 'Voucher',
    mapAll: true,
    voucherDate,
    supplierName: supplierName || 'Unbekannter Lieferant',
    status: 50, // offen
    description,
    creditDebit: 'C',   // Eingangsrechnung
    voucherType: 'VOU',
    sumGross: totalGross,
    sumNet: totalNet,
    sumTax: totalTax,
    currency: 'EUR',
    taxRule: {
      id: taxRuleId,
      objectName: 'TaxRule',
    },
    voucherPosSave: [voucherPos],
  };

  return voucher;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dominantTaxRatePct(
  taxLines: Array<{ rate: number; amount: number }>,
): number {
  if (!taxLines.length) return 19; // Default
  const sorted = [...taxLines].sort((a, b) => b.amount - a.amount);
  // rate kann als Dezimalzahl (0.19) oder Prozent (19) angegeben sein
  const rate = sorted[0].rate;
  return rate <= 1 ? Math.round(rate * 100) : Math.round(rate);
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}
