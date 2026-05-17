/**
 * M10 — Schema für POST /api/v1/internal/whatsapp/resolve
 *
 * Body:
 *   {
 *     "phone_number_id": "123456789012345",
 *     "from":            "4917612345678"
 *   }
 */

import { z } from 'zod';

export const resolveInputSchema = z.object({
  phone_number_id: z.string().min(1, 'phone_number_id Pflicht'),
  from: z.string().min(5, 'from (Absender-Telefonnummer) Pflicht'),
});

export type ResolveInput = z.infer<typeof resolveInputSchema>;
