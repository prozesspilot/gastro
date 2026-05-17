/**
 * M01 — Ausgabeschema für POST /api/v1/receipts/:receipt_id/extract.
 *
 * Form aus M01 §5.2 / 5.3 — ok-true mit `receipt_patch` und Liste der
 * `events_to_emit`. Diese Form deckt sowohl Erfolgs- als auch
 * Low-Confidence-Pfad (requires_review) ab.
 */

import { z } from 'zod';

const taxLineSchema = z.object({
  rate: z.number(),
  base: z.number(),
  amount: z.number(),
});

const lineItemSchema = z.object({
  description: z.string(),
  qty: z.number().optional(),
  unit_price: z.number().optional(),
  total: z.number().optional(),
  tax_rate: z.number().optional(),
});

const extractedFieldsSchema = z.object({
  supplier_name: z.string().optional(),
  supplier_address: z.string().optional(),
  supplier_vat_id: z.string().optional(),
  document_number: z.string().optional(),
  document_date: z.string().optional(),
  document_type: z.enum(['invoice', 'receipt', 'credit_note', 'other']).optional(),
  currency: z.string().optional(),
  total_gross: z.number().optional(),
  total_net: z.number().optional(),
  tax_lines: z.array(taxLineSchema).optional(),
  line_items: z.array(lineItemSchema).optional(),
  payment_method: z.string().optional(),
});

const extractionSchema = z.object({
  engine: z.enum(['google_vision', 'mindee']),
  engine_version: z.string(),
  confidence: z.number().min(0).max(1),
  raw_text: z.string(),
  fields: extractedFieldsSchema,
  warnings: z.array(z.string()).default([]),
});

const validationSchema = z.object({
  is_valid: z.boolean(),
  issues: z.array(
    z.object({
      code: z.string(),
      field: z.string().optional(),
      message: z.string(),
    }),
  ),
  checks: z.object({
    totals_match: z.boolean(),
    tax_lines_consistent: z.boolean(),
    supplier_known: z.boolean(),
    document_date_plausible: z.boolean(),
    duplicate: z.boolean(),
    currency_supported: z.boolean(),
  }),
});

export const extractOutputSchema = z.object({
  ok: z.literal(true),
  module: z.literal('M01'),
  receipt_patch: z.object({
    status: z.enum(['extracted', 'requires_review']),
    extraction: extractionSchema,
    validation: validationSchema,
  }),
  events_to_emit: z.array(z.string()),
});

export type ExtractOutput = z.infer<typeof extractOutputSchema>;
