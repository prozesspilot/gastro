/**
 * M01 — Eingabeschema für POST /api/v1/receipts/:receipt_id/extract.
 *
 * Body enthält das Customer-Profile-Slice, das M01 für Routing-Schwellen,
 * OCR-Provider, supplier_overrides usw. braucht. Vollständiges JSON-Schema
 * des Profils siehe 02_Kundenprofil_System.md §2.2.
 */

import { z } from 'zod';

const supplierOverrideSchema = z
  .object({
    category: z.string().optional(),
    skr: z.string().optional(),
    cost_center: z.string().optional(),
    vat_id: z.string().optional(),
  })
  .passthrough();

const customerProfileSchema = z
  .object({
    customer_id: z.string().min(1),
    package: z.enum(['basic', 'standard', 'pro']).optional(),
    modules_enabled: z.array(z.string()).optional(),
    integrations: z
      .object({
        ocr: z
          .object({
            provider: z.enum(['google_vision', 'mindee']).default('google_vision'),
            config: z.record(z.unknown()).optional(),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
    routing: z
      .object({
        low_confidence_threshold: z.number().min(0).max(1).optional(),
        default_currency: z.string().optional(),
        supported_currencies: z.array(z.string()).optional(),
        min_amount_review: z.number().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    custom: z
      .object({
        supplier_overrides: z.record(supplierOverrideSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const extractInputSchema = z.object({
  customer_profile: customerProfileSchema,
  trace_id: z.string().optional(),
});

export type ExtractInput = z.infer<typeof extractInputSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
