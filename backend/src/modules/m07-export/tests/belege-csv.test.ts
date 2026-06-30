/**
 * M07 — Tests für den puren CSV-Builder (kein I/O).
 */

import { describe, expect, it } from 'vitest';
import { type BelegExportRow, buildBelegeCsv, csvFileName } from '../services/belege-csv';

const BOM = '﻿';

function row(overrides: Partial<BelegExportRow> = {}): BelegExportRow {
  return {
    id: 'b-1',
    document_date: '2026-05-17',
    supplier_name: 'Metro AG',
    document_number: 'RE-2026-1042',
    category: 'wareneinkauf_food',
    category_label: 'Wareneinkauf Food',
    skr_account: '5100',
    total_gross: 119,
    total_net: 100,
    tax_amount: 19,
    tax_rate: 19,
    currency: 'EUR',
    status: 'categorized',
    received_at: '2026-05-18T10:00:00.000Z',
    ...overrides,
  };
}

/** Hilfsfunktion: CSV ohne BOM in Zeilen splitten. */
function lines(csv: string): string[] {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv.slice(BOM.length).replace(/\r\n$/, '').split('\r\n');
}

describe('buildBelegeCsv', () => {
  it('beginnt mit UTF-8-BOM und einer Header-Zeile', () => {
    const csv = buildBelegeCsv([]);
    const l = lines(csv);
    expect(l).toHaveLength(1);
    expect(l[0]).toBe(
      'Datum;Lieferant;Belegnummer;Kategorie;SKR-Konto;Brutto;Netto;MwSt-Betrag;MwSt-Satz;Waehrung;Status;Beleg-ID;Eingang am',
    );
  });

  it('mappt eine Zeile mit deutschem Dezimal-Komma + YYYY-MM-DD-Datum', () => {
    const csv = buildBelegeCsv([row()]);
    const l = lines(csv);
    expect(l).toHaveLength(2);
    expect(l[1]).toBe(
      '2026-05-17;Metro AG;RE-2026-1042;Wareneinkauf Food;5100;119,00;100,00;19,00;19%;EUR;categorized;b-1;2026-05-18',
    );
  });

  it('verwendet CRLF-Zeilenenden', () => {
    const csv = buildBelegeCsv([row()]);
    expect(csv).toContain('\r\n');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('leere Felder (null) werden zu leeren Spalten', () => {
    const csv = buildBelegeCsv([
      row({
        document_date: null,
        supplier_name: null,
        document_number: null,
        skr_account: null,
        total_net: null,
        tax_amount: null,
        tax_rate: null,
        received_at: null,
      }),
    ]);
    const cols = lines(csv)[1].split(';');
    expect(cols[0]).toBe(''); // Datum
    expect(cols[1]).toBe(''); // Lieferant
    expect(cols[2]).toBe(''); // Belegnummer
    expect(cols[4]).toBe(''); // SKR
    expect(cols[6]).toBe(''); // Netto
    expect(cols[7]).toBe(''); // MwSt-Betrag
    expect(cols[8]).toBe(''); // MwSt-Satz
    expect(cols[12]).toBe(''); // Eingang am
  });

  it('fällt bei fehlendem category_label auf die category-ID zurück', () => {
    const csv = buildBelegeCsv([row({ category_label: null, category: 'bewirtung' })]);
    expect(lines(csv)[1].split(';')[3]).toBe('bewirtung');
  });

  it('quotet Felder mit Trennzeichen, Anführungszeichen und Zeilenumbruch (RFC-4180)', () => {
    const csv = buildBelegeCsv([
      row({ supplier_name: 'Müller; Sohn "GmbH"\nFiliale', document_number: 'A;1' }),
    ]);
    const line = lines(csv)[1];
    // Lieferant: ; und " und \n → gewrappt, " verdoppelt.
    expect(line).toContain('"Müller; Sohn ""GmbH""\nFiliale"');
    // Belegnummer mit ; → gewrappt.
    expect(line).toContain('"A;1"');
  });

  it('rendert mehrere Zeilen in Eingabereihenfolge', () => {
    const csv = buildBelegeCsv([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
    const l = lines(csv);
    expect(l).toHaveLength(4); // Header + 3
    expect(l[1].split(';')[11]).toBe('a');
    expect(l[3].split(';')[11]).toBe('c');
  });

  it('NaN/Infinity-Beträge werden zu leer (defensiv)', () => {
    const csv = buildBelegeCsv([
      row({ total_gross: Number.NaN, total_net: Number.POSITIVE_INFINITY }),
    ]);
    const cols = lines(csv)[1].split(';');
    expect(cols[5]).toBe(''); // Brutto
    expect(cols[6]).toBe(''); // Netto
  });
});

describe('csvFileName', () => {
  it('formatiert mit führender Null im Monat', () => {
    expect(csvFileName(2026, 5)).toBe('belege-2026-05.csv');
    expect(csvFileName(2026, 12)).toBe('belege-2026-12.csv');
  });
});
