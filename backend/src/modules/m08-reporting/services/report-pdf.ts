/**
 * T087/M08 — Rendert die Monats-Aggregate als PDF (über die T086-PDF-Engine).
 *
 * Inhalt (M08-Spec §9.1, auf die belege-Welt reduziert):
 *   1. Kopf: Titel + Kunden-Name + Berichtszeitraum
 *   2. KPI-Karten: Belege, Brutto gesamt, Veränderung Vormonat, größte Einzelausgabe
 *   3. Tabelle: Ausgaben nach Kategorie
 *   4. Tabelle: Top-10 Lieferanten
 *
 * Diagramme + USt-Split bewusst NICHT hier (USt gehört in die Steuerberater-
 * Übergabe T089; Diagramme später als pdf-lib-Balken).
 */

import { PdfDocumentBuilder } from '../../../core/pdf';
import type { MonthlyAggregates } from './aggregator';

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** Deutscher Periodenname, z. B. „Mai 2026". */
export function periodLabel(year: number, month: number): string {
  const name = MONTHS_DE[month - 1] ?? String(month);
  return `${name} ${year}`;
}

/**
 * Formatiert einen Betrag als deutsches Währungsformat `1.234,56 €` —
 * bewusst ohne `Intl` (deterministisch, unabhängig von der Node-ICU-Variante).
 */
export function formatEur(amount: number): string {
  const negative = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  const eurosStr = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${eurosStr},${String(rest).padStart(2, '0')} €`;
}

/** Formatiert die Vormonats-Veränderung, z. B. „+12,3 %" / „–5 %" / „—" (kein Vormonat). */
function formatDelta(deltaPercent: number | null): string {
  if (deltaPercent === null) return '—';
  const sign = deltaPercent > 0 ? '+' : deltaPercent < 0 ? '–' : '';
  const abs = Math.abs(deltaPercent).toString().replace('.', ',');
  return `${sign}${abs} %`;
}

export interface RenderReportOptions {
  tenantName: string;
  /** Injizierbar für deterministische Tests (GoBD-CreationDate + Fußzeile). */
  now?: Date;
}

/** Rendert den Monats-Übersichtsbericht als PDF-Buffer. */
export async function renderMonthlyReportPdf(
  data: MonthlyAggregates,
  opts: RenderReportOptions,
): Promise<Buffer> {
  const period = periodLabel(data.period.year, data.period.month);
  const builder = new PdfDocumentBuilder({
    title: `Monatsbericht ${period} — ${opts.tenantName}`,
    author: 'ProzessPilot',
    now: opts.now,
  });

  builder.heading(`Monatsbericht ${period}`);
  builder.paragraph(
    `Aufbereitete Buchhaltungs-Übersicht für ${opts.tenantName}, Berichtszeitraum ${period}. Erstellt durch ProzessPilot.`,
  );

  builder.kpiCards([
    { label: 'Belege', value: String(data.totals.receipts_count) },
    { label: 'Brutto gesamt', value: formatEur(data.totals.gross_sum) },
    { label: 'Veränderung Vormonat', value: formatDelta(data.comparison_prev_month.delta_percent) },
    { label: 'Größte Einzelausgabe', value: formatEur(data.totals.largest_single) },
  ]);

  builder.heading('Ausgaben nach Kategorie', 2);
  if (data.by_category.length === 0) {
    builder.paragraph('Keine verbuchten Belege in diesem Zeitraum.');
  } else {
    builder.table({
      columns: [
        { header: 'Kategorie', width: 3 },
        { header: 'Belege', width: 1, align: 'right' },
        { header: 'Summe', width: 2, align: 'right' },
      ],
      rows: data.by_category.map((c) => [c.label, String(c.count), formatEur(c.gross_sum)]),
    });
  }

  builder.heading('Top-Lieferanten', 2);
  if (data.top_suppliers.length === 0) {
    builder.paragraph('Keine Lieferanten in diesem Zeitraum.');
  } else {
    builder.table({
      columns: [
        { header: 'Lieferant', width: 3 },
        { header: 'Belege', width: 1, align: 'right' },
        { header: 'Summe', width: 2, align: 'right' },
      ],
      rows: data.top_suppliers.map((s) => [s.supplier, String(s.count), formatEur(s.gross_sum)]),
    });
  }

  if (data.receipts_without_date > 0) {
    builder.spacer(8);
    builder.paragraph(
      `Hinweis: ${data.receipts_without_date} verbuchte Beleg(e) ohne erkanntes Belegdatum sind nicht im Monatsfenster enthalten.`,
    );
  }

  return builder.build();
}
