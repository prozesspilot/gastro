/**
 * M10 — Schema für POST /api/v1/internal/whatsapp/send-template
 *
 * Body:
 *   {
 *     "customer_id":   "cust_a3f4b2",
 *     "to":            "+4917612345678",
 *     "template_name": "confirmation_received_de",
 *     "variables":     {}                            (optional)
 *   }
 */

import { z } from 'zod';

export const sendTemplateInputSchema = z.object({
  customer_id:   z.string().min(1, 'customer_id Pflicht'),
  to:            z.string().min(5, 'to (Empfänger) Pflicht'),
  template_name: z.enum(['confirmation_received_de', 'sender_not_registered']),
  language:      z.string().default('de'),
  variables:     z.record(z.string()).optional(),
});

export type SendTemplateInput = z.infer<typeof sendTemplateInputSchema>;
