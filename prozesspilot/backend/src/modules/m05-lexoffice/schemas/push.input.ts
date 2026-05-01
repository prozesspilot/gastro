/**
 * M05 — Zod-Schema für POST /api/v1/receipts/:receipt_id/exports/lexoffice
 */

import { z } from 'zod';

const customerProfileSchema = z
  .object({
    customer_id: z.string().min(1),
    integrations: z
      .object({
        booking: z.object({}).passthrough().optional(),
        lexoffice: z
          .object({
            auto_create_contacts: z.boolean().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    routing: z.record(z.unknown()).optional(),
    custom: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const pushInputSchema = z.object({
  customer_profile: customerProfileSchema,
  trace_id: z.string().optional(),
});

export type PushInput = z.infer<typeof pushInputSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
