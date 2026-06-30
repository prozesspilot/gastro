/**
 * T089/M08 — Steuerberater-Übergabe: stellt einen vorhandenen Monats-Report (T087)
 * per Mail an den Steuerberater des Tenants zu (PDF-Anhang).
 *
 * Ablauf:
 *   1. Report laden (RLS-scoped)            → report_not_found
 *   2. Empfänger (tenants.advisor_email)     → no_recipient
 *   3. PDF aus MinIO laden (Anhang)          → pdf_missing
 *   4. Mail bauen (Body-Generator) + senden  → send_failed | sent (inkl. Dry-Run)
 *   5. Delivery-Row + Audit (atomar je Tx)
 *
 * Reiner Service ohne HTTP — der Handler mappt das Ergebnis auf den Status-Code.
 * `sendMail` wirft nie (Best-Effort); Dry-Run (kein SMTP) gilt als erfolgreich.
 *
 * Zustell-Semantik = **at-least-once**, NICHT exactly-once: SMTP läuft bewusst
 * außerhalb der DB-Tx (Tx1 pending → senden → Tx2 sent/failed+Audit). Crasht der
 * Prozess ZWISCHEN erfolgreichem Send und Tx2, bleibt der Row auf `pending`; ein
 * erneuter Aufruf sendet erneut → der Steuerberater kann die Übergabe-Mail doppelt
 * erhalten. Die Idempotenz garantiert genau EINEN Delivery-Row, nicht genau EINEN
 * Versand. Akzeptiert (geringer Schaden); Härtung (z. B. `sending`-Zwischenstatus
 * + Provider-Idempotency-Key) wäre eine spätere Verfeinerung.
 */

import { createHash } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import type { AuditActor } from '../../../core/audit/audit-log';
import { logAuditEvent } from '../../../core/audit/audit-log';
import { withTenant } from '../../../core/db/tenant';
import { hashEmailForLog, sendMail } from '../../../core/mail/mail.service';
import type { MailTransport } from '../../../core/mail/mail.types';
import { downloadObject } from '../../../core/storage/storage.service';
import { buildHandoverMail } from './handover-mail.builder';
import {
  findDeliveryStatus,
  markDeliveryResult,
  upsertPendingDelivery,
} from './report-delivery.repository';
import { getReportById, getTenantHandoverInfo } from './report.repository';

export interface DeliverReportDeps {
  db: Pool;
  s3: S3Client;
  /** Mail-Transport (DI für Tests). Default: SMTP via sendMail. */
  transport?: MailTransport;
}

export type DeliverReportResult =
  | { ok: true; deliveryId: string; dryRun: boolean; messageId?: string; alreadySent?: boolean }
  | { ok: false; reason: 'report_not_found' }
  | { ok: false; reason: 'no_recipient' }
  | { ok: false; reason: 'pdf_missing'; error: string }
  | { ok: false; reason: 'send_failed'; deliveryId: string; error: string };

/** Voller SHA256-Hex (64 Zeichen) der Mail — für die PII-freie DB-Spalte recipient_hash. */
function recipientHashFull(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Stellt den Report `reportId` an den Steuerberater des Tenants zu.
 * Idempotent über (report, channel, recipient): erneuter Aufruf aktualisiert
 * denselben Delivery-Row.
 */
export async function deliverReport(
  deps: DeliverReportDeps,
  tenantId: string,
  reportId: string,
  opts: { actor: AuditActor; skipIfAlreadySent?: boolean },
): Promise<DeliverReportResult> {
  const { db, s3, transport } = deps;

  const report = await getReportById(db, tenantId, reportId);
  if (!report) return { ok: false, reason: 'report_not_found' };

  const { tenantName, advisorEmail } = await getTenantHandoverInfo(db, tenantId);
  if (!advisorEmail) return { ok: false, reason: 'no_recipient' };

  const recipientHash = recipientHashFull(advisorEmail);
  const recipientHashShort = hashEmailForLog(advisorEmail);

  // Re-Run-Schutz (T090): wurde dieser Report an diesen Empfänger bereits
  // erfolgreich versendet, NICHT erneut senden (verhindert Doppel-Mail bei
  // systemd-Cron-Retry). Vor dem teuren PDF-Download geprüft. Die Einzeltenant-
  // Route ruft OHNE diese Option (bleibt bewusst at-least-once).
  if (opts.skipIfAlreadySent) {
    const existing = await withTenant(db, tenantId, (client) =>
      findDeliveryStatus(client, { reportId, channel: 'email', recipientHash }),
    );
    if (existing && existing.status === 'sent') {
      return { ok: true, deliveryId: existing.id, dryRun: false, alreadySent: true };
    }
  }

  // PDF-Anhang aus MinIO ziehen. Fehlt das Objekt (Report-Row ohne Datei) →
  // pdf_missing, kein Versand.
  let pdf: Buffer;
  try {
    pdf = await downloadObject(s3, report.pdf_object_key);
  } catch (err) {
    return {
      ok: false,
      reason: 'pdf_missing',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const mail = buildHandoverMail({ tenantName, totals: report.totals });

  // Tx 1: Delivery-Row auf 'pending' (idempotent).
  const deliveryId = await withTenant(db, tenantId, (client) =>
    upsertPendingDelivery(client, tenantId, {
      reportId,
      channel: 'email',
      recipientHash,
    }),
  );

  // Versand außerhalb der Transaktion (SMTP-I/O nicht in einer offenen Tx halten).
  const sendResult = await sendMail(
    {
      to: advisorEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: [
        {
          filename: `Monatsbericht-${report.period_year}-${String(report.period_month).padStart(2, '0')}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    },
    { transport },
  );

  // Tx 2: Ergebnis + Audit (atomar). Kein PII — nur Empfänger-Hash (kurz).
  if (!sendResult.ok) {
    await withTenant(db, tenantId, async (client) => {
      await markDeliveryResult(client, {
        id: deliveryId,
        status: 'failed',
        error: sendResult.error,
      });
      await logAuditEvent(client, {
        tenantId,
        entityType: 'report',
        entityId: reportId,
        eventType: 'report.delivery_failed',
        actor: opts.actor,
        payloadAfter: {
          channel: 'email',
          recipient_hash: recipientHashShort,
          delivery_id: deliveryId,
        },
        metadata: { error: sendResult.error },
      });
    });
    return { ok: false, reason: 'send_failed', deliveryId, error: sendResult.error };
  }

  const messageId = sendResult.dryRun ? null : (sendResult.messageId ?? null);
  await withTenant(db, tenantId, async (client) => {
    await markDeliveryResult(client, {
      id: deliveryId,
      status: 'sent',
      externalId: messageId,
    });
    await logAuditEvent(client, {
      tenantId,
      entityType: 'report',
      entityId: reportId,
      eventType: 'report.delivered',
      actor: opts.actor,
      payloadAfter: {
        channel: 'email',
        recipient_hash: recipientHashShort,
        delivery_id: deliveryId,
        period_year: report.period_year,
        period_month: report.period_month,
      },
      metadata: { dry_run: sendResult.dryRun },
    });
  });

  return {
    ok: true,
    deliveryId,
    dryRun: sendResult.dryRun,
    messageId: sendResult.dryRun ? undefined : sendResult.messageId,
  };
}
