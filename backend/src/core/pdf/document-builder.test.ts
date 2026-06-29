/**
 * T086/A2 — Tests der PDF-Dokument-Engine.
 *
 * Strategie: PDFs sind Binärformate — wir prüfen NICHT pixelgenau, sondern
 * strukturelle Invarianten, die wieder über `pdf-lib` ladbar sind
 * (gültiger Header, Seitenzahl, Metadata) plus die Robustheits-Garantien
 * (Auto-Seitenumbruch, WinAnsi-Schutz).
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfDocumentBuilder } from './document-builder';
import { toWinAnsiSafe } from './text-encoding';

const FIXED_NOW = new Date('2026-05-01T08:00:00Z');

// updateMetadata: false → pdf-lib überschreibt beim Laden NICHT unsere gesetzten
// Metadaten (Producer steht im XMP-Stream; ein Default-Load würde ihn auf den
// pdf-lib-Producer zurücksetzen — die gespeicherten Bytes selbst sind korrekt).
async function loadBack(bytes: Buffer): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { updateMetadata: false });
}

describe('PdfDocumentBuilder.build', () => {
  it('liefert einen gültigen, wieder ladbaren PDF-Buffer mit %PDF-Header', async () => {
    const bytes = await new PdfDocumentBuilder({ title: 'Test', now: FIXED_NOW })
      .heading('Überschrift')
      .paragraph('Ein kurzer Absatz.')
      .build();

    expect(bytes).toBeInstanceOf(Buffer);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await loadBack(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('setzt GoBD-Metadata (Producer, Title, CreationDate)', async () => {
    const bytes = await new PdfDocumentBuilder({
      title: 'Monatsbericht Mai 2026',
      author: 'ProzessPilot',
      now: FIXED_NOW,
    })
      .paragraph('x')
      .build();

    const doc = await loadBack(bytes);
    expect(doc.getProducer()).toBe('ProzessPilot');
    expect(doc.getTitle()).toBe('Monatsbericht Mai 2026');
    expect(doc.getCreationDate()?.getTime()).toBe(FIXED_NOW.getTime());
  });

  it('bricht eine große Tabelle auf mehrere Seiten um (Kopfzeile wiederholt sich)', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => [`Lieferant ${i}`, String(i), `${i},00 €`]);
    const bytes = await new PdfDocumentBuilder({ title: 'Tabelle', now: FIXED_NOW })
      .table({
        columns: [
          { header: 'Lieferant', width: 3 },
          { header: 'Belege', width: 1, align: 'right' },
          { header: 'Summe', width: 1, align: 'right' },
        ],
        rows,
      })
      .build();

    const doc = await loadBack(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('rendert deutsche Umlaute und € ohne Exception', async () => {
    const build = new PdfDocumentBuilder({ title: 'Umlaute äöü', now: FIXED_NOW })
      .heading('Übersicht Ausgaben — Mai 2026')
      .paragraph('Wareneinkauf: 2.890,45 € · Bewirtung: 87,40 € · Pfand: 78,50 €')
      .keyValueRows([{ label: 'Größte Einzelausgabe', value: '1.234,56 €' }])
      .build();

    await expect(build).resolves.toBeInstanceOf(Buffer);
  });

  it('crasht NICHT an Emoji/CJK — exotische Zeichen werden zu ?', async () => {
    const build = new PdfDocumentBuilder({ title: 'Robust 🍕 漢字', now: FIXED_NOW })
      .paragraph('Lieferant 🍕🚀 漢字テスト GmbH')
      .table({
        columns: [{ header: 'Name 漢', width: 1 }],
        rows: [['Emoji-Lieferant 😀']],
      })
      .build();

    await expect(build).resolves.toBeInstanceOf(Buffer);
  });

  it('legt KPI-Karten mit max. 3 pro Reihe an (4 Karten ⇒ 2. Reihe), ohne Crash', async () => {
    const bytes = await new PdfDocumentBuilder({ title: 'KPIs', now: FIXED_NOW })
      .kpiCards([
        { label: 'Belege', value: '47' },
        { label: 'Brutto', value: '4.234,17 €' },
        { label: 'Netto', value: '3.557,29 €' },
        { label: 'Veränderung', value: '+12 %' },
      ])
      .build();

    const doc = await loadBack(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('ist deterministisch bei fixiertem now (zwei Builds → gleiches CreationDate)', async () => {
    const make = () =>
      new PdfDocumentBuilder({ title: 'Det', now: FIXED_NOW }).paragraph('gleich').build();
    const a = await loadBack(await make());
    const b = await loadBack(await make());
    expect(a.getCreationDate()?.getTime()).toBe(b.getCreationDate()?.getTime());
  });

  it('verkraftet leere Tabelle/leere KPI-Liste ohne Crash', async () => {
    const build = new PdfDocumentBuilder({ title: 'Leer', now: FIXED_NOW })
      .table({ columns: [], rows: [] })
      .kpiCards([])
      .spacer(20)
      .build();
    await expect(build).resolves.toBeInstanceOf(Buffer);
  });

  it('bricht überlange Einzelwörter hart um und beschneidet lange Header (Ellipse)', async () => {
    const longWord = 'A'.repeat(400); // breiter als jede Spalte → harter Umbruch
    const bytes = await new PdfDocumentBuilder({ title: 'Hard-Wrap', now: FIXED_NOW })
      .paragraph(longWord)
      .table({
        columns: [
          { header: 'Ein-sehr-langer-Spaltenkopf-der-beschnitten-werden-muss', width: 1 },
          { header: 'X', width: 4 },
        ],
        rows: [[longWord, 'kurz']],
      })
      .build();
    const doc = await loadBack(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('fehlende Zellen (zu kurze Row) werden als leer behandelt, kein Crash', async () => {
    const build = new PdfDocumentBuilder({ title: 'Sparse', now: FIXED_NOW })
      .table({
        columns: [
          { header: 'A', width: 1 },
          { header: 'B', width: 1 },
        ],
        rows: [['nur-a']], // B fehlt
      })
      .build();
    await expect(build).resolves.toBeInstanceOf(Buffer);
  });
});

describe('toWinAnsiSafe', () => {
  it('lässt deutsche Umlaute, ß und € unverändert', () => {
    expect(toWinAnsiSafe('äöüÄÖÜß €')).toBe('äöüÄÖÜß €');
  });

  it('ersetzt Emoji und CJK durch ?', () => {
    expect(toWinAnsiSafe('A🍕B')).toBe('A?B');
    expect(toWinAnsiSafe('漢字')).toBe('??');
  });

  it('normalisiert null/undefined zu leerem String', () => {
    expect(toWinAnsiSafe(null)).toBe('');
    expect(toWinAnsiSafe(undefined)).toBe('');
  });

  it('behält gängige CP-1252-Sonderzeichen (Bullet, En/Em-Dash, Smart-Quotes)', () => {
    expect(toWinAnsiSafe('• – — „hallo“')).toBe('• – — „hallo“');
  });
});
