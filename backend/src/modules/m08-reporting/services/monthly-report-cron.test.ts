/**
 * T090/M08 — Unit-Tests für den Monats-Übergabe-Cron (ohne DB; Tenants-Listing,
 * Build- und Deliver-Service gemockt).
 *
 * Liegt im Modul-Test-Pfad (nicht in src/cron/, das die vitest-include-Pattern
 * nicht abdecken — vgl. pos-cleanup.test.ts). Fokus: aktive-Tenant-Filter,
 * Vormonats-Periode, Leer-Skip, no_recipient-Skip, alreadySent-Zählung,
 * Fehler-Isolation (ein Tenant-Fehler stoppt den Lauf nicht).
 */
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTenantsForStaff = vi.fn();
const buildMonthlyReport = vi.fn();
const deliverReport = vi.fn();

vi.mock('../../../routes/tenants.repository', () => ({
  listTenantsForStaff: (...a: unknown[]) => listTenantsForStaff(...a),
}));
vi.mock('./build-report.service', () => ({
  buildMonthlyReport: (...a: unknown[]) => buildMonthlyReport(...a),
}));
vi.mock('./handover-mail.service', () => ({
  deliverReport: (...a: unknown[]) => deliverReport(...a),
}));

import { runMonthlyReportCron } from '../../../cron/monthly-report';

const fakePool = {} as unknown as Pool;
const fakeS3 = {} as unknown as S3Client;
// 2026-06-15 → Vormonat Mai 2026 (5).
const NOW = new Date('2026-06-15T06:00:00Z');

function tenant(id: string, deletion_status = 'active') {
  return {
    id,
    slug: `s-${id}`,
    display_name: id,
    package: 'solo',
    deletion_status,
    onboarding_status: 'activated',
  };
}

function report(reportId: string, receiptsCount: number) {
  return { reportId, totals: { totals: { receipts_count: receiptsCount } } };
}

function run() {
  return runMonthlyReportCron({ pool: fakePool, s3: fakeS3, now: NOW });
}

beforeEach(() => {
  listTenantsForStaff.mockReset();
  buildMonthlyReport.mockReset();
  deliverReport.mockReset();
  buildMonthlyReport.mockResolvedValue(report('rep-1', 5));
  deliverReport.mockResolvedValue({ ok: true, deliveryId: 'del-1', dryRun: true });
});

describe('runMonthlyReportCron', () => {
  it('verarbeitet nur aktive Tenants und nutzt den Vormonat', async () => {
    listTenantsForStaff.mockResolvedValue([
      tenant('t1', 'active'),
      tenant('t2', 'cancelled'),
      tenant('t3', 'deletion_pending'),
    ]);
    const s = await run();

    expect(s.total_tenants).toBe(1);
    expect(buildMonthlyReport).toHaveBeenCalledTimes(1);
    // (deps, tenantId, year, month, opts)
    const args = buildMonthlyReport.mock.calls[0];
    expect(args[1]).toBe('t1');
    expect(args[2]).toBe(2026);
    expect(args[3]).toBe(5);
    expect(args[4].actor).toEqual({ type: 'system', id: 'cron:monthly-accountant-handover' });
    expect(s.built).toBe(1);
    expect(s.delivered).toBe(1);
    expect(s.failed).toBe(0);
  });

  it('versendet NICHT bei leerem Monat (0 Belege)', async () => {
    listTenantsForStaff.mockResolvedValue([tenant('t1')]);
    buildMonthlyReport.mockResolvedValue(report('rep-1', 0));
    const s = await run();

    expect(deliverReport).not.toHaveBeenCalled();
    expect(s.skipped_empty).toBe(1);
    expect(s.delivered).toBe(0);
    expect(s.failed).toBe(0);
  });

  it('zählt no_recipient als Skip (kein Fehler)', async () => {
    listTenantsForStaff.mockResolvedValue([tenant('t1')]);
    deliverReport.mockResolvedValue({ ok: false, reason: 'no_recipient' });
    const s = await run();

    expect(s.skipped_no_recipient).toBe(1);
    expect(s.failed).toBe(0);
  });

  it('ruft deliverReport mit skipIfAlreadySent und zählt alreadySent als delivered', async () => {
    listTenantsForStaff.mockResolvedValue([tenant('t1')]);
    deliverReport.mockResolvedValue({
      ok: true,
      deliveryId: 'del-1',
      dryRun: false,
      alreadySent: true,
    });
    const s = await run();

    expect(deliverReport.mock.calls[0][3]).toMatchObject({ skipIfAlreadySent: true });
    expect(s.delivered).toBe(1);
  });

  it('isoliert Fehler: Tenant-2-Crash stoppt den Lauf nicht', async () => {
    listTenantsForStaff.mockResolvedValue([tenant('t1'), tenant('t2'), tenant('t3')]);
    buildMonthlyReport
      .mockResolvedValueOnce(report('rep-1', 3))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(report('rep-3', 2));
    const s = await run();

    expect(s.total_tenants).toBe(3);
    expect(s.built).toBe(2);
    expect(s.delivered).toBe(2);
    expect(s.failed).toBe(1);
  });

  it('zählt send_failed als failed', async () => {
    listTenantsForStaff.mockResolvedValue([tenant('t1')]);
    deliverReport.mockResolvedValue({
      ok: false,
      reason: 'send_failed',
      deliveryId: 'd',
      error: 'x',
    });
    const s = await run();

    expect(s.failed).toBe(1);
    expect(s.delivered).toBe(0);
  });
});
