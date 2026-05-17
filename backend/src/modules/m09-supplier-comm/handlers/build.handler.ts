/**
 * M09 — POST /api/v1/communications/build
 *
 * Baut eine Kommunikations-Draft gemäß M09 §7.1:
 * 1) Customer-Profile laden + supplier_communication enabled prüfen
 * 2) Template bestimmen (trigger + reason)
 * 3) Receipt laden
 * 4) Supplier-Kontakt suchen (supplier_contacts Tabelle)
 * 5) Anti-Spam: max 1 Mail/Tag pro (customer_id, supplier_email)
 * 6) Reference-ID generieren
 * 7) Template rendern
 * 8) Draft zurückgeben oder { skip: true }
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { buildReferenceId } from '../services/reference-resolver';
import { REASON_DE, pickTemplate, renderTemplate } from '../services/template-renderer';

const bodySchema = z.object({
  trigger: z.enum(['requires_review', 'confirmation', 'missing_receipt', 'overdue']),
  customer_id: z.string().min(1),
  receipt_id: z.string().optional(),
  expected_id: z.string().optional(),
  reason: z.string().optional(),
  supplier_name_override: z.string().optional(),
});

export type BuildInput = z.infer<typeof bodySchema>;

export interface CommDraft {
  communication_id: string;
  customer_id: string;
  receipt_id?: string;
  expected_id?: string;
  channel: 'email';
  to: string;
  from?: string;
  subject: string;
  body_html: string;
  body_text: string;
  reference_id: string;
  template: string;
}

export function buildBuildHandler() {
  return async function buildHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const input = parsed.data;
    const db: Pool = req.server.db;

    try {
      // 1) CustomerProfile laden
      const profileRow = await db.query<{
        customer_id: string;
        display_name: string;
        integrations: Record<string, unknown>;
        contact_email: string;
      }>(
        `SELECT customer_id, display_name, integrations, contact_email
           FROM customer_profiles
          WHERE customer_id = $1
          LIMIT 1`,
        [input.customer_id],
      );

      if (!profileRow.rows[0]) {
        return reply
          .code(404)
          .send(apiError('NOT_FOUND', `Kunde ${input.customer_id} nicht gefunden.`));
      }

      const profile = profileRow.rows[0];

      // Prüfe ob supplier_communication aktiviert ist
      const integrations = profile.integrations ?? {};
      const supplierComm = (integrations as Record<string, Record<string, unknown>>)
        .supplier_communication;
      if (!supplierComm?.enabled) {
        return reply.send(apiOk({ skip: true, reason: 'MODULE_DISABLED' }));
      }

      // 2) Template bestimmen
      const templateKey = pickTemplate(input.trigger, input.reason);

      // 3) Receipt laden (falls receipt_id vorhanden)
      let supplierName: string | null = input.supplier_name_override ?? null;
      let receiptDocNumber: string | null = null;
      let receivedDate: string | null = null;
      let documentDate: string | null = null;

      if (input.receipt_id) {
        const receiptRow = await db.query<{
          receipt_id: string;
          payload: {
            extraction?: {
              fields?: {
                supplier_name?: string;
                document_number?: string;
                document_date?: string;
              };
            };
          };
          created_at: Date;
        }>(
          'SELECT receipt_id, payload, created_at FROM receipts WHERE receipt_id = $1 AND customer_id = $2 LIMIT 1',
          [input.receipt_id, input.customer_id],
        );

        if (!receiptRow.rows[0]) {
          return reply
            .code(404)
            .send(apiError('NOT_FOUND', `Receipt ${input.receipt_id} nicht gefunden.`));
        }

        const receipt = receiptRow.rows[0];
        const fields = receipt.payload?.extraction?.fields ?? {};
        supplierName = supplierName ?? fields.supplier_name ?? null;
        receiptDocNumber = fields.document_number ?? null;
        receivedDate = receipt.created_at.toLocaleDateString('de-DE');
        documentDate = fields.document_date
          ? new Date(fields.document_date).toLocaleDateString('de-DE')
          : null;
      }

      if (!supplierName) {
        logger.warn({ input }, 'build-communication: kein Lieferantenname, skip');
        return reply.send(apiOk({ skip: true, reason: 'NO_SUPPLIER_NAME' }));
      }

      // 4) Supplier-Kontakt suchen
      const contactRow = await db.query<{
        contact_id: string;
        contact_email: string | null;
        contact_phone: string | null;
      }>(
        `SELECT contact_id, contact_email, contact_phone
           FROM supplier_contacts
          WHERE customer_id = $1 AND supplier_name ILIKE $2 AND active = true
          LIMIT 1`,
        [input.customer_id, `%${supplierName}%`],
      );

      const contact = contactRow.rows[0];
      if (!contact?.contact_email) {
        // Kein Kontakt bekannt → Operator-Task (log-only für MVP)
        logger.info(
          { supplierName, customer_id: input.customer_id },
          'M09: kein Lieferanten-Kontakt — Operator-Task nötig',
        );
        return reply.send(apiOk({ skip: true, reason: 'NO_SUPPLIER_CONTACT' }));
      }

      // 5) Anti-Spam: max 1 Mail/Tag pro (customer_id, supplier_email)
      const { rows: recentComms } = await db.query<{ communication_id: string }>(
        `SELECT communication_id FROM communications
          WHERE customer_id = $1
            AND to_address = $2
            AND direction = 'outbound'
            AND created_at > now() - INTERVAL '24 hours'
          LIMIT 1`,
        [input.customer_id, contact.contact_email],
      );

      if (recentComms.length > 0) {
        logger.info(
          { customer_id: input.customer_id, email: contact.contact_email },
          'M09: Anti-Spam — Mail erst morgen wieder',
        );
        return reply.send(apiOk({ skip: true, reason: 'ANTI_SPAM' }));
      }

      // 6) Reference-ID generieren
      const referenceId = input.receipt_id
        ? buildReferenceId(input.receipt_id)
        : `PP-REF-${Date.now().toString(36).toUpperCase().slice(-12)}`;

      // 7) Template rendern
      const belege_email = profile.contact_email ?? 'belege@example.com';
      const templateVars = {
        document_number: receiptDocNumber ?? 'UNBEKANNT',
        ref: referenceId,
        received_date: receivedDate ?? new Date().toLocaleDateString('de-DE'),
        document_date: documentDate ?? '',
        customer_display_name: profile.display_name ?? input.customer_id,
        customer_belege_email: belege_email,
        supplier_name: supplierName,
        reason_de: REASON_DE[input.reason ?? ''] ?? input.reason ?? 'Unbekannt',
        period: new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      };

      const rendered = renderTemplate(templateKey, templateVars);

      // Draft zusammenstellen
      const commId = `comm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const draft: CommDraft = {
        communication_id: commId,
        customer_id: input.customer_id,
        receipt_id: input.receipt_id,
        expected_id: input.expected_id,
        channel: 'email',
        to: contact.contact_email,
        from: belege_email,
        subject: rendered.subject,
        body_html: rendered.body_html,
        body_text: rendered.body_text,
        reference_id: referenceId,
        template: templateKey,
      };

      return reply.send(apiOk({ skip: false, draft }));
    } catch (err) {
      logger.error({ err, input }, 'build-communication handler error');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Interner Serverfehler.'));
    }
  };
}
