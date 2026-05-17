/**
 * M09 — POST /api/v1/communications/send
 *
 * Sendet eine vorher gebaute Communication per SMTP.
 * - Nutzt nodemailer
 * - Falls SMTP-ENVs fehlen → Mock-Mode (logge Mail statt senden)
 * - Persistiert Communication in DB
 * - Emittiert pp.communication.sent Event
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import nodemailer from 'nodemailer';
import type { Pool } from 'pg';
import { z } from 'zod';
import { config } from '../../../core/config';
import { publishEvent } from '../../../core/events/publisher';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

const bodySchema = z.object({
  draft: z.object({
    communication_id: z.string(),
    customer_id: z.string(),
    receipt_id: z.string().optional(),
    expected_id: z.string().optional(),
    channel: z.literal('email'),
    to: z.string().email(),
    from: z.string().optional(),
    subject: z.string(),
    body_html: z.string(),
    body_text: z.string(),
    reference_id: z.string(),
    template: z.string(),
  }),
});

// Mock-Transporter wenn SMTP-ENVs fehlen
function createTransporter() {
  const host = (config as unknown as Record<string, string>).SMTP_HOST;
  const user = (config as unknown as Record<string, string>).SMTP_USER;

  if (!host || !user) {
    return null; // Mock-Mode
  }

  const port = Number.parseInt(
    (config as unknown as Record<string, string>).SMTP_PORT ?? '587',
    10,
  );
  const pass = (config as unknown as Record<string, string>).SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export function buildSendHandler() {
  return async function sendHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { draft } = parsed.data;
    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    let status = 'mock_sent';
    let externalId: string | null = null;

    try {
      const transporter = createTransporter();
      const fromAddr =
        (config as unknown as Record<string, string>).SMTP_FROM ??
        draft.from ??
        'noreply@prozesspilot.de';

      if (!transporter) {
        // Mock-Mode: nur loggen
        logger.info(
          {
            to: draft.to,
            from: fromAddr,
            subject: draft.subject,
            communication_id: draft.communication_id,
          },
          'M09 Mock-Send: SMTP nicht konfiguriert — Mail wird nicht versendet',
        );
      } else {
        // Echten Versand durchführen
        const info = await transporter.sendMail({
          from: fromAddr,
          to: draft.to,
          replyTo: draft.from,
          subject: draft.subject,
          text: draft.body_text,
          html: draft.body_html,
          headers: {
            'X-PP-Reference': draft.reference_id,
            'X-PP-Communication-ID': draft.communication_id,
          },
        });
        externalId = info.messageId ?? null;
        status = 'sent';
        logger.info(
          { communication_id: draft.communication_id, messageId: info.messageId },
          'M09: Mail versendet',
        );
      }

      // Persistieren in communications Tabelle
      await db.query(
        `INSERT INTO communications (
           communication_id, customer_id, receipt_id, expected_id,
           channel, direction, template, to_address, from_address,
           subject, reference_id, body_text, body_html, status, external_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (communication_id) DO UPDATE SET
           status = EXCLUDED.status,
           external_id = EXCLUDED.external_id`,
        [
          draft.communication_id,
          draft.customer_id,
          draft.receipt_id ?? null,
          draft.expected_id ?? null,
          draft.channel,
          'outbound',
          draft.template,
          draft.to,
          draft.from ?? null,
          draft.subject,
          draft.reference_id,
          draft.body_text,
          draft.body_html,
          status,
          externalId,
        ],
      );

      // Event emittieren (best-effort)
      await publishEvent(redis, 'pp:communications', {
        type: 'communication.sent',
        communication_id: draft.communication_id,
        customer_id: draft.customer_id,
        receipt_id: draft.receipt_id ?? '',
        to: draft.to,
        template: draft.template,
        status,
        timestamp: new Date().toISOString(),
      });

      return reply.send(
        apiOk({
          communication_id: draft.communication_id,
          status,
          external_id: externalId,
          mock_mode: status === 'mock_sent',
        }),
      );
    } catch (err) {
      logger.error(
        { err, communication_id: draft.communication_id },
        'send-communication handler error',
      );
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Fehler beim E-Mail-Versand.'));
    }
  };
}
