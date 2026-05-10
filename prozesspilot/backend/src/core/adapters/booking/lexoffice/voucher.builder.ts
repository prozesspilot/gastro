/**
 * M05 — Voucher-Builder.
 *
 * Mappt einen ProzessPilot-Receipt auf einen Lexoffice-Voucher exakt nach
 * M05-Spec §8. Kontaktauflösung und Kategorie-Mapping passieren später im
 * Handler, weil sie async DB-/API-Calls erfordern.
 */

import type { Receipt } from '../../../../modules/_shared/receipts/receipt.repository';
import type { LexofficeUuid, LexofficeVoucher, LexofficeVoucherItem } from './lexoffice.types';

export interface BuildVoucherInput {
  receipt: Receipt;
  /** Schon aufgelöste Lexoffice-Kategorie. */
  lexofficeCategoryId: LexofficeUuid;
  /** Kontakt-ID falls bekannt; sonst null → Sammel-Kreditor. */
  contactId?: LexofficeUuid | null;
  /** Override für memo (z. B. via Hook). */
  memoOverride?: string;
}

export function buildLexofficeVoucher(input: BuildVoucherInput): LexofficeVoucher {
  const { receipt, lexofficeCategoryId, contactId } = input;
  const fields = ((receipt.extraction as { fields?: Record<string, unknown> } | undefined)
    ?.fields ?? {}) as {
    document_number?: string;
    document_date?: string;
    total_gross?: number;
    total_net?: number;
    tax_lines?: Array<{ rate: number; base: number; amount: number }>;
  };
  const cat = (receipt.categorization as { cost_center?: string } | undefined) ?? {};

  const totalGross = round2(fields.total_gross ?? 0);
  const totalTax = round2(sumTaxAmounts(fields.tax_lines ?? []));
  const dominantPercent = round2(dominantTaxRate(fields.tax_lines ?? []) * 100);

  const item: LexofficeVoucherItem = {
    amount: totalGross,
    taxAmount: totalTax,
    taxRatePercent: dominantPercent,
    categoryId: lexofficeCategoryId,
  };

  const memoParts = [
    `ProzessPilot ${receipt.receipt_id}`,
    cat.cost_center ? `Kostenstelle: ${cat.cost_center}` : null,
  ].filter(Boolean);

  return {
    type: 'expense',
    voucherNumber: fields.document_number ?? receipt.receipt_id,
    voucherDate: fields.document_date ?? new Date().toISOString().slice(0, 10),
    shippingDate: fields.document_date,
    dueDate: fields.document_date,
    totalGrossAmount: totalGross,
    totalTaxAmount: totalTax,
    taxType: 'gross',
    useCollectiveContact: !contactId,
    ...(contactId ? { contactId } : {}),
    voucherItems: [item],
    memo: input.memoOverride ?? memoParts.join(' · '),
  };
}

export function dominantTaxRate(taxLines: Array<{ rate: number; amount: number }>): number {
  if (!taxLines.length) return 0;
  const sorted = [...taxLines].sort((a, b) => b.amount - a.amount);
  return sorted[0].rate;
}

export function sumTaxAmounts(taxLines: Array<{ amount: number }>): number {
  return taxLines.reduce((sum, t) => sum + (Number.isFinite(t.amount) ? t.amount : 0), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
