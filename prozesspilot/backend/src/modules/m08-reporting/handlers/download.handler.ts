/**
 * M08 — GET /api/v1/customers/:customer_id/reports/:report_id/download
 *
 * Leitet zur presigned S3-URL des PDFs weiter (oder streamt es direkt).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';
import { apiError } from '../../../core/schemas/common';
import { getPresignedDownloadUrl } from '../../../core/storage/storage.service';

interface ReportRow {
  report_id: string;
  status: string;
  pdf_object_key: string | null;
  period: string;
}

export function buildDownloadHandler() {
  return async function downloadHandler(
    req: FastifyRequest<{ Params: { customer_id: string; report_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customer_id, report_id } = req.params;
    const db: Pool = req.server.db;
    const s3 = req.server.s3 as S3Client | undefined;

    const { rows } = await db.query<ReportRow>(
      `SELECT report_id, status, pdf_object_key, period
         FROM monthly_reports
        WHERE customer_id = $1 AND report_id = $2
        LIMIT 1`,
      [customer_id, report_id],
    );

    const report = rows[0];
    if (!report) {
      return reply.code(404).send(apiError('NOT_FOUND', `Report ${report_id} nicht gefunden.`));
    }
    if (report.status !== 'done' || !report.pdf_object_key) {
      return reply.code(409).send(apiError('REPORT_NOT_READY', `Report-Status: ${report.status}`));
    }

    if (!s3) {
      // Fallback: Direkt-Fehler wenn kein S3 konfiguriert
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'S3-Client nicht initialisiert.'));
    }

    try {
      const url = await getPresignedDownloadUrl(s3, report.pdf_object_key, 900); // 15 min
      return reply.redirect(302, url);
    } catch (err) {
      return reply.code(500).send(apiError('STORAGE_ERROR', 'PDF-Download-URL konnte nicht erstellt werden.', {
        message: (err as Error).message,
      }));
    }
  };
}
