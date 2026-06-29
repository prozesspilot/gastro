/**
 * T087/M08 — Unit-Tests für den Build-Report-Handler (ohne DB/S3, Service gemockt).
 *
 * Fokus: Auth-/Rollen-Gate, Perioden-Validierung, Default-Periode (Vormonat),
 * Response-Form. Die fachliche Build-Logik wird separat integrationsgetestet.
 */
import type { FastifyReply } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildMonthlyReport = vi.fn();
const getPresignedDownloadUrl = vi.fn();

vi.mock('../services/build-report.service', () => ({
  buildMonthlyReport: (...args: unknown[]) => buildMonthlyReport(...args),
}));
vi.mock('../../../core/storage/storage.service', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) => getPresignedDownloadUrl(...args),
}));

import { buildReportHandler, defaultPeriod } from './build-report.handler';

interface Captured {
  status: number;
  payload: Record<string, unknown>;
}

function makeReply(): { reply: FastifyReply; captured: Captured } {
  const captured: Captured = { status: 0, payload: {} };
  const reply = {
    code(n: number) {
      captured.status = n;
      return this;
    },
    send(p: Record<string, unknown>) {
      captured.payload = p;
      return this;
    },
  } as unknown as FastifyReply;
  return { reply, captured };
}

type HandlerReq = Parameters<typeof buildReportHandler>[0];

function makeReq(over: Record<string, unknown> = {}): HandlerReq {
  return {
    tenantId: 'tenant-1',
    m14Staff: { userId: 'staff-1', role: 'mitarbeiter' },
    body: {},
    server: { db: {}, s3: {} },
    ...over,
  } as unknown as HandlerReq;
}

beforeEach(() => {
  buildMonthlyReport.mockReset();
  getPresignedDownloadUrl.mockReset();
  buildMonthlyReport.mockResolvedValue({
    reportId: 'rep-1',
    period: { year: 2026, month: 4 },
    totals: {
      totals: { receipts_count: 1, gross_sum: 10 },
      by_category: [],
      top_suppliers: [],
      comparison_prev_month: { gross_sum: 0, delta_percent: null },
    },
    pdfObjectKey: 'tenant-1/reports/2026-04/monthly.pdf',
    createdAt: new Date('2026-05-01T00:00:00Z'),
  });
  getPresignedDownloadUrl.mockResolvedValue('https://minio/presigned');
});

describe('defaultPeriod', () => {
  it('liefert den Vormonat', () => {
    expect(defaultPeriod(new Date('2026-05-15T12:00:00Z'))).toEqual({ year: 2026, month: 4 });
  });
  it('rollt im Januar auf Dezember des Vorjahres', () => {
    expect(defaultPeriod(new Date('2026-01-10T12:00:00Z'))).toEqual({ year: 2025, month: 12 });
  });
});

describe('buildReportHandler', () => {
  it('401 ohne Auth/Tenant', async () => {
    const { reply, captured } = makeReply();
    await buildReportHandler(makeReq({ m14Staff: undefined }), reply);
    expect(captured.status).toBe(401);
    expect(buildMonthlyReport).not.toHaveBeenCalled();
  });

  it('403 für Rolle support', async () => {
    const { reply, captured } = makeReply();
    await buildReportHandler(makeReq({ m14Staff: { userId: 's', role: 'support' } }), reply);
    expect(captured.status).toBe(403);
    expect(buildMonthlyReport).not.toHaveBeenCalled();
  });

  it('400 bei ungültigem Monat', async () => {
    const { reply, captured } = makeReply();
    await buildReportHandler(makeReq({ body: { year: 2026, month: 13 } }), reply);
    expect(captured.status).toBe(400);
  });

  it('500 wenn S3 nicht konfiguriert', async () => {
    const { reply, captured } = makeReply();
    await buildReportHandler(makeReq({ server: { db: {}, s3: undefined } }), reply);
    expect(captured.status).toBe(500);
  });

  it('200 mit Metadaten + presigned URL; nutzt Default-Periode bei leerem Body', async () => {
    const { reply, captured } = makeReply();
    await buildReportHandler(makeReq({ body: {} }), reply);
    expect(captured.status).toBe(200);
    expect(captured.payload.report_id).toBe('rep-1');
    expect(captured.payload.download_url).toBe('https://minio/presigned');
    // Service mit aufgelöster (Default-)Periode aufgerufen — year/month sind Zahlen.
    const callArgs = buildMonthlyReport.mock.calls[0];
    expect(typeof callArgs[2]).toBe('number'); // year
    expect(typeof callArgs[3]).toBe('number'); // month
  });

  it('reicht eine explizite Periode an den Service durch', async () => {
    const { reply } = makeReply();
    await buildReportHandler(makeReq({ body: { year: 2025, month: 11 } }), reply);
    const callArgs = buildMonthlyReport.mock.calls[0];
    expect(callArgs[2]).toBe(2025);
    expect(callArgs[3]).toBe(11);
  });
});
