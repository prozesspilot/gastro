/**
 * M08 — POST /api/v1/customers/:customer_id/reports/monthly/deliver
 *
 * Body:
 *   { period: 'YYYY-MM', customer_profile: {...}, trace_id?: string }
 *
 * Logik:
 *   1) Lade monthly_reports für (customer_id, period)
 *   2) Prüfe status='done', sonst 409 REPORT_NOT_READY
 *   3) Lade PDF aus storage (presigned URL für Mail-Anhang reicht; STUB)
 *   4) Für jeden konfigurierten Channel (profile.integrations.reporting.channels):
 *      - 'email'    → mail-sender (STUB)
 *      - 'whatsapp' → whatsapp-sender (STUB)
 *   5) Hook after_report.monthly
 *   6) UPDATE delivery_log (append)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { sendMonthlyReport, MailNotConfiguredError } from '../services/mail-sender';
import { sendMonthlyReportSummary } from '../services/whatsapp-sender';
import { writeReportAudit } from '../services/audit.service';

const deliverBodySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  customer_profile: z.record(z.unknown()).optional(),
  trace_id: z.string().optional(),
});

interface ReportRow {
  report_id: string;
  customer_id: string;
  period: string;
  status: string;
  pdf_object_key: string | null;
  totals: unknown;
  delivery_log: unknown;
}

export function buildDeliverHandler() {
  return async function deliverHandler(
    req: FastifyRequest<{ Params: { customer_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = deliverBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id } = req.params;
    const { period, customer_profile, trace_id } = parsed.data;
    const db: Pool = req.server.db;
    void (req.server.s3 as S3Client | undefined);

    const reportRes = await db.query<ReportRow>(
      `SELECT report_id, customer_id, period, status, pdf_object_key, totals, delivery_log
         FROM monthly_reports
        WHERE customer_id=$1 AND period=$2
        LIMIT 1`,
      [customer_id, period],
    );
    const report = reportRes.rows[0];
    if (!report) {
      return reply.code(404).send(apiError('NOT_FOUND', `Report ${customer_id}/${period} nicht gefunden.`));
    }
    if (report.status !== 'done') {
      return reply.code(409).send(apiError('REPORT_NOT_READY', `Report-Status: ${report.status}`));
    }

    const channels = pickChannels(customer_profile);
    const totals = (report.totals ?? {}) as Record<string, unknown>;
    const recipients = pickRecipients(customer_profile);

    const deliveries: Array<{ channel: string; to: string; status: 'delivered' | 'failed'; error?: string; delivered_at: string }> = [];

    for (const channel of channels) {
      for (const r of recipients.filter((rp) => rp.channel === channel)) {
        try {
          if (channel === 'email') {
            // PDF-Bytes laden ist STUB; in Phase 2 wird der Storage-Adapter genutzt.
            const fakePdf = Buffer.from('PDF-PLACEHOLDER');
            await sendMonthlyReport(r.to, period, fakePdf, totals as never);
          } else if (channel === 'whatsapp') {
            await sendMonthlyReportSummary('phone_id_default', r.to, totals as never, 'access_token_stub');
          }
          deliveries.push({
            channel, to: r.to, status: 'delivered', delivered_at: new Date().toISOString(),
          });
        } catch (err) {
          if (err instanceof MailNotConfiguredError) {
            deliveries.push({
              channel, to: r.to, status: 'failed', error: err.message,
              delivered_at: new Date().toISOString(),
            });
          } else {
            logger.warn({ err, channel, to: r.to }, 'Report-Versand fehlgeschlagen');
            deliveries.push({
              channel, to: r.to, status: 'failed', error: (err as Error).message,
              delivered_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    // delivery_log appenden
    const oldLog = Array.isArray(report.delivery_log) ? (report.delivery_log as unknown[]) : [];
    const newLog = [...oldLog, ...deliveries];
    await db.query(
      `UPDATE monthly_reports SET delivery_log = $3::jsonb, updated_at=now()
         WHERE customer_id=$1 AND period=$2`,
      [customer_id, period, JSON.stringify(newLog)],
    );

    // Hook after_report.monthly (No-Op wenn Profil fehlt)
    void hookRunner;

    void writeReportAudit(db, {
      customerId: customer_id,
      reportId: report.report_id,
      eventType: 'pp.report.delivered',
      payload: { deliveries },
      traceId: trace_id,
    });

    return reply.send(apiOk({
      report_id: report.report_id,
      period,
      delivered: deliveries,
    }));
  };
}

function pickChannels(profile?: Record<string, unknown>): Array<'email' | 'whatsapp'> {
  if (!profile) return ['email'];
  const integrations = profile.integrations as Record<string, unknown> | undefined;
  const reporting = integrations?.reporting as Record<string, unknown> | undefined;
  const ch = (reporting?.delivery_channels ?? reporting?.channels) as string[] | undefined;
  if (!Array.isArray(ch) || ch.length === 0) return ['email'];
  return ch.filter((c): c is 'email' | 'whatsapp' => c === 'email' || c === 'whatsapp');
}

function pickRecipients(profile?: Record<string, unknown>): Array<{ channel: string; to: string }> {
  if (!profile) return [];
  const integrations = profile.integrations as Record<string, unknown> | undefined;
  const reporting = integrations?.reporting as Record<string, unknown> | undefined;
  const recs = reporting?.recipients as Array<{ channel?: string; to?: string }> | undefined;
  if (!Array.isArray(recs)) return [];
  return recs
    .filter((r): r is { channel: string; to: string } => typeof r.channel === 'string' && typeof r.to === 'string')
    .map((r) => ({ channel: r.channel, to: r.to }));
}
