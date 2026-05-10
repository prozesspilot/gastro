/**
 * D4 — Document-Inbox-Schemas
 *
 * Validierung für eingehende Belege (PDFs, Bilder).
 * Der tatsächliche Upload läuft über MinIO (D8) —
 * diese Schemas beschreiben die Metadaten.
 */

import { z } from 'zod';
import { nonEmptyStringSchema, paginationQuerySchema, uuidSchema } from './common';

// ── Status ─────────────────────────────────────────────────────────────────

export const documentStatusSchema = z.enum(['pending', 'processing', 'done', 'error']);

export type DocumentStatus = z.infer<typeof documentStatusSchema>;

// ── Erlaubte MIME-Types ────────────────────────────────────────────────────

export const allowedContentTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
] as const;

export const contentTypeSchema = z.enum(allowedContentTypes, {
  errorMap: () => ({
    message: `Erlaubte Dateitypen: ${allowedContentTypes.join(', ')}`,
  }),
});

// ── Create (Metadaten beim Upload) ─────────────────────────────────────────

export const createDocumentSchema = z.object({
  /** MinIO-Object-Key des hochgeladenen Dokuments */
  storage_key: nonEmptyStringSchema.max(500),
  /** Originaler Dateiname */
  original_name: nonEmptyStringSchema.max(255),
  /** MIME-Type */
  content_type: contentTypeSchema,
  /** Dateigröße in Bytes */
  size_bytes: z
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024), // max. 100 MB
  /** Optional: bereits bekannter Kunden-Bezug */
  customer_id: uuidSchema.optional(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

// ── Update (Routing-Tag setzen, Status aktualisieren) ─────────────────────

export const updateDocumentSchema = z
  .object({
    status: documentStatusSchema.optional(),
    error_message: z.string().max(1000).optional(),
    routing_tag: z.string().max(100).optional(),
    customer_id: uuidSchema.optional(),
    processed_at: z.string().datetime().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'Mindestens ein Feld muss angegeben werden.',
  });

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

// ── Query-Parameter für Listenendpoint ────────────────────────────────────

export const listDocumentsQuerySchema = paginationQuerySchema.extend({
  status: documentStatusSchema.optional(),
  customer_id: uuidSchema.optional(),
  routing_tag: z.string().max(100).optional(),
  sort_by: z.enum(['received_at', 'processed_at', 'size_bytes']).default('received_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// ── Response ───────────────────────────────────────────────────────────────

export const documentResponseSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  customer_id: uuidSchema.nullable(),
  storage_key: z.string(),
  original_name: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
  status: documentStatusSchema,
  error_message: z.string().nullable(),
  routing_tag: z.string().nullable(),
  received_at: z.string(),
  processed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DocumentResponse = z.infer<typeof documentResponseSchema>;
