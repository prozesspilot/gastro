/**
 * M07 — Eingabeschema für POST /api/v1/receipts/:receipt_id/exports/spreadsheet
 *
 * Body enthält das Customer-Profile-Slice mit der Spreadsheet-Konfiguration
 * (M07 §5.1, 02 §2.2).
 */

import { z } from 'zod';

const extraColumnSchema = z.object({
  header: z.string().min(1),
  jsonpath: z.string().min(1),
});

const spreadsheetConfigSchema = z.object({
  sheet_id: z.string().min(1),
  /** Default: "Belege {year}" */
  tab_name_template: z.string().min(1).optional(),
  /** Legacy-Schreibweise aus 02 §2.2 (alte Profile). Wird als Template behandelt. */
  tab_name: z.string().min(1).optional(),
  append_mode: z.boolean().optional(),
});

const spreadsheetIntegrationSchema = z.object({
  provider: z.enum(['google_sheets', 'excel_onedrive']),
  enabled: z.boolean().optional(),
  config: spreadsheetConfigSchema,
});

const customerProfileSchema = z
  .object({
    customer_id: z.string().min(1),
    package: z.enum(['basic', 'standard', 'pro']).optional(),
    modules_enabled: z.array(z.string()).optional(),
    integrations: z
      .object({
        spreadsheet: spreadsheetIntegrationSchema,
      })
      .passthrough(),
    routing: z.record(z.unknown()).optional(),
    custom: z
      .object({
        spreadsheet_extra_columns: z.array(extraColumnSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const appendInputSchema = z.object({
  customer_profile: customerProfileSchema,
  trace_id: z.string().optional(),
});

export type AppendInput = z.infer<typeof appendInputSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type ExtraColumnInput = z.infer<typeof extraColumnSchema>;
