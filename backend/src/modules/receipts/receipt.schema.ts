/**
 * D4 — Receipt-Schemas
 *
 * Validierung für Receipt-Operationen.
 * Receipts sind Steuerbelege pro Tenant und Customer.
 */

import { z } from 'zod';
import { nonEmptyStringSchema, optionalStringSchema, uuidSchema } from '../../core/schemas/common';

// ── Einzelne Felder ────────────────────────────────────────────────────────

/** UUID des Customers (Required) */
const customerIdSchema = uuidSchema;

/** Originaldateiname */
const originalNameSchema = optionalStringSchema;

/** MIME-Type, z. B. 'application/pdf', 'image/jpeg' */
const mimeTypeSchema = optionalStringSchema;

/** Receipt-Status */
const statusSchema = z.enum([
  // Legacy (Backwards-Kompatibilität)
  'pending',
  'processing',
  'done',
  // Pipeline-Stati (Frontend M01–M08)
  'received',
  'extracting',
  'extracted',
  'categorizing',
  'categorized',
  'archiving',
  'archived',
  'exporting',
  'exported',
  'completed',
  'requires_review',
  // Fehler
  'error',
]);

/** Quelle des Belegs */
const sourceSchema = z.enum(['manual', 'whatsapp', 'email']).default('manual');

/** Fehlermeldung bei Status 'error' */
const errorMessageSchema = optionalStringSchema;

/** UUID für Receipt-ID */
const receiptIdSchema = uuidSchema;

// ── Create ─────────────────────────────────────────────────────────────────

export const createReceiptSchema = z.object({
  /** ID des Customers, zu dem dieser Receipt gehört */
  customer_id: customerIdSchema,
  /** Originaldateiname (optional) */
  original_name: originalNameSchema,
  /** MIME-Type der Datei (optional) */
  mime_type: mimeTypeSchema,
  /** Quelle des Belegs (optional, default: 'manual') */
  source: sourceSchema.optional(),
  /** SHA-256 Hash des Dateiinhalts (optional) — Dedup-Schlüssel */
  file_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Muss 64-stelliger Hex-SHA256 sein')
    .optional(),
});

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

// ── Update Receipt Status ──────────────────────────────────────────────────

export const updateReceiptStatusSchema = z.object({
  /** Neuer Status */
  status: statusSchema,
  /** Fehlermeldung (optional, relevant bei status='error') */
  error_message: errorMessageSchema,
});

export type UpdateReceiptStatusInput = z.infer<typeof updateReceiptStatusSchema>;

// ── Path Parameter ────────────────────────────────────────────────────────

export const receiptParamsSchema = z.object({
  /** Receipt-ID aus URL */
  id: receiptIdSchema,
});

export type ReceiptParams = z.infer<typeof receiptParamsSchema>;

// ── Query Parameter für Listenendpoint ────────────────────────────────────

export const listReceiptsQuerySchema = z.object({
  /** Filtern nach Customer-ID (optional) */
  customer_id: uuidSchema.optional(),
  /** Filtern nach Status (optional) */
  status: statusSchema.optional(),
  /** Volltextsuche (optional) — sucht in original_name, vendor, category, ocr_text */
  search: z.string().trim().min(1).optional(),
  /** Pagination: Limit (default 20, max 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Pagination: Offset (default 0) */
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;

// ── Response ───────────────────────────────────────────────────────────────

/**
 * Receipt-Daten wie sie die API nach außen gibt.
 */
export const receiptResponseSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  customer_id: uuidSchema,
  status: statusSchema,
  original_name: z.string().nullable(),
  mime_type: z.string().nullable(),
  storage_key: z.string().nullable(),
  file_size_bytes: z.number().int().nullable(),
  file_sha256: z.string().nullable(),
  source: sourceSchema,
  metadata: z.record(z.unknown()).default({}),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

// ── Database Row (intern) ──────────────────────────────────────────────────

/**
 * Wie ein Receipt direkt aus der Datenbank kommt.
 * Wird nur intern verwendet.
 */
export interface ReceiptRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  status: string;
  original_name: string | null;
  mime_type: string | null;
  storage_key: string | null;
  file_size_bytes: number | null;
  file_sha256: string | null;
  source: string;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Upload URL Response ────────────────────────────────────────────────────
// T033: upload_url (snake_case) — wire-facing JSON-Feld korrigiert.
// War: uploadUrl (camelCase). Wird noch nicht aktiv genutzt (Route TBD).

export const uploadUrlResponseSchema = z.object({
  upload_url: z.string().url(),
  key: z.string(),
});

export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

// ── Bulk-Status ────────────────────────────────────────────────────────────

export const bulkStatusSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(50),
  status: statusSchema,
});

export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;
