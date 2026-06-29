/**
 * T086/A2 — Generische PDF-Dokument-Engine (`core/pdf`).
 *
 * Baut strukturierte Berichte (Überschriften, Fließtext, Kennzahlen,
 * KPI-Karten, Tabellen mit Auto-Seitenumbruch, Fußzeile mit Seitenzahl) als
 * PDF-**Buffer** — reine In-Memory-API ohne File-IO, analog `image-to-pdf.ts`.
 * Der Caller reicht die Bytes direkt nach MinIO/S3.
 *
 * **Warum `pdf-lib` statt puppeteer (Abweichung von M08-Spec §9):** Der
 * IONOS-Prod-Server ist RAM-/Swap-knapp (kein Chromium installiert). `pdf-lib`
 * läuft rein in-process, ohne Headless-Browser. Diagramme — falls je nötig —
 * kommen später als vektorielle `pdf-lib`-Balken, nicht über Chart.js.
 *
 * **Layout-Modell:** Elemente werden deklarativ gesammelt (`heading`, `table`,
 * …) und erst in `build()` gerendert. Das hält das Hinzufügen synchron (kein
 * `await` pro Zeile) und macht die Zwei-Pass-Fußzeile trivial: die
 * Gesamt-Seitenzahl steht erst nach dem Layout fest.
 */

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { KeyValueRow, KpiCard, PdfDocumentOptions, TableSpec } from './pdf.types';
import { toWinAnsiSafe } from './text-encoding';

// A4 in PostScript-Punkten (72 dpi).
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;

const FONT_BODY = 10;
const FONT_H1 = 18;
const FONT_H2 = 13;
const FONT_FOOTER = 8;
const FONT_KPI_LABEL = 8;
const FONT_KPI_VALUE = 15;

const LINE_FACTOR = 1.32; // Zeilenhöhe = Schriftgröße × Faktor

// ProzessPilot-Markenfarbe (Azure #0A95E0) für Überschriften/Akzente.
const BRAND = rgb(0x0a / 255, 0x95 / 255, 0xe0 / 255);
const TEXT = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.5, 0.5, 0.5);
const TABLE_HEADER_BG = rgb(0.93, 0.95, 0.98);
const ZEBRA_BG = rgb(0.97, 0.97, 0.98);
const BORDER = rgb(0.8, 0.8, 0.82);

const KPI_PER_ROW = 3;
const KPI_HEIGHT = 52;
const KPI_GAP = 12;
const CELL_PAD = 4;

type Element =
  | { kind: 'heading'; text: string; level: 1 | 2 }
  | { kind: 'paragraph'; text: string }
  | { kind: 'keyValue'; rows: KeyValueRow[] }
  | { kind: 'kpiCards'; cards: KpiCard[] }
  | { kind: 'table'; spec: TableSpec }
  | { kind: 'spacer'; height: number };

/**
 * Deklarativer Builder für ein mehrseitiges PDF-Dokument. Reihenfolge der
 * Aufrufe = Reihenfolge im Dokument. `build()` erzeugt die Bytes.
 *
 * Alle Methoden (außer `build`) geben `this` zurück (Chaining) und sind
 * synchron. Jeder Text läuft beim Rendern durch {@link toWinAnsiSafe}.
 */
export class PdfDocumentBuilder {
  private readonly elements: Element[] = [];
  private readonly opts: PdfDocumentOptions;

  // Render-Zustand (nur während build() gültig).
  private doc!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  private y = 0;

  constructor(opts: PdfDocumentOptions) {
    this.opts = opts;
  }

  heading(text: string, level: 1 | 2 = 1): this {
    this.elements.push({ kind: 'heading', text, level });
    return this;
  }

  paragraph(text: string): this {
    this.elements.push({ kind: 'paragraph', text });
    return this;
  }

  keyValueRows(rows: KeyValueRow[]): this {
    this.elements.push({ kind: 'keyValue', rows });
    return this;
  }

  kpiCards(cards: KpiCard[]): this {
    this.elements.push({ kind: 'kpiCards', cards });
    return this;
  }

  table(spec: TableSpec): this {
    this.elements.push({ kind: 'table', spec });
    return this;
  }

  spacer(height: number): this {
    this.elements.push({ kind: 'spacer', height });
    return this;
  }

  /** Rendert das Dokument und gibt die PDF-Bytes zurück. */
  async build(): Promise<Buffer> {
    const now = this.opts.now ?? new Date();

    this.doc = await PDFDocument.create({ updateMetadata: false });
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);

    // GoBD-Metadata.
    this.doc.setProducer('ProzessPilot');
    this.doc.setTitle(toWinAnsiSafe(this.opts.title));
    if (this.opts.author) this.doc.setAuthor(toWinAnsiSafe(this.opts.author));
    this.doc.setCreationDate(now);

    this.addPage();

    for (const el of this.elements) {
      this.renderElement(el);
    }

    this.drawFooters(now);

    return Buffer.from(await this.doc.save());
  }

  // ── Seiten-/Cursor-Verwaltung ────────────────────────────────────────────

  private get contentWidth(): number {
    return A4[0] - 2 * MARGIN;
  }

  private get bottomLimit(): number {
    return MARGIN + 24; // Platz für die Fußzeile freihalten.
  }

  private addPage(): void {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  /** Stellt sicher, dass `needed` Punkte vertikal frei sind — sonst neue Seite. */
  private ensureSpace(needed: number): void {
    if (this.y - needed < this.bottomLimit) {
      this.addPage();
    }
  }

  // ── Text-Primitiven ──────────────────────────────────────────────────────

  private drawText(
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    color = TEXT,
  ): void {
    this.page.drawText(toWinAnsiSafe(text), { x, y, size, font, color });
  }

  /** Bricht `text` an Wortgrenzen auf `maxWidth` um. Sehr lange Einzelwörter werden hart geschnitten. */
  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const safe = toWinAnsiSafe(text).replace(/\r\n?/g, '\n');
    const lines: string[] = [];
    for (const rawLine of safe.split('\n')) {
      const words = rawLine.split(/\s+/).filter((w) => w.length > 0);
      if (words.length === 0) {
        lines.push('');
        continue;
      }
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          // Wort allein zu breit → hart umbrechen.
          if (font.widthOfTextAtSize(word, size) > maxWidth) {
            let chunk = '';
            for (const ch of word) {
              if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
                lines.push(chunk);
                chunk = ch;
              } else {
                chunk += ch;
              }
            }
            current = chunk;
          } else {
            current = word;
          }
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  // ── Element-Renderer ───────────────────────────────────────────────────────

  private renderElement(el: Element): void {
    switch (el.kind) {
      case 'heading':
        this.renderHeading(el.text, el.level);
        break;
      case 'paragraph':
        this.renderParagraph(el.text);
        break;
      case 'keyValue':
        this.renderKeyValues(el.rows);
        break;
      case 'kpiCards':
        this.renderKpiCards(el.cards);
        break;
      case 'table':
        this.renderTable(el.spec);
        break;
      case 'spacer':
        this.ensureSpace(el.height);
        this.y -= el.height;
        break;
    }
  }

  private renderHeading(text: string, level: 1 | 2): void {
    const size = level === 1 ? FONT_H1 : FONT_H2;
    const lineHeight = size * LINE_FACTOR;
    this.ensureSpace(lineHeight + 6);
    this.y -= lineHeight;
    this.drawText(text, MARGIN, this.y, size, this.bold, BRAND);
    if (level === 1) {
      // Unterstrich-Linie.
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - 4 },
        end: { x: A4[0] - MARGIN, y: this.y - 4 },
        thickness: 0.8,
        color: BRAND,
      });
    }
    this.y -= 6;
  }

  private renderParagraph(text: string): void {
    const lineHeight = FONT_BODY * LINE_FACTOR;
    for (const line of this.wrap(text, this.font, FONT_BODY, this.contentWidth)) {
      this.ensureSpace(lineHeight);
      this.y -= lineHeight;
      this.drawText(line, MARGIN, this.y, FONT_BODY, this.font);
    }
  }

  private renderKeyValues(rows: KeyValueRow[]): void {
    const lineHeight = FONT_BODY * LINE_FACTOR + 2;
    const labelWidth = this.contentWidth * 0.6;
    const valueX = MARGIN + labelWidth + 10;
    for (const row of rows) {
      this.ensureSpace(lineHeight);
      this.y -= lineHeight;
      this.drawText(row.label, MARGIN, this.y, FONT_BODY, this.font, MUTED);
      this.drawText(row.value, valueX, this.y, FONT_BODY, this.bold);
    }
  }

  private renderKpiCards(cards: KpiCard[]): void {
    if (cards.length === 0) return;
    const totalGap = KPI_GAP * (KPI_PER_ROW - 1);
    const cardWidth = (this.contentWidth - totalGap) / KPI_PER_ROW;

    for (let i = 0; i < cards.length; i += KPI_PER_ROW) {
      const rowCards = cards.slice(i, i + KPI_PER_ROW);
      this.ensureSpace(KPI_HEIGHT + KPI_GAP);
      this.y -= KPI_HEIGHT;
      const topY = this.y;
      rowCards.forEach((card, col) => {
        const x = MARGIN + col * (cardWidth + KPI_GAP);
        this.page.drawRectangle({
          x,
          y: topY,
          width: cardWidth,
          height: KPI_HEIGHT,
          borderColor: BORDER,
          borderWidth: 1,
          color: rgb(1, 1, 1),
        });
        this.drawText(card.label, x + 8, topY + KPI_HEIGHT - 16, FONT_KPI_LABEL, this.font, MUTED);
        this.drawText(card.value, x + 8, topY + 12, FONT_KPI_VALUE, this.bold, BRAND);
      });
      this.y -= KPI_GAP;
    }
  }

  private renderTable(spec: TableSpec): void {
    const { columns, rows } = spec;
    const zebra = spec.zebra ?? true;
    if (columns.length === 0) return;

    // Spaltenbreiten aus relativen Gewichten normalisieren.
    const weightSum = columns.reduce((s, c) => s + (c.width > 0 ? c.width : 1), 0);
    const colWidths = columns.map(
      (c) => ((c.width > 0 ? c.width : 1) / weightSum) * this.contentWidth,
    );
    const colX: number[] = [];
    let acc = MARGIN;
    for (const w of colWidths) {
      colX.push(acc);
      acc += w;
    }

    const lineHeight = FONT_BODY * LINE_FACTOR;

    const drawHeaderRow = (): void => {
      const headerHeight = lineHeight + 2 * CELL_PAD;
      this.ensureSpace(headerHeight);
      this.y -= headerHeight;
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y,
        width: this.contentWidth,
        height: headerHeight,
        color: TABLE_HEADER_BG,
      });
      columns.forEach((c, idx) => {
        const cellW = colWidths[idx] - 2 * CELL_PAD;
        const text = toWinAnsiSafe(c.header);
        const tx =
          c.align === 'right'
            ? colX[idx] + colWidths[idx] - CELL_PAD - this.bold.widthOfTextAtSize(text, FONT_BODY)
            : colX[idx] + CELL_PAD;
        // Header einzeilig (ggf. beschnitten).
        this.drawText(
          this.clip(text, this.bold, FONT_BODY, cellW),
          tx,
          this.y + CELL_PAD + 2,
          FONT_BODY,
          this.bold,
        );
      });
    };

    drawHeaderRow();

    rows.forEach((row, rowIdx) => {
      // Zeilenhöhe = höchste umgebrochene Zelle.
      const wrapped = columns.map((c, idx) =>
        this.wrap(row[idx] ?? '', this.font, FONT_BODY, colWidths[idx] - 2 * CELL_PAD),
      );
      const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
      const rowHeight = maxLines * lineHeight + 2 * CELL_PAD;

      if (this.y - rowHeight < this.bottomLimit) {
        this.addPage();
        drawHeaderRow();
      }

      this.y -= rowHeight;
      if (zebra && rowIdx % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y,
          width: this.contentWidth,
          height: rowHeight,
          color: ZEBRA_BG,
        });
      }
      columns.forEach((c, idx) => {
        const lines = wrapped[idx];
        lines.forEach((line, li) => {
          const lineY =
            this.y + rowHeight - CELL_PAD - (li + 1) * lineHeight + (lineHeight - FONT_BODY) / 2;
          const tx =
            c.align === 'right'
              ? colX[idx] + colWidths[idx] - CELL_PAD - this.font.widthOfTextAtSize(line, FONT_BODY)
              : colX[idx] + CELL_PAD;
          this.drawText(line, tx, lineY, FONT_BODY, this.font);
        });
      });
    });
  }

  /** Beschneidet einen einzeiligen Text auf `maxWidth`, hängt bei Bedarf „…" an. */
  private clip(text: string, font: PDFFont, size: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out}…`;
  }

  // ── Fußzeile (Zwei-Pass: Gesamtseitenzahl steht erst jetzt fest) ───────────

  private drawFooters(now: Date): void {
    const pages = this.doc.getPages();
    const total = pages.length;
    const dateStr = formatDate(now);
    pages.forEach((page, idx) => {
      const left = `Erstellt am ${dateStr}`;
      const right = `Seite ${idx + 1} / ${total}`;
      page.drawText(toWinAnsiSafe(left), {
        x: MARGIN,
        y: MARGIN - 6,
        size: FONT_FOOTER,
        font: this.font,
        color: MUTED,
      });
      const rightWidth = this.font.widthOfTextAtSize(right, FONT_FOOTER);
      page.drawText(right, {
        x: A4[0] - MARGIN - rightWidth,
        y: MARGIN - 6,
        size: FONT_FOOTER,
        font: this.font,
        color: MUTED,
      });
    });
  }
}

/** `dd.mm.yyyy` ohne Locale-Abhängigkeit (deterministisch für Tests). */
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}
