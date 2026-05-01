/**
 * M03 — OCR-Schemas
 */

import { z } from 'zod';
import { uuidSchema } from '../../core/schemas/common';

export const ocrParamsSchema = z.object({
  id: uuidSchema,
});
export type OcrParams = z.infer<typeof ocrParamsSchema>;

export const ocrResultSchema = z.object({
  receipt_id:     uuidSchema,
  status:         z.string(),
  ocr_text:       z.string(),
  ocr_confidence: z.number(),
  ocr_at:         z.string(),
  mock:           z.boolean().default(false),
});
export type OcrResult = z.infer<typeof ocrResultSchema>;
