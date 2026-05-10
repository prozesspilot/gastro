/**
 * M10 — Webhook-Payload-Schema (Meta WhatsApp Business Cloud API)
 *
 * Validiert das eingehende JSON aus M10 §5.1.
 * Im Backend nur in Tests/Hilfsfunktionen verwendet — der Webhook selbst
 * landet in n8n (siehe WF-INPUT-WHATSAPP).
 */

import { z } from 'zod';

// ── Image / Document / Text-Inhalte ──────────────────────────────────────────

export const waImageSchema = z.object({
  id: z.string().min(1),
  mime_type: z.string().min(1),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'sha256 muss 64 Hex-Zeichen sein')
    .optional(),
  caption: z.string().optional(),
});

export const waDocumentSchema = z.object({
  id: z.string().min(1),
  mime_type: z.string().min(1),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});

export const waTextSchema = z.object({
  body: z.string(),
});

// ── Message ───────────────────────────────────────────────────────────────────

export const waMessageSchema = z.object({
  from: z.string().min(5),
  id: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.enum(['image', 'document', 'text', 'audio', 'video', 'sticker', 'location', 'contacts']),
  image: waImageSchema.optional(),
  document: waDocumentSchema.optional(),
  text: waTextSchema.optional(),
});

export const waContactSchema = z.object({
  profile: z.object({ name: z.string().optional() }).optional(),
  wa_id: z.string().min(1),
});

export const waMetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string().min(1),
});

export const waValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: waMetadataSchema,
  contacts: z.array(waContactSchema).optional(),
  messages: z.array(waMessageSchema).optional(),
  statuses: z.array(z.unknown()).optional(),
});

export const waChangeSchema = z.object({
  value: waValueSchema,
  field: z.string(),
});

export const waEntrySchema = z.object({
  id: z.string(),
  changes: z.array(waChangeSchema).min(1),
});

export const waWebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(waEntrySchema).min(1),
});

export type WaWebhookPayload = z.infer<typeof waWebhookPayloadSchema>;
export type WaMessage = z.infer<typeof waMessageSchema>;
export type WaImage = z.infer<typeof waImageSchema>;
export type WaDocument = z.infer<typeof waDocumentSchema>;
export type WaContact = z.infer<typeof waContactSchema>;
