/**
 * M08 — PDF-Renderer (pdf-lib).
 *
 * Layout (laut Auftrag):
 *   - Titelseite: ProzessPilot Monatsbericht + Periode + Kundenname
 *   - KPI-Box:    Belege gesamt, Brutto, Netto, Trend vs. Vormonat
 *   - Top-5 Kategorien als Text-Tabelle
 *   - Top-5 Lieferanten als Text-Tabelle
 *   - Footer:     Erstellt von ProzessPilot am {Datum}, Seite X/Y
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { MonthlyTotals } from './aggregator';

export interface RenderOptions {
  totals: MonthlyTotals;
  period: string;
  customerName: string;
}

export async function renderMonthlyReport(opts: RenderOptions): Promise<Buffer> {
  const { totals, period, customerName } = opts;
  const doc = await PDFDocument.create();
  doc.setProducer('ProzessPilot');
  doc.setCreator('ProzessPilot M08');
  doc.setCreationDate(new Date());

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageOrder: string[] = [];

  // ── Page 1: Titel ──────────────────────────────────────────────────────
  {
    const page = doc.addPage([595, 842]); // A4
    page.drawText('ProzessPilot', {
      x: 50,
      y: 760,
      size: 28,
      font: helvBold,
      color: rgb(0.1, 0.2, 0.55),
    });
    page.drawText('Monatsbericht', {
      x: 50,
      y: 720,
      size: 22,
      font: helv,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(`Periode: ${period}`, { x: 50, y: 680, size: 14, font: helv });
    page.drawText(`Kunde: ${customerName}`, { x: 50, y: 660, size: 14, font: helv });
    drawFooter(page, helv, 1, '?');
    pageOrder.push('title');
  }

  // ── Page 2: KPIs ───────────────────────────────────────────────────────
  {
    const page = doc.addPage([595, 842]);
    page.drawText('Kennzahlen', { x: 50, y: 780, size: 18, font: helvBold });

    const kpis: Array<[string, string]> = [
      ['Belege gesamt', String(totals.receipts_count)],
      ['Brutto-Summe', formatEuro(totals.gross_sum)],
      ['Netto-Summe', formatEuro(totals.net_sum)],
      [
        'Trend vs. Vormonat',
        totals.trend_pct === null
          ? '–'
          : `${totals.trend_pct > 0 ? '+' : ''}${totals.trend_pct.toFixed(1)} %`,
      ],
    ];

    let y = 720;
    for (const [k, v] of kpis) {
      page.drawText(k, { x: 60, y, size: 12, font: helv, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(v, { x: 320, y, size: 12, font: helvBold });
      y -= 32;
    }
    drawFooter(page, helv, 2, '?');
    pageOrder.push('kpi');
  }

  // ── Page 3: Top-Kategorien ──────────────────────────────────────────────
  {
    const page = doc.addPage([595, 842]);
    page.drawText('Top 5 Kategorien', { x: 50, y: 780, size: 18, font: helvBold });

    drawTableHeader(page, helvBold, 740, ['Kategorie', 'Anzahl', 'Brutto']);
    let y = 720;
    if (totals.top_categories.length === 0) {
      page.drawText('Keine Daten für diese Periode.', { x: 60, y, size: 11, font: helv });
    } else {
      for (const c of totals.top_categories) {
        page.drawText(truncate(c.label, 40), { x: 60, y, size: 11, font: helv });
        page.drawText(String(c.n), { x: 360, y, size: 11, font: helv });
        page.drawText(formatEuro(c.gross_sum), { x: 440, y, size: 11, font: helv });
        y -= 22;
      }
    }
    drawFooter(page, helv, 3, '?');
    pageOrder.push('cat');
  }

  // ── Page 4: Top-Lieferanten ─────────────────────────────────────────────
  {
    const page = doc.addPage([595, 842]);
    page.drawText('Top 5 Lieferanten', { x: 50, y: 780, size: 18, font: helvBold });

    drawTableHeader(page, helvBold, 740, ['Lieferant', 'Anzahl', 'Brutto']);
    let y = 720;
    if (totals.top_suppliers.length === 0) {
      page.drawText('Keine Daten für diese Periode.', { x: 60, y, size: 11, font: helv });
    } else {
      for (const s of totals.top_suppliers) {
        page.drawText(truncate(s.supplier, 40), { x: 60, y, size: 11, font: helv });
        page.drawText(String(s.n), { x: 360, y, size: 11, font: helv });
        page.drawText(formatEuro(s.gross_sum), { x: 440, y, size: 11, font: helv });
        y -= 22;
      }
    }
    drawFooter(page, helv, 4, '?');
    pageOrder.push('sup');
  }

  // ── Footer-Pagination nachziehen ──────────────────────────────────────
  const total = pageOrder.length;
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i];
    // Footer war mit '?' platziert — wir überschreiben einfach mit weißem Rect + neuem Text
    p.drawRectangle({
      x: 50,
      y: 30,
      width: 495,
      height: 12,
      color: rgb(1, 1, 1),
    });
    drawFooter(p, helv, i + 1, String(total));
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function drawTableHeader(
  page: ReturnType<PDFDocument['addPage']>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  y: number,
  cols: string[],
): void {
  const xs = [60, 360, 440];
  for (let i = 0; i < cols.length; i += 1) {
    page.drawText(cols[i], { x: xs[i], y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
  }
  page.drawLine({
    start: { x: 50, y: y - 4 },
    end: { x: 545, y: y - 4 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
}

function drawFooter(
  page: ReturnType<PDFDocument['addPage']>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  pageIdx: number,
  total: string,
): void {
  const date = new Date().toISOString().slice(0, 10);
  page.drawText(`Erstellt von ProzessPilot am ${date}  ·  Seite ${pageIdx}/${total}`, {
    x: 50,
    y: 30,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

function formatEuro(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
