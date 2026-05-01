/**
 * D4 — Routing-Job-Schemas
 *
 * Validierung für Routing-Jobs (D9 implementiert den Service).
 * Jobs steuern, welcher n8n-Workflow für ein Dokument ausgelöst wird.
 */

import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

// ── Status ─────────────────────────────────────────────────────────────────

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'done',
  'failed',
  'dead',
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

// ── Create ─────────────────────────────────────────────────────────────────

export const createRoutingJobSchema = z.object({
  /** Zugehöriges Dokument */
  document_id:  uuidSchema.optional(),
  /** Maximale Anzahl an Versuchen (Standard: 3) */
  max_attempts: z.number().int().min(1).max(10).default(3),
  /** Beliebige JSON-Nutzlast für den Worker / n8n */
  payload:      z.record(z.unknown()).default({}),
  /** Frühester Ausführungszeitpunkt (ISO-8601, Standard: sofort) */
  run_at:       z.string().datetime().optional(),
});

export type CreateRoutingJobInput = z.infer<typeof createRoutingJobSchema>;

// ── Query-Parameter ────────────────────────────────────────────────────────

export const listRoutingJobsQuerySchema = paginationQuerySchema.extend({
  status:      jobStatusSchema.optional(),
  document_id: uuidSchema.optional(),
  sort_by:     z.enum(['created_at', 'run_at', 'attempts']).default('created_at'),
  sort_order:  z.enum(['asc', 'desc']).default('desc'),
});

export type ListRoutingJobsQuery = z.infer<typeof listRoutingJobsQuerySchema>;

// ── Response ───────────────────────────────────────────────────────────────

export const routingJobResponseSchema = z.object({
  id:            uuidSchema,
  tenant_id:     uuidSchema,
  document_id:   uuidSchema.nullable(),
  status:        jobStatusSchema,
  attempts:      z.number(),
  max_attempts:  z.number(),
  error_message: z.string().nullable(),
  payload:       z.record(z.unknown()),
  result:        z.record(z.unknown()).nullable(),
  run_at:        z.string(),
  created_at:    z.string(),
  updated_at:    z.string(),
});

export type RoutingJobResponse = z.infer<typeof routingJobResponseSchema>;
