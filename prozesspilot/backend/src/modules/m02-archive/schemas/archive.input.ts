/**
 * M02 — Eingabeschema für POST /api/v1/receipts/:receipt_id/archive.
 *
 * Body enthält das Customer-Profile-Slice mit `integrations.archive`
 * (Provider, Config, credentials_ref) und `routing`. Vollständiges
 * JSON-Schema des Profils siehe 02_Kundenprofil_System.md §2.2.
 */

import { z } from 'zod';

const archiveConfigSchema = z
  .object({
    root_folder_id: z.string().optional(),
    structure: z.string().min(1),
    filename_template: z.string().min(1),
    naming_collisions: z.enum(['append_counter']).default('append_counter'),
  })
  .passthrough();

const archiveIntegrationSchema = z
  .object({
    provider: z.enum(['google_drive', 'dropbox', 'webdav']),
    config: archiveConfigSchema,
    credentials_ref: z.string().optional(),
  })
  .passthrough();

const customerProfileSchema = z
  .object({
    customer_id: z.string().min(1),
    display_name: z.string().optional(),
    package: z.enum(['basic', 'standard', 'pro']).optional(),
    modules_enabled: z.array(z.string()).optional(),
    integrations: z
      .object({
        archive: archiveIntegrationSchema,
      })
      .passthrough(),
    routing: z.record(z.unknown()).optional(),
    custom: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const archiveInputSchema = z.object({
  customer_profile: customerProfileSchema,
  trace_id: z.string().optional(),
});

export type ArchiveInput = z.infer<typeof archiveInputSchema>;
export type ArchiveProfile = z.infer<typeof customerProfileSchema>;
export type ArchiveIntegration = z.infer<typeof archiveIntegrationSchema>;
