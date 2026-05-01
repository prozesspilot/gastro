/**
 * D4 — Tenant-Schemas
 *
 * Validierung für Mandanten-Operationen.
 * Mandanten sind die oberste Ebene im Multi-Tenant-System
 * (z. B. eine Steuerberatungskanzlei oder ein Endkunde).
 */

import { z } from 'zod';
import { nonEmptyStringSchema, slugSchema, uuidSchema } from './common';

// ── Create ─────────────────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  /** URL-sicherer Bezeichner, z. B. "mustermann-gmbh" */
  slug: slugSchema,
  /** Anzeigename des Mandanten */
  name: nonEmptyStringSchema.max(200, 'Name darf maximal 200 Zeichen lang sein.'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// ── Update ─────────────────────────────────────────────────────────────────

export const updateTenantSchema = z
  .object({
    name:   nonEmptyStringSchema.max(200).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Mindestens ein Feld muss angegeben werden.' },
  );

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ── Response ───────────────────────────────────────────────────────────────

/** Wie ein Tenant aus der DB kommt (nach Entschlüsselung, vor dem Senden) */
export const tenantResponseSchema = z.object({
  id:         uuidSchema,
  slug:       slugSchema,
  name:       z.string(),
  active:     z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TenantResponse = z.infer<typeof tenantResponseSchema>;
