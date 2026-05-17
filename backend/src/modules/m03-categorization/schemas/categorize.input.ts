/**
 * M03 — Zod-Schema für POST /api/v1/receipts/:receipt_id/categorize
 *
 * Body: { customer_profile: CustomerProfile, trace_id?: string }
 *
 * customer_profile-Struktur ist bewusst weich definiert (passthrough),
 * weil das vollständige Profil-Schema in 02_Kundenprofil_System.md liegt
 * und je nach Kunde sehr verschieden sein kann (Pro-Custom-Felder).
 */

import { z } from 'zod';

const customerProfileSchema = z
  .object({
    customer_id: z.string().min(1, 'customer_id darf nicht leer sein'),
    package: z.string().optional(),
    modules_enabled: z.array(z.string()).optional(),
    integrations: z.record(z.unknown()).optional(),
    routing: z
      .object({
        skr_chart: z.enum(['SKR03', 'SKR04']).optional(),
        low_confidence_threshold: z.number().min(0).max(1).optional(),
        tax_keys_map: z.record(z.string()).optional(),
        ki_kategorisierung: z.boolean().optional(),
        categorization_engine: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    custom: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const categorizeInputSchema = z.object({
  customer_profile: customerProfileSchema,
  trace_id: z.string().optional(),
});

export type CategorizeInput = z.infer<typeof categorizeInputSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
