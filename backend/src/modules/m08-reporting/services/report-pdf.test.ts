/**
 * T087/M08 — Unit-Tests für den Report-PDF-Renderer (ohne DB).
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { MonthlyAggregates } from './aggregator';
import { formatEur, periodLabel, renderMonthlyReportPdf } from './report-pdf';

const FIXED_NOW = new Date('2026-06-01T06:00:00Z');

function sampleData(overrides: Partial<MonthlyAggregates> = {}): MonthlyAggregates {
  return {
    period: { year: 2026, month: 5 },
    totals: { receipts_count: 47, gross_sum: 4234.17, largest_single: 1234.56 },
    by_category: [
      { category: 'wareneinkauf_food', label: 'Wareneinkauf Food', count: 30, gross_sum: 2890.45 },
      { category: 'bewirtung', label: 'Bewirtungskosten', count: 1, gross_sum: 87.4 },
    ],
    top_suppliers: [
      { supplier: 'Metro AG', count: 12, gross_sum: 2890.45 },
      { supplier: 'Edeka Großmarkt', count: 8, gross_sum: 743.1 },
    ],
    comparison_prev_month: { gross_sum: 3780.0, delta_percent: 12.0 },
    receipts_without_date: 0,
    ...overrides,
  };
}

describe('formatEur', () => {
  it('formatiert deutsche Tausender + Dezimal mit € ', () => {
    expect(formatEur(4234.17)).toBe('4.234,17 €');
    expect(formatEur(0)).toBe('0,00 €');
    expect(formatEur(1000000)).toBe('1.000.000,00 €');
    expect(formatEur(7.5)).toBe('7,50 €');
  });

  it('rundet auf Cent und behandelt negative Beträge', () => {
    expect(formatEur(99.999)).toBe('100,00 €');
    expect(formatEur(-12.3)).toBe('-12,30 €');
  });
});

describe('periodLabel', () => {
  it('gibt deutschen Monatsnamen + Jahr', () => {
    expect(periodLabel(2026, 5)).toBe('Mai 2026');
    expect(periodLabel(2026, 12)).toBe('Dezember 2026');
  });
});

describe('renderMonthlyReportPdf', () => {
  it('liefert ein gültiges, ladbares PDF mit GoBD-Titel', async () => {
    const bytes = await renderMonthlyReportPdf(sampleData(), {
      tenantName: 'Müller-Bistro',
      now: FIXED_NOW,
    });
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe('Monatsbericht Mai 2026 — Müller-Bistro');
  });

  it('rendert auch einen leeren Monat ohne Crash (0 Belege)', async () => {
    const empty = sampleData({
      totals: { receipts_count: 0, gross_sum: 0, largest_single: 0 },
      by_category: [],
      top_suppliers: [],
      comparison_prev_month: { gross_sum: 0, delta_percent: null },
    });
    const bytes = await renderMonthlyReportPdf(empty, { tenantName: 'Leer-GmbH', now: FIXED_NOW });
    expect(bytes).toBeInstanceOf(Buffer);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('verkraftet Lieferantennamen mit exotischem Unicode (WinAnsi-Schutz der Engine)', async () => {
    const data = sampleData({
      top_suppliers: [{ supplier: 'Sushi 🍣 漢字 GmbH', count: 2, gross_sum: 99.9 }],
    });
    await expect(
      renderMonthlyReportPdf(data, { tenantName: 'Test', now: FIXED_NOW }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
