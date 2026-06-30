/**
 * M07 — GET /api/v1/exports/belege.csv?year=&month=
 *
 * Liefert die verbuchten Belege eines Monats als CSV-Download (Steuerberater-
 * Fallback ohne Lexware-Direktanbindung). Auth: m14StaffAuthHook +
 * m14TenantContextHook; Rolle `support` → 403 (read-only-Export wie M08).
 * Ohne year/month → Vormonat (Default wie M08).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildBelegeCsv, csvFileName } from '../services/belege-csv';
import { fetchBelegeForMonth } from '../services/belege-export.repository';

interface ExportQuery {
  year?: string;
  month?: string;
}

/** Vormonat relativ zu `now` (Default-Periode). */
export function defaultPeriod(now: Date): { year: number; month: number } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

export async function exportBelegeCsvHandler(
  req: FastifyRequest<{ Querystring: ExportQuery }>,
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
      .send({ error: 'forbidden', message: 'Support-Rolle darf keinen Export erzeugen.' });
  }

  const fallback = defaultPeriod(new Date());
  const year = req.query.year !== undefined ? Number(req.query.year) : fallback.year;
  const month = req.query.month !== undefined ? Number(req.query.month) : fallback.month;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return reply.code(400).send({ error: 'invalid_period', message: 'Jahr ist ungültig.' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return reply
      .code(400)
      .send({ error: 'invalid_period', message: 'Monat muss zwischen 1 und 12 liegen.' });
  }

  const rows = await fetchBelegeForMonth(req.server.db, tenantId, year, month);
  const csv = buildBelegeCsv(rows);

  return reply
    .code(200)
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${csvFileName(year, month)}"`)
    .send(csv);
}
