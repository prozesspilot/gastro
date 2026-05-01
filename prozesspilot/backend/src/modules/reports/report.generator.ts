/**
 * Report-Generator — erstellt PDF-Belegübersichten mit pdf-lib.
 *
 * Layout:
 *   - Header: "ProzessPilot — Belegübersicht" + Mandantenname + Datum
 *   - Tabelle: Nr · Datum · Dateiname · Kategorie · Betrag · Status
 *   - Footer:  Seite x/y · Gesamtanzahl · Summe Beträge
 *
 * Farbschema: Dunkelblau #1e3a5f für Header, hellgrau für Alternativzeilen.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ReportReceipt {
  id:            string;
  status:        string;
  original_name: string | null;
  category:      string | null;
  amount:        number | null;
  currency:      string | null;
  date:          string | null;
  created_at:    string;
}

const HEADER_COLOR = rgb(0x1e / 255, 0x3a / 255, 0x5f / 255);
const ROW_ALT      = rgb(0.93, 0.95, 0.97);
const TEXT_COLOR   = rgb(0.1, 0.1, 0.1);

const PAGE_WIDTH  = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN      = 40;
const ROW_HEIGHT  = 22;

export async function generateReceiptReport(
  receipts: ReportReceipt[],
  tenantName: string,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const totalAmount = receipts.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const headers = ['Nr.', 'Datum', 'Dateiname', 'Kategorie', 'Betrag', 'Status'];
  const colWidths = [40, 70, 180, 100, 70, 60];
  const colX: number[] = [];
  let x = MARGIN;
  for (const w of colWidths) {
    colX.push(x);
    x += w;
  }

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const today = new Date().toISOString().slice(0, 10);

  const drawHeader = (p: typeof page): void => {
    p.drawRectangle({
      x: 0, y: PAGE_HEIGHT - 80, width: PAGE_WIDTH, height: 80, color: HEADER_COLOR,
    });
    p.drawText('ProzessPilot — Belegübersicht', {
      x: MARGIN, y: PAGE_HEIGHT - 40, size: 18, font: fontBold, color: rgb(1, 1, 1),
    });
    p.drawText(`Mandant: ${tenantName}`, {
      x: MARGIN, y: PAGE_HEIGHT - 60, size: 10, font, color: rgb(1, 1, 1),
    });
    p.drawText(`Erstellt: ${today}`, {
      x: PAGE_WIDTH - MARGIN - 120, y: PAGE_HEIGHT - 60, size: 10, font, color: rgb(1, 1, 1),
    });
  };

  const drawTableHeader = (p: typeof page, y: number): void => {
    p.drawRectangle({
      x: MARGIN - 4, y: y - 4, width: PAGE_WIDTH - 2 * MARGIN + 8, height: ROW_HEIGHT,
      color: HEADER_COLOR,
    });
    headers.forEach((h, i) => {
      p.drawText(h, {
        x: colX[i] + 2, y: y + 4, size: 9, font: fontBold, color: rgb(1, 1, 1),
      });
    });
  };

  drawHeader(page);
  let y = PAGE_HEIGHT - 110;
  drawTableHeader(page, y);
  y -= ROW_HEIGHT;

  const truncate = (s: string | null | undefined, max: number): string => {
    if (!s) return '—';
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  };

  receipts.forEach((r, idx) => {
    if (y < 80) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawHeader(page);
      y = PAGE_HEIGHT - 110;
      drawTableHeader(page, y);
      y -= ROW_HEIGHT;
    }

    if (idx % 2 === 1) {
      page.drawRectangle({
        x: MARGIN - 4, y: y - 4, width: PAGE_WIDTH - 2 * MARGIN + 8, height: ROW_HEIGHT,
        color: ROW_ALT,
      });
    }
    const cells = [
      String(idx + 1),
      truncate(r.date ?? r.created_at.slice(0, 10), 12),
      truncate(r.original_name, 32),
      truncate(r.category, 18),
      r.amount !== null ? `${r.amount.toFixed(2)} ${r.currency ?? ''}`.trim() : '—',
      r.status,
    ];
    cells.forEach((c, i) => {
      page.drawText(c, {
        x: colX[i] + 2, y: y + 4, size: 9, font, color: TEXT_COLOR,
      });
    });
    y -= ROW_HEIGHT;
  });

  // Footer
  const totalPages = pdf.getPageCount();
  const pages = pdf.getPages();
  pages.forEach((p, idx) => {
    p.drawText(
      `Seite ${idx + 1}/${totalPages}  ·  Gesamt: ${receipts.length} Belege  ·  Summe: ${totalAmount.toFixed(2)}`,
      {
        x: MARGIN, y: 30, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      },
    );
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
