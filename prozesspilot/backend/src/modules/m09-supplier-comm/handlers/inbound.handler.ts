/**
 * M09 — POST /webhooks/email/inbound
 *
 * Verarbeitet eingehende E-Mails (Mailgun/Postmark Webhook-Format).
 * - Extrahiert PP-REF-xxxx aus Subject
 * - Mappt auf Receipt via reference_id in communications Tabelle
 * - Speichert eingehende Mail als inbound communication
 * - Emittiert pp.communication.replied
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { z } from 'zod';
import { apiError, apiOk } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';
import { publishEvent } from '../../../core/events/publisher';
import { extractReferenceId, findCommunicationByReference } from '../services/reference-resolver';

// Mailgun/Postmark flexibles Schema (beide Formate akzeptieren)
const inboundSchema = z.object({
  // Mailgun-Felder
  sender: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
  'body-plain': z.string().optional(),
  'body-html': z.string().optional(),
  'Message-Id': z.string().optional(),
  // Postmark-Felder
  From: z.string().optional(),
  To: z.string().optional(),
  Subject: z.string().optional(),
  TextBody: z.string().optional(),
  HtmlBody: z.string().optional(),
  MessageID: z.string().optional(),
}).passthrough();

export function buildInboundHandler() {
  return async function inboundHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = inboundSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(200).send({ received: true }); // Webhook immer 200 zurückgeben
    }

    const body = parsed.data as Record<string, unknown>;
    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    try {
      // Normalisiere Felder (Mailgun vs Postmark)
      const fromAddr = (body['sender'] ?? body['From'] ?? '') as string;
      const toAddr = (body['recipient'] ?? body['To'] ?? '') as string;
      const subject = (body['subject'] ?? body['Subject'] ?? '') as string;
      const bodyText = (body['body-plain'] ?? body['TextBody'] ?? '') as string;
      const bodyHtml = (body['body-html'] ?? body['HtmlBody'] ?? '') as string;
      const externalId = (body['Message-Id'] ?? body['MessageID'] ?? '') as string;

      // PP-REF aus Subject extrahieren
      const referenceId = extractReferenceId(subject) ?? extractReferenceId(bodyText);

      logger.info({ from: fromAddr, to: toAddr, subject, referenceId }, 'M09: Inbound-Mail empfangen');

      // Originale Kommunikation finden
      let customerId = 'unknown';
      let receiptId: string | null = null;
      if (referenceId) {
        const original = await findCommunicationByReference(db, referenceId);
        if (original) {
          customerId = original.customer_id;
          receiptId = original.receipt_id;
        }
      }

      // Als inbound communication speichern
      const commId = `comm_in_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await db.query(
        `INSERT INTO communications (
           communication_id, customer_id, receipt_id, channel, direction,
           to_address, from_address, subject, reference_id,
           body_text, body_html, status, external_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          commId,
          customerId,
          receiptId,
          'email',
          'inbound',
          toAddr,
          fromAddr,
          subject,
          referenceId,
          bodyText,
          bodyHtml,
          'reply_received',
          externalId || null,
        ],
      );

      // Event emittieren
      await publishEvent(redis, 'pp:communications', {
        type: 'communication.replied',
        communication_id: commId,
        customer_id: customerId,
        receipt_id: receiptId ?? '',
        from: fromAddr,
        reference_id: referenceId ?? '',
        timestamp: new Date().toISOString(),
      });

      return reply.code(200).send(apiOk({
        received: true,
        communication_id: commId,
        reference_id: referenceId,
        receipt_id: receiptId,
        matched: !!referenceId && customerId !== 'unknown',
      }));
    } catch (err) {
      logger.error({ err }, 'inbound-mail handler error');
      // Immer 200 zurückgeben damit Webhook-Provider nicht wiederholt versucht
      return reply.code(200).send({ received: true, error: 'internal' });
    }
  };
}
