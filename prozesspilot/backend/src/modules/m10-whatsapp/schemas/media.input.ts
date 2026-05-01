/**
 * M10 — Schema für POST /api/v1/internal/whatsapp/media
 *
 * Body:
 *   {
 *     "media_id":    "1234567890987654",
 *     "customer_id": "cust_a3f4b2",
 *     "trace_id":    "trc_..."   (optional)
 *   }
 */

import { z } from 'zod';

export const mediaInputSchema = z.object({
  media_id:    z.string().min(1, 'media_id Pflicht'),
  customer_id: z.string().min(1, 'customer_id Pflicht'),
  trace_id:    z.string().optional(),
});

export type MediaInput = z.infer<typeof mediaInputSchema>;
