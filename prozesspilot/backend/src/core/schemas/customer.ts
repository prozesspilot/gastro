/**
 * D4 — Customer-Schemas
 *
 * Validierung für Kunden-Operationen (D5 implementiert die API).
 *
 * PII-Felder (name, email, tax_number) werden in der DB verschlüsselt
 * gespeichert. Die Schemas arbeiten mit den Klartextwerten — die
 * Verschlüsselung/Entschlüsselung passiert im Repository-Layer (D5).
 */

import { z } from 'zod';
import {
  nonEmptyStringSchema,
  optionalStringSchema,
  paginationQuerySchema,
  sortOrderSchema,
  uuidSchema,
} from './common';

// ── Einzelne Felder ────────────────────────────────────────────────────────

const nameSchema = nonEmptyStringSchema
  .max(200, 'Name darf maximal 200 Zeichen lang sein.');

const emailSchema = z
  .string()
  .trim()
  .email('Muss eine gültige E-Mail-Adresse sein.')
  .max(254, 'E-Mail darf maximal 254 Zeichen lang sein.')
  .optional();

/** Steuernummer / USt-IdNr. — flexibles Format, nur Länge begrenzt */
const taxNumberSchema = z
  .string()
  .trim()
  .max(30, 'Steuernummer darf maximal 30 Zeichen lang sein.')
  .optional();

/** Externe ID, z. B. DATEV-Kundennummer */
const externalIdSchema = z
  .string()
  .trim()
  .max(100, 'Externe ID darf maximal 100 Zeichen lang sein.')
  .optional();

// ── Create ─────────────────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  /** Kundenname (wird verschlüsselt gespeichert) */
  name:        nameSchema,
  /** E-Mail-Adresse (optional, wird verschlüsselt gespeichert) */
  email:       emailSchema,
  /** Steuernummer (optional, wird verschlüsselt gespeichert) */
  tax_number:  taxNumberSchema,
  /** Externe Referenz-ID (nicht verschlüsselt, suchbar) */
  external_id: externalIdSchema,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ── Update ─────────────────────────────────────────────────────────────────

export const updateCustomerSchema = z
  .object({
    name:        nameSchema.optional(),
    email:       emailSchema,
    tax_number:  taxNumberSchema,
    external_id: externalIdSchema,
    active:      z.boolean().optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'Mindestens ein Feld muss angegeben werden.' },
  );

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ── Query-Parameter für Listenendpoint ────────────────────────────────────

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  /** Nur aktive / inaktive Kunden */
  active:      z.coerce.boolean().optional(),
  /** Freitextsuche in external_id */
  external_id: optionalStringSchema,
  /** Sortierfeld */
  sort_by:     z.enum(['created_at', 'updated_at', 'external_id']).default('created_at'),
  /** Sortierrichtung */
  sort_order:  sortOrderSchema,
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

// ── Response ───────────────────────────────────────────────────────────────

/**
 * Kundendaten wie sie die API nach außen gibt.
 * PII-Felder sind entschlüsselt, aber nie die rohen BYTEA-Werte.
 */
export const customerResponseSchema = z.object({
  id:          uuidSchema,
  tenant_id:   uuidSchema,
  /** Entschlüsselter Kundenname */
  name:        z.string(),
  /** Entschlüsselte E-Mail (null wenn nicht gesetzt) */
  email:       z.string().nullable(),
  /** Entschlüsselte Steuernummer (null wenn nicht gesetzt) */
  tax_number:  z.string().nullable(),
  external_id: z.string().nullable(),
  active:      z.boolean(),
  created_at:  z.string(),
  updated_at:  z.string(),
});

export type CustomerResponse = z.infer<typeof customerResponseSchema>;

// ── DB-Row (intern, vor Entschlüsselung) ──────────────────────────────────

/**
 * Wie ein Kunde direkt aus der Datenbank kommt.
 * Wird nur intern im Repository verwendet — nie nach außen gegeben.
 */
export interface CustomerRow {
  id:             string;
  tenant_id:      string;
  name_enc:       Buffer;
  email_enc:      Buffer | null;
  tax_number_enc: Buffer | null;
  external_id:    string | null;
  active:         boolean;
  created_at:     Date;
  updated_at:     Date;
}
