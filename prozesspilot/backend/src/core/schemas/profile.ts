/**
 * Customer-Profile-Schemas
 *
 * Validierung für Profil-Operationen (modul-spezifische Konfiguration,
 * Integrationen, Routing-Regeln, kundenspezifische Erweiterungen).
 *
 * Alle JSONB-Felder werden als unbegrenzte Records typisiert — die genaue
 * Form ist je nach Modul/Integration unterschiedlich und wird im jeweiligen
 * Modul-Layer geprüft.
 */

import { z } from 'zod';
import { uuidSchema } from './common';

// ── JSON-Bausteine ─────────────────────────────────────────────────────────

/** Liste aktivierter Module, z. B. ["m01-receipt-intake", "m02-archive"] */
const modulesEnabledSchema = z.array(z.string().trim().min(1)).default([]);

/** Beliebiges JSON-Objekt — Modul-spezifische Schemas validieren tiefer. */
const jsonObjectSchema = z.record(z.unknown()).default({});

// ── PUT (vollständiges Speichern) ──────────────────────────────────────────

/**
 * Vollständige Profil-Daten. Alle JSONB-Felder sind optional — fehlende
 * Felder werden mit ihrem Default ('[]' bzw. '{}') ersetzt.
 */
export const upsertProfileSchema = z.object({
  modules_enabled: modulesEnabledSchema.optional(),
  integrations:    jsonObjectSchema.optional(),
  routing:         jsonObjectSchema.optional(),
  custom:          jsonObjectSchema.optional(),
  updated_by:      z.string().trim().max(200).optional(),
  change_summary:  z.string().trim().max(500).optional(),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;

// ── PATCH (Partial Merge) ──────────────────────────────────────────────────

/**
 * Partial-Patch: nur die genannten Felder werden gemerged. Bei Objekt-Feldern
 * (integrations, routing, custom) erfolgt ein flacher Merge auf Top-Level-
 * Keys; modules_enabled wird vollständig ersetzt.
 */
export const patchProfileSchema = z
  .object({
    modules_enabled: modulesEnabledSchema.optional(),
    integrations:    z.record(z.unknown()).optional(),
    routing:         z.record(z.unknown()).optional(),
    custom:          z.record(z.unknown()).optional(),
    updated_by:      z.string().trim().max(200).optional(),
    change_summary:  z.string().trim().max(500).optional(),
  })
  .refine(
    (data) =>
      data.modules_enabled !== undefined ||
      data.integrations    !== undefined ||
      data.routing         !== undefined ||
      data.custom          !== undefined,
    { message: 'Mindestens ein Profilfeld muss angegeben werden.' },
  );

export type PatchProfileInput = z.infer<typeof patchProfileSchema>;

// ── Response ───────────────────────────────────────────────────────────────

export const profileResponseSchema = z.object({
  customer_id:     uuidSchema,
  profile_version: z.number().int().min(1),
  modules_enabled: z.array(z.string()),
  integrations:    z.record(z.unknown()),
  routing:         z.record(z.unknown()),
  custom:          z.record(z.unknown()),
  updated_at:      z.string(),
  updated_by:      z.string().nullable(),
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;
