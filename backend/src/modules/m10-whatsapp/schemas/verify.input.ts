/**
 * M10 — Schema für POST /api/v1/internal/whatsapp/verify
 *
 * Body:
 *   {
 *     "raw_body_b64": "...base64...",   // exakt der Body, den Meta gesendet hat
 *     "signature":    "sha256=abcdef..." // Wert von X-Hub-Signature-256
 *   }
 */

import { z } from 'zod';

export const verifyInputSchema = z.object({
  raw_body_b64: z.string().min(1, 'raw_body_b64 darf nicht leer sein'),
  signature: z.string().min(8, 'signature darf nicht leer sein'),
});

export type VerifyInput = z.infer<typeof verifyInputSchema>;
