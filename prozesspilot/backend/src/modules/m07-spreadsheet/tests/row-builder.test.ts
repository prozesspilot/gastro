/**
 * M07 — row-builder Unit-Tests
 *
 * Deckt M07 §8 (16 Pflicht-Spalten + Reihenfolge), Kategorie-Fallback '–',
 * Hyperlink-Formel, MwSt-Summierung, MwSt-Satz-Dominanz und Extra-Columns.
 */

import { describe, expect, it } from 'vitest';
import { buildRow, buildHyperlinkFormula } from '../services/row-builder';
import { COLUMNS } from '../services/columns';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

function baseReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    receipt_id:  '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
    customer_id: 'cust_a3f4b2',
    status:      'archived',
    file: {
      object_key: 'cust/2026/04/file.jpg',
      mime_type:  'image/jpeg',
      size_bytes: 1024,
      sha256:     'f3b8a91c2d7e44bb',
    },
    extraction: {
      fields: {
        supplier_name:   'Pizzeria Bella Italia',
        document_number: 'RE-2026-1042',
        document_date:   '2026-04-28',
        currency:        'EUR',
        total_gross:     142.85,
        total_net:       120.04,
        payment_method:  'cash',
        tax_lines: [
          { rate: 0.19, base: 100.00, amount: 19.00 },
          { rate: 0.07, base:  20.04, amount:  1.40 },
        ],
      },
    },
    categorization: {
      category_label: 'Wareneinkauf Lebensmittel',
      skr_account:    '3100',
      cost_center:    'kueche',
    },
    archive: {
      path:         '/PP/Bella Italia/2026/04/2026-04-28_RE-2026-1042.pdf',
      external_id:  '1aB2cD3e',
      external_url: 'https://drive.google.com/file/d/1aB2cD3e/view',
    },
    audit: {
      events: [
        { at: '2026-04-29T08:14:21Z', type: 'received',  actor: 'system' },
        { at: '2026-04-29T08:14:48Z', type: 'archived',  actor: 'system' },
      ],
    },
    ...overrides,
  };
}

describe('M07 row-builder — buildRow()', () => {
  it('liefert exakt 16 Spalten in der spezifizierten Reihenfolge', () => {
    const row = buildRow(baseReceipt());
    expect(row).toHaveLength(16);
    expect(COLUMNS).toHaveLength(16);

    expect(row[0]).toBe('2026-04-28');                    // A Datum
    expect(row[1]).toBe('Pizzeria Bella Italia');          // B Lieferant
    expect(row[2]).toBe('RE-2026-1042');                   // C Belegnummer
    expect(row[3]).toBe('Wareneinkauf Lebensmittel');      // D Kategorie
    expect(row[4]).toBe('3100');                           // E SKR-Konto
    expect(row[5]).toBe('kueche');                         // F Kostenstelle
    expect(row[6]).toBe(142.85);                           // G Brutto
    expect(row[7]).toBe(120.04);                           // H Netto
    expect(row[8]).toBe(20.4);                             // I MwSt-Betrag (19+1.40)
    expect(row[9]).toBe(19);                               // J Dominanter Satz × 100
    expect(row[10]).toBe('EUR');                           // K Währung
    expect(row[11]).toBe('cash');                          // L Zahlungsart
    expect(String(row[12])).toMatch(/^=HYPERLINK\(/);      // M Hyperlink
    expect(row[13]).toBe('archived');                      // N Status
    expect(row[14]).toBe('01HVZ8X4M3R9K7N2P6T1Q5Y8B4');     // O Receipt-ID
    expect(row[15]).toBe('2026-04-29T08:14:21Z');          // P Eingang am
  });

  it('Spalte D fällt auf "–" zurück, wenn Kategorie-Label leer ist', () => {
    const r = baseReceipt({ categorization: { skr_account: '3100' } });
    const row = buildRow(r);
    expect(row[3]).toBe('–');
  });

  it('Spalte D fällt auf "–" zurück, wenn categorization komplett fehlt', () => {
    const r = baseReceipt({ categorization: undefined });
    const row = buildRow(r);
    expect(row[3]).toBe('–');
    expect(row[4]).toBe(''); // SKR
    expect(row[5]).toBe(''); // Kostenstelle
  });

  it('Spalte M baut korrekte =HYPERLINK("url","label")-Formel', () => {
    const r = baseReceipt();
    const row = buildRow(r);
    const cell = String(row[12]);
    expect(cell).toMatch(/^=HYPERLINK\("https:\/\/drive\.google\.com\/.+","2026-04-28_RE-2026-1042\.pdf"\)$/);
  });

  it('Spalte M leer, wenn weder external_url noch path gesetzt sind', () => {
    const r = baseReceipt({ archive: {} });
    const row = buildRow(r);
    expect(row[12]).toBe('');
  });

  it('MwSt-Summierung addiert mehrere tax_lines korrekt (Floating-Point-Toleranz via round2)', () => {
    const r = baseReceipt({
      extraction: {
        fields: {
          tax_lines: [
            { rate: 0.19, amount: 19.00 },
            { rate: 0.07, amount:  1.40 },
            { rate: 0.19, amount:  0.50 },
          ],
        },
      },
    });
    const row = buildRow(r);
    expect(row[8]).toBe(20.9); // 19 + 1.4 + 0.5
  });

  it('MwSt-Satz wählt den dominanten (höchster Betrag) Satz', () => {
    const r = baseReceipt({
      extraction: {
        fields: {
          tax_lines: [
            { rate: 0.07, amount:  1.40 },
            { rate: 0.19, amount: 19.00 }, // dominant
          ],
        },
      },
    });
    const row = buildRow(r);
    expect(row[9]).toBe(19);
  });

  it('lässt MwSt-Felder leer, wenn keine tax_lines vorhanden sind', () => {
    const r = baseReceipt({ extraction: { fields: { total_gross: 50, total_net: 50 } } });
    const row = buildRow(r);
    expect(row[8]).toBe('');
    expect(row[9]).toBe('');
  });

  it('hängt Extra-Columns rechts an die 16 Pflicht-Spalten an', () => {
    const r = baseReceipt({
      meta: { tags: [], custom: { branch: 'muenchen-altstadt' } },
    });
    const row = buildRow(r, {
      extraColumns: [
        { header: 'Filiale',     jsonpath: 'meta.custom.branch' },
        { header: 'Engine',      jsonpath: 'extraction.engine' },
        { header: 'Confidence',  jsonpath: 'extraction.confidence' },
      ],
    });
    expect(row).toHaveLength(19);
    expect(row[16]).toBe('muenchen-altstadt');
    expect(row[17]).toBe(''); // engine fehlt im Receipt → leer
    expect(row[18]).toBe(''); // confidence fehlt
  });
});

describe('M07 row-builder — buildHyperlinkFormula()', () => {
  it('escapet doppelte Anführungszeichen', () => {
    const f = buildHyperlinkFormula('https://x/?q="a"', 'Foo "Bar"');
    expect(f).toBe('=HYPERLINK("https://x/?q=""a""","Foo ""Bar""")');
  });

  it('nutzt URL als Label, wenn Label fehlt', () => {
    const f = buildHyperlinkFormula('https://x', '');
    expect(f).toBe('=HYPERLINK("https://x","https://x")');
  });
});
