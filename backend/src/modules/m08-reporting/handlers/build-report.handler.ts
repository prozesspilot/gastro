/**
 * T087/M08 — POST /api/v1/reports/monthly/build
 *
 * Baut den Monats-Übersichtsbericht für einen Tenant + Periode und gibt die
 * Metadaten + eine presigned Download-URL zurück.
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook. Rolle `support` → 403 (read-only).
 * Body: { year?, month? } — Default = Vormonat (relativ zu jetzt).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { getPresignedDownloadUrl } from '../../../core/storage/storage.service';
import { buildMonthlyReport } from '../services/build-report.service';

interface BuildBody {
  year?: number;
  month?: number;
}

/** Vormonat relativ zu `now` (Default-Periode, wenn der Body keine angibt). */
export function defaultPeriod(now: Date): { year: number; month: number } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1..12
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

export async function buildReportHandler(
  req: FastifyRequest<{ Body: BuildBody }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role === 'support') {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Support-Rolle darf keine Reports erzeugen.' });
  }

  const body = req.body ?? {};
  const fallback = defaultPeriod(new Date());
  const year = body.year ?? fallback.year;
  const month = body.month ?? fallback.month;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return reply.code(400).send({ error: 'invalid_period', message: 'Jahr ist ungültig.' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return reply
      .code(400)
      .send({ error: 'invalid_period', message: 'Monat muss zwischen 1 und 12 liegen.' });
  }

  const s3 = req.server.s3;
  if (!s3) {
    return reply
      .code(500)
      .send({ error: 'storage_not_configured', message: 'S3-Client nicht initialisiert.' });
  }

  const result = await buildMonthlyReport({ db: req.server.db, s3 }, tenantId, year, month, {
    actor: { type: 'staff', id: staff.userId },
  });

  const downloadUrl = await getPresignedDownloadUrl(s3, result.pdfObjectKey);

  return reply.code(200).send({
    report_id: result.reportId,
    period: { year: result.period.year, month: result.period.month },
    totals: result.totals.totals,
    by_category: result.totals.by_category,
    top_suppliers: result.totals.top_suppliers,
    comparison_prev_month: result.totals.comparison_prev_month,
    pdf_object_key: result.pdfObjectKey,
    download_url: downloadUrl,
    created_at: result.createdAt,
  });
}
