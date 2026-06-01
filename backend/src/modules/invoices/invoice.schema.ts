/**
 * T035 — Invoice-Schemas
 *
 * Zod-Validierung für Rechnungs-Operationen.
 * Alle wire-facing JSON-Felder sind snake_case (CLAUDE.md §6.2).
 */

import { z } from 'zod';

// ── Konstanten — Pricing-Pakete (CLAUDE.md §1 + 00_Strategie_Gastro.md) ──────

/**
 * Monatspreise (Brutto 19% USt) pro Paket in Cent.
 * Spec: Solo 39 €, Standard 79 €, Pro 149 €, Filiale 299 €.
 */
export const PACKAGE_MONTHLY_PRICE_BRUTTO_CENT: Record<string, number> = {
  solo:     3900,
  standard: 7900,
  pro:      14900,
  filiale:  29900,
};

/**
 * Setup-Fees (Brutto 19% USt) pro Paket in Cent.
 * Spec: Solo 299 €, Standard 499 €, Pro 799 €, Filiale 1499 €.
 */
export const PACKAGE_SETUP_FEE_BRUTTO_CENT: Record<string, number> = {
  solo:     29900,
  standard: 49900,
  pro:      79900,
  filiale:  149900,
};

/** Umsatzsteuersatz (19 %) */
export const UST_RATE = 0.19;

// ── Status ────────────────────────────────────────────────────────────────────

export const invoiceStatusSchema = z.enum([
  'gestellt',
  'bezahlt',
  'gemahnt_1',
  'gemahnt_2',
  'inkasso',
  'storniert',
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceTypeSchema = z.enum(['setup', 'monthly']);
export type InvoiceType = z.infer<typeof invoiceTypeSchema>;

// ── Response-Schema ───────────────────────────────────────────────────────────

export const invoiceResponseSchema = z.object({
  id:              z.string().uuid(),
  tenant_id:       z.string().uuid(),
  invoice_number:  z.string(),
  invoice_type:    invoiceTypeSchema,
  period_year:     z.number().int().nullable(),
  period_month:    z.number().int().min(1).max(12).nullable(),
  amount_netto:    z.number(),
  ust_rate:        z.number(),
  ust_amount:      z.number(),
  amount_brutto:   z.number(),
  pdf_path:        z.string().nullable(),
  status:          invoiceStatusSchema,
  paid_at:         z.string().nullable(),
  paid_amount:     z.number().nullable(),
  reminder_sent_at: z.string().nullable(),
  due_at:          z.string(),
  created_at:      z.string(),
  updated_at:      z.string(),
});
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;

// ── Query-Params für Listen-Endpoint ──────────────────────────────────────────

export const listInvoicesQuerySchema = z.object({
  tenant_id:  z.string().uuid().optional(),
  status:     invoiceStatusSchema.optional(),
  type:       invoiceTypeSchema.optional(),
  year:       z.coerce.number().int().min(2020).max(2100).optional(),
  month:      z.coerce.number().int().min(1).max(12).optional(),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
  offset:     z.coerce.number().int().min(0).default(0),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

// ── Path-Params ───────────────────────────────────────────────────────────────

export const invoiceParamsSchema = z.object({
  id: z.string().uuid(),
});
export type InvoiceParams = z.infer<typeof invoiceParamsSchema>;

// ── Mark-as-paid Body ─────────────────────────────────────────────────────────

export const markPaidBodySchema = z.object({
  paid_amount: z.number().positive().optional(),
  paid_at:     z.string().datetime().optional(),
});
export type MarkPaidBody = z.infer<typeof markPaidBodySchema>;

// ── DB-Row (intern) ───────────────────────────────────────────────────────────

export interface InvoiceRow {
  id:               string;
  tenant_id:        string;
  invoice_number:   string;
  invoice_type:     string;
  period_year:      number | null;
  period_month:     number | null;
  amount_netto:     string;   // pg gibt DECIMAL als string zurück
  ust_rate:         string;
  ust_amount:       string;
  amount_brutto:    string;
  pdf_path:         string | null;
  status:           string;
  paid_at:          Date | null;
  paid_amount:      string | null;
  reminder_sent_at: Date | null;
  due_at:           Date;
  created_at:       Date;
  updated_at:       Date;
}

/** Konvertiert einen DB-Row in ein wire-facing Response-Objekt. */
export function rowToInvoiceResponse(row: InvoiceRow): InvoiceResponse {
  return {
    id:              row.id,
    tenant_id:       row.tenant_id,
    invoice_number:  row.invoice_number,
    invoice_type:    row.invoice_type as InvoiceType,
    period_year:     row.period_year,
    period_month:    row.period_month,
    amount_netto:    parseFloat(row.amount_netto),
    ust_rate:        parseFloat(row.ust_rate),
    ust_amount:      parseFloat(row.ust_amount),
    amount_brutto:   parseFloat(row.amount_brutto),
    pdf_path:        row.pdf_path,
    status:          row.status as InvoiceStatus,
    paid_at:         row.paid_at?.toISOString() ?? null,
    paid_amount:     row.paid_amount != null ? parseFloat(row.paid_amount) : null,
    reminder_sent_at: row.reminder_sent_at?.toISOString() ?? null,
    due_at:          row.due_at.toISOString().slice(0, 10),
    created_at:      row.created_at.toISOString(),
    updated_at:      row.updated_at.toISOString(),
  };
}
