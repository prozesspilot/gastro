/**
 * M04 — POST /api/v1/customers/:customerId/datev/:exportId/send
 *
 * Versendet einen DATEV-Export per E-Mail an den Steuerberater (M04 §7.2).
 * SMTP aus ENV: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * SMTP_ENABLED=false → Mail überspringen (Dev-Mode)
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { apiError, apiOk } from '../../../core/schemas/common';

export function buildSendHandler() {
  return async function sendHandler(
    req: FastifyRequest<{ Params: { customerId: string; exportId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId, exportId } = req.params;
    const db: Pool = req.server.db;

    try {
      // Export laden
      const { rows: exportRows } = await db.query<{
        datev_export_id: string;
        customer_id: string;
        period_year: number;
        period_month: number;
        receipt_ids: string[];
        csv_object_key: string;
        csv_sha256: string;
        zip_object_key: string | null;
        delivered_at: Date | null;
      }>(
        `SELECT datev_export_id, customer_id, period_year, period_month,
                receipt_ids, csv_object_key, csv_sha256, zip_object_key, delivered_at
           FROM datev_exports
          WHERE datev_export_id = $1 AND customer_id = $2
          LIMIT 1`,
        [exportId, customerId],
      );

      const exportRow = exportRows[0];
      if (!exportRow) {
        return reply
          .code(404)
          .send(
            apiError('NOT_FOUND', `Export ${exportId} für Kunde ${customerId} nicht gefunden.`),
          );
      }

      // Bereits geliefert?
      if (exportRow.delivered_at) {
        return reply.send(
          apiOk({
            already_delivered: true,
            delivered_at: exportRow.delivered_at.toISOString(),
            export_id: exportId,
          }),
        );
      }

      // CustomerProfile laden für datev_tax_advisor_email
      const { rows: profileRows } = await db.query<{
        custom: Record<string, unknown>;
      }>('SELECT custom FROM customer_profiles WHERE customer_id = $1 LIMIT 1', [customerId]);

      const taxAdvisorEmail =
        (profileRows[0]?.custom?.datev_tax_advisor_email as string | undefined) ?? '';

      // SMTP-Konfiguration aus ENV
      const smtpEnabled = process.env.SMTP_ENABLED !== 'false';

      if (!smtpEnabled) {
        logger.info(
          { export_id: exportId, customer_id: customerId },
          'SMTP_ENABLED=false — Mail übersprungen (Dev-Mode)',
        );
        await markDelivered(db, exportId, 'dev-mode-skipped');
        return reply.send(
          apiOk({
            delivered: false,
            skipped: true,
            reason: 'SMTP_DISABLED',
            export_id: exportId,
          }),
        );
      }

      if (!taxAdvisorEmail) {
        return reply
          .code(412)
          .send(
            apiError(
              'NO_TAX_ADVISOR_EMAIL',
              'Keine Steuerberater-E-Mail konfiguriert (datev_tax_advisor_email).',
              { customer_id: customerId },
            ),
          );
      }

      // Mail-Template laden
      const templatePath = join(__dirname, '..', 'templates', 'datev_delivery_de.txt');
      let templateText: string;
      try {
        templateText = await readFile(templatePath, 'utf-8');
      } catch {
        templateText = buildDefaultTemplate();
      }

      // Template befüllen
      const period = `${exportRow.period_year}-${String(exportRow.period_month).padStart(2, '0')}`;
      const mailBody = templateText
        .replace('{{period}}', period)
        .replace('{{receipts_count}}', String(exportRow.receipt_ids.length))
        .replace('{{export_id}}', exportId)
        .replace('{{customer_id}}', customerId);

      // Mail senden mit nodemailer
      let messageId: string | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
        const nodemailer = require('nodemailer') as { createTransport: (opts: unknown) => any };

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST ?? 'localhost',
          port: Number(process.env.SMTP_PORT ?? '587'),
          auth: process.env.SMTP_USER
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS ?? '',
              }
            : undefined,
          secure: process.env.SMTP_SECURE === 'true',
        });

        const info = await transporter.sendMail({
          from: process.env.SMTP_FROM ?? 'ProzessPilot <noreply@prozesspilot.de>',
          to: taxAdvisorEmail,
          subject: `DATEV-Export ${period} — ${exportRow.receipt_ids.length} Belege`,
          text: mailBody,
          attachments: [
            {
              filename: `DATEV_${period}_Buchungsstapel.csv`,
              content: exportRow.csv_object_key, // MVP: Pfad als Platzhalter
            },
          ],
        });

        messageId = info.messageId ?? null;
        logger.info(
          { export_id: exportId, to: taxAdvisorEmail, message_id: messageId },
          'DATEV-Export E-Mail versendet',
        );
      } catch (mailErr) {
        // nodemailer nicht installiert oder SMTP-Fehler
        logger.warn({ err: mailErr }, 'DATEV Mail-Versand fehlgeschlagen');
        return reply.code(502).send(
          apiError('MAIL_DELIVERY_FAILED', 'E-Mail-Versand fehlgeschlagen.', {
            message: (mailErr as Error).message,
          }),
        );
      }

      // delivered_at updaten
      await markDelivered(db, exportId, messageId);

      return reply.send(
        apiOk({
          delivered: true,
          export_id: exportId,
          to: taxAdvisorEmail,
          period,
          message_id: messageId,
        }),
      );
    } catch (err) {
      logger.error({ err, customerId, exportId }, 'M04 send fehlgeschlagen');
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'DATEV-Versand fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }
  };
}

async function markDelivered(db: Pool, exportId: string, messageId: string | null): Promise<void> {
  await db.query(
    `UPDATE datev_exports
        SET delivered_at = now(),
            delivery_message_id = $2
      WHERE datev_export_id = $1`,
    [exportId, messageId],
  );
}

function buildDefaultTemplate(): string {
  return `Sehr geehrte Damen und Herren,

anbei erhalten Sie die DATEV-Exportdatei für den Monat {{period}}.

Export-ID: {{export_id}}
Anzahl Belege: {{receipts_count}}
Kunde: {{customer_id}}

Die CSV-Datei ist im DATEV-EXTF-Format (Buchungsstapel) und kann direkt
in DATEV Kanzlei-Rechnungswesen importiert werden.

Mit freundlichen Grüßen
ProzessPilot

---
Diese E-Mail wurde automatisch von ProzessPilot generiert.
`;
}
