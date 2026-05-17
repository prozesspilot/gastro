/**
 * M08 — Mail-Sender (STUB mit korrektem Interface).
 *
 * Phase 2: SMTP-Adapter wird in core/mail/ implementiert. Bis dahin loggen
 * wir nur und werfen MAIL_NOT_CONFIGURED, wenn kein SMTP_HOST gesetzt ist.
 */

import { logger } from '../../../core/logger';
import type { MonthlyTotals } from './aggregator';

export class MailNotConfiguredError extends Error {
  constructor() {
    super('MAIL_NOT_CONFIGURED — SMTP-Config aus ENV SMTP_HOST fehlt');
    this.name = 'MailNotConfiguredError';
  }
}

export async function sendMonthlyReport(
  to: string,
  period: string,
  reportPdf: Buffer,
  totals: MonthlyTotals,
): Promise<void> {
  logger.info(
    { to, period, pdf_bytes: reportPdf.length, gross_sum: totals.gross_sum },
    'Mail-Versand (STUB)',
  );
  if (!process.env.SMTP_HOST) {
    throw new MailNotConfiguredError();
  }
  // TODO Phase 2: nodemailer SMTP-Implementation
}
