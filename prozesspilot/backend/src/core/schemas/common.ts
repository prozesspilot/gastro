/**
 * D4 — Gemeinsame Basis-Schemas
 *
 * Wiederverwendbare Zod-Typen für UUIDs, Pagination, Timestamps
 * und einheitliche API-Response-Wrapper.
 */

import { z } from 'zod';

// ── Primitive ──────────────────────────────────────────────────────────────

export const uuidSchema = z.string().uuid({ message: 'Muss eine gültige UUID sein.' });

export const slugSchema = z
  .string()
  .min(2, 'Slug muss mindestens 2 Zeichen lang sein.')
  .max(64, 'Slug darf maximal 64 Zeichen lang sein.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.',
  );

export const isoDateSchema = z
  .string()
  .datetime({ message: 'Muss ein gültiges ISO-8601-Datum sein.' });

/** Nicht-leerer, getrimmter String */
export const nonEmptyStringSchema = z.string().trim().min(1, 'Darf nicht leer sein.');

/** Optionaler, getrimmter String — wird bei '' zu undefined normalisiert */
export const optionalStringSchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

// ── Pagination ─────────────────────────────────────────────────────────────

export const paginationQuerySchema = z.object({
  /** Seite (1-basiert) */
  page: z.coerce.number().int().min(1).default(1),
  /** Einträge pro Seite (max. 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// ── API-Response-Wrapper ───────────────────────────────────────────────────

/** Erfolgreiche Antwort ohne Pagination */
export interface ApiOk<T> {
  ok: true;
  data: T;
}

/** Erfolgreiche Antwort mit Pagination */
export interface ApiOkPaged<T> {
  ok: true;
  data: T[];
  pagination: PaginationMeta;
}

/** Fehlerantwort */
export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiOk<T>(data: T): ApiOk<T> {
  return { ok: true, data };
}

export function apiOkPaged<T>(data: T[], pagination: PaginationMeta): ApiOkPaged<T> {
  return { ok: true, data, pagination };
}

export function apiError(code: string, message: string, details?: unknown): ApiError {
  return { ok: false, error: { code, message, details } };
}

// ── Zod-Fehler in API-Error umwandeln ─────────────────────────────────────

import type { ZodError } from 'zod';

export function zodToApiError(err: ZodError): ApiError {
  return apiError('VALIDATION_ERROR', 'Ungültige Eingabedaten.', err.flatten().fieldErrors);
}

// ── Timestamps (für DB-Rows) ───────────────────────────────────────────────

export const timestampsSchema = z.object({
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

// ── Sortierung ─────────────────────────────────────────────────────────────

export type SortOrder = 'asc' | 'desc';

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
