/**
 * M04 — Kategorisierungs-Schemas
 */

import { z } from 'zod';
import { uuidSchema } from '../../core/schemas/common';

export const categorizeParamsSchema = z.object({
  id: uuidSchema,
});
export type CategorizeParams = z.infer<typeof categorizeParamsSchema>;

export const categorySchema = z.enum([
  'Büromaterial',
  'Reise',
  'Bewirtung',
  'Porto',
  'Telekommunikation',
  'Miete',
  'Sonstiges',
]);
export type Category = z.infer<typeof categorySchema>;

export const categorizationSchema = z.object({
  category:   categorySchema,
  amount:     z.number(),
  currency:   z.string(),
  date:       z.string().nullable(),
  vendor:     z.string().nullable().optional(),
  confidence: z.number(),
});
export type Categorization = z.infer<typeof categorizationSchema>;
