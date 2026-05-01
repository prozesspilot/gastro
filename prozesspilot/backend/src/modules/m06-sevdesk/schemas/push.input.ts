/**
 * M06 — Zod-Schema für POST /api/v1/receipts/:receiptId/exports/sevdesk
 */

import { z } from 'zod';

const customerProfileSchema = z
  .object({
    customer_id: z.string().min(1),
    modules_enabled: z.array(z.string()).optional(),
    integrations: z
      .object({
        booking: z.object({}).passthrough().optional(),
        sevdesk: z
          .object({
            auto_sync_accounts: z.boolean().optional(),
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
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
