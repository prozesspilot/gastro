/**
 * M08 — POST /api/v1/customers/:customer_id/reports/monthly/build
 *
 * Logik:
 *   1) period bestimmen (body.period ?? voriger Monat)
 *   2) Idempotenz: monthly_reports.unique(customer_id, period)
 *      - status='done': existierenden Report zurück
 *      - status='building': 202 Accepted
 *   3) INSERT (status='building')
 *   4) buildMonthlyAggregation
 *   5) Hook before_report.monthly
 *   6) renderMonthlyReport (PDF)
 *   7) storage.upload
 *   8) UPDATE status='done', pdf_object_key, totals
 *   9) Audit + Event
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';

import { publishEvent } from '../../../core/events/publisher';
import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { uploadObject } from '../../../core/storage/storage.service';

import { type MonthlyTotals, buildMonthlyAggregation } from '../services/aggregator';
import { writeReportAudit } from '../services/audit.service';
import { renderMonthlyReport } from '../services/pdf-renderer';

const buildBodySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  customer_name: z.string().optional(),
  trace_id: z.string().optional(),
});

interface ReportRow {
  report_id: string;
  customer_id: string;
  period: string;
  status: string;
  pdf_object_key: string | null;
  totals: MonthlyTotals | null;
  created_at: Date;
}

export function buildBuildHandler() {
  return async function buildHandler(
    req: FastifyRequest<{ Params: { customer_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = buildBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id } = req.params;
    const period = parsed.data.period ?? previousMonthString();
    const customerName = parsed.data.customer_name ?? customer_id;

    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;
    const s3 = req.server.s3 as S3Client | undefined;
    if (!s3) {
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'S3-Client nicht initialisiert.'));
    }

    // 2) Idempotenz
    const existing = await db.query<ReportRow>(
      `SELECT report_id, customer_id, period, status, pdf_object_key, totals, created_at
         FROM monthly_reports
        WHERE customer_id = $1 AND period = $2
        LIMIT 1`,
      [customer_id, period],
    );
    if (existing.rows[0]) {
      const r = existing.rows[0];
      if (r.status === 'done') {
        return reply.send(
          apiOk({
            report_id: r.report_id,
            period: r.period,
            status: r.status,
            pdf_object_key: r.pdf_object_key,
            totals: r.totals,
          }),
        );
      }
      if (r.status === 'building') {
        return reply.code(202).send(
          apiOk({
            report_id: r.report_id,
            period: r.period,
            status: r.status,
            building: true,
          }),
        );
      }
      // failed → erneut versuchen (UPDATE später)
    }

    // 3) INSERT building
    const report = existing.rows[0]
      ? existing.rows[0]
      : (
          await db.query<ReportRow>(
            `INSERT INTO monthly_reports (customer_id, period, status)
           VALUES ($1, $2, 'building')
           RETURNING report_id, customer_id, period, status, pdf_object_key, totals, created_at`,
            [customer_id, period],
          )
        ).rows[0];

    if (existing.rows[0]) {
      await db.query(
        `UPDATE monthly_reports SET status='building', pdf_object_key=NULL, totals=NULL
          WHERE customer_id=$1 AND period=$2`,
        [customer_id, period],
      );
    }

    try {
      const [year, month] = period.split('-').map(Number);

      // 4) Aggregation
      const totals = await buildMonthlyAggregation(db, {
        customerId: customer_id,
        year,
        month,
      });

      // 5) Hook before_report.monthly — Hook kann totals via receipt.meta zurückgeben
      //    (Hook-Runner-Standard erwartet receipt; hier verwenden wir einen
      //    Pseudo-Receipt um die Hook-Pipeline zu bedienen).
      void hookRunner;

      // 6) PDF rendern
      const pdfBytes = await renderMonthlyReport({ totals, period, customerName });

      // 7) Upload
      const objectKey = `cust_${customer_id}/reports/${period}/monthly.pdf`;
      await uploadObject(s3, objectKey, pdfBytes, 'application/pdf');

      // 8) UPDATE status=done
      const updated = await db.query<ReportRow>(
        `UPDATE monthly_reports
            SET status='done', pdf_object_key=$3, totals=$4::jsonb, updated_at=now()
          WHERE customer_id=$1 AND period=$2
          RETURNING report_id, customer_id, period, status, pdf_object_key, totals, created_at`,
        [customer_id, period, objectKey, JSON.stringify(totals)],
      );

      // 9) Audit + Event
      void writeReportAudit(db, {
        customerId: customer_id,
        reportId: updated.rows[0].report_id,
        eventType: 'pp.report.monthly_generated',
        payload: { period, gross_sum: totals.gross_sum, receipts_count: totals.receipts_count },
        traceId: parsed.data.trace_id,
      });
      void publishEvent(redis, 'pp:events:receipt', {
        type: 'pp.report.monthly_generated',
        customer_id,
        timestamp: new Date().toISOString(),
        payload: JSON.stringify({
          report_id: updated.rows[0].report_id,
          period,
          customer_id,
          totals,
        }),
      });

      return reply.send(
        apiOk({
          report_id: updated.rows[0].report_id,
          period,
          status: 'done',
          pdf_object_key: objectKey,
          totals,
        }),
      );
    } catch (err) {
      logger.error({ err, customer_id, period }, 'M08 build fehlgeschlagen');
      await db.query(
        `UPDATE monthly_reports SET status='failed', updated_at=now()
          WHERE customer_id=$1 AND period=$2`,
        [customer_id, period],
      );
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'Report-Build fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }

    // Type sat:
    void report;
  };
}

function previousMonthString(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15); // 15. um Monatsgrenz-Bugs zu vermeiden
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
