/**
 * F5 — DATEV CSV Golden-Tests Format-510
 *
 * Verifiziert DATEV-Format-510 gegen gespeicherte Snapshot-Dateien.
 * Erzeugt beim ersten Lauf die Golden-Files (WRITE_GOLDEN=1).
 *
 * Ausführung:
 *   npm test -- tests/golden/datev/datev-golden.test.ts
 *   WRITE_GOLDEN=1 npm test -- tests/golden/datev/datev-golden.test.ts  # Update snapshots
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  renderDatevCsv,
  formatDecimalDE,
  formatBelegdatum,
  type DatevPeriod,
} from '../../../src/modules/m04-datev/services/csv-renderer';
import type { Receipt } from '../../../src/modules/_shared/receipts/receipt.repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRITE_GOLDEN = process.env.WRITE_GOLDEN === '1';

// ── Test-Fixtures — gleiche Struktur wie bestehende DATEV-Tests ──────────────

function makeReceipt(
  overrides: Partial<{
    receipt_id: string;
    vendor_name: string;
    doc_number: string;
    doc_date: string;
    total_gross: number;
    total_net: number;
    tax_rate: number;
    tax_amount: number;
    skr_account: string;
  }> = {},
): Receipt {
  const {
    receipt_id = 'rcpt-golden-001',
    vendor_name = 'Metro AG',
    doc_number = 'RE-2026-0042',
    doc_date = '2026-04-15',
    total_gross = 119.0,
    total_net = 100.0,
    tax_rate = 0.19,
    tax_amount = 19.0,
    skr_account = '3100',
  } = overrides;

  return {
    receipt_id,
    customer_id: 'cust-golden-test',
    status: 'archived',
    file: {
      object_key: `cust/originals/${receipt_id}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 1024,
      sha256: 'abc123',
    },
    extraction: {
      fields: {
        vendor_name,
        document_number: doc_number,
        document_date: doc_date,
        total_gross,
        total_net,
        tax_lines: [{ rate: tax_rate, base: total_net, amount: tax_amount }],
      },
    },
    categorization: {
      skr_account,
      category: 'wareneinkauf_food',
    },
  } as unknown as Receipt;
}

const testProfile = {
  customer_id: 'cust-golden-test',
  datev_consultant_no: '12345',
  datev_client_no: '67890',
  skr_type: 'skr03' as const,
  datev_importer: 'ProzessPilot-Test',
};

const testPeriod: DatevPeriod = { year: 2026, month: 4 };

// ── Golden Helper ─────────────────────────────────────────────────────────────

/**
 * Normalisiert den EXTF-Zeitstempel (Feld 6 in Zeile 1) auf einen fixen Wert,
 * damit Golden-File-Vergleiche nicht durch den Laufzeit-Timestamp scheitern.
 *
 * EXTF-Header-Format: "EXTF";700;21;"Buchungsstapel";9;<TIMESTAMP>;...
 */
function normalizeExtfTimestamp(text: string): string {
  return text.replace(/^(﻿?"EXTF";700;21;"Buchungsstapel";\d+;)\d{14}(;)/m, '$1XXXXXXXXXXXXXX$2');
}

function assertGolden(filename: string, csv: Buffer): void {
  const filepath = join(__dirname, filename);
  const actual = normalizeExtfTimestamp(csv.toString('utf-8'));

  if (WRITE_GOLDEN || !existsSync(filepath)) {
    // Write normalized version so future comparisons work
    writeFileSync(filepath, actual, 'utf-8');
    console.log(`Golden file written: ${filename}`);
  } else {
    const expected = normalizeExtfTimestamp(readFileSync(filepath, 'utf-8'));
    expect(actual).toBe(expected);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F5 — DATEV CSV Golden-Tests Format-510', () => {
  it('Utility: formatDecimalDE ersetzt Punkt durch Komma', () => {
    expect(formatDecimalDE(1190.0)).toBe('1190,00');
    expect(formatDecimalDE(100.5)).toBe('100,50');
    expect(formatDecimalDE(0)).toBe('0,00');
  });

  it('Utility: formatBelegdatum erzeugt DDMM Format', () => {
    expect(formatBelegdatum('2026-04-15')).toBe('1504');
    expect(formatBelegdatum('2026-01-01')).toBe('0101');
    expect(formatBelegdatum('2026-12-31')).toBe('3112');
  });

  it('Case 01: Wareneinkauf 19% SKR03 3100 — EXTF-Format validieren', () => {
    const receipts = [
      makeReceipt({
        receipt_id: 'rcpt-golden-001',
        vendor_name: 'Metro AG',
        doc_number: 'RE-2026-0042',
        doc_date: '2026-04-15',
        total_gross: 1190.0,
        total_net: 1000.0,
        tax_rate: 0.19,
        tax_amount: 190.0,
        skr_account: '3100',
      }),
    ];

    const { csv, rows_count } = renderDatevCsv({
      receipts,
      profile: testProfile,
      period: testPeriod,
    });

    const text = csv.toString('utf-8');

    // DATEV Format-510 Validierung
    expect(text).toContain('"EXTF"');
    expect(text).toContain('700');
    expect(text).toMatch(/1190,00/); // Dezimaltrenner = Komma
    expect(text).toContain('3100'); // SKR-Konto
    expect(text).toContain('1504'); // Belegdatum 15.04
    // BU-Schlüssel 19% (Wert "9" in der CSV-Zeile)
    expect(text).toMatch(/;9;/); // BU-Schlüssel 19% als unquoted value
    expect(rows_count).toBe(1);

    assertGolden('case_01_lebensmittel.csv', csv);
  });

  it('Case 02: Energie 19% SKR03 4240 — EXTF-Format validieren', () => {
    const receipts = [
      makeReceipt({
        receipt_id: 'rcpt-golden-002',
        vendor_name: 'Stadtwerke GmbH',
        doc_number: 'SW-2026-0123',
        doc_date: '2026-04-30',
        total_gross: 714.0,
        total_net: 600.0,
        tax_rate: 0.19,
        tax_amount: 114.0,
        skr_account: '4240',
      }),
    ];

    const { csv, rows_count } = renderDatevCsv({
      receipts,
      profile: testProfile,
      period: testPeriod,
    });

    const text = csv.toString('utf-8');

    expect(text).toContain('4240');
    expect(text).toContain('3004'); // Belegdatum 30.04
    expect(text).toMatch(/714,00/);
    expect(rows_count).toBe(1);

    assertGolden('case_02_energie.csv', csv);
  });

  it('Case 03: Steuerfreie Leistung — EXTF-Format validieren', () => {
    const receipts = [
      makeReceipt({
        receipt_id: 'rcpt-golden-003',
        vendor_name: 'Versicherung AG',
        doc_number: 'VS-2026-0001',
        doc_date: '2026-04-01',
        total_gross: 500.0,
        total_net: 500.0,
        tax_rate: 0.0,
        tax_amount: 0.0,
        skr_account: '4360',
      }),
    ];

    const { csv, rows_count } = renderDatevCsv({
      receipts,
      profile: testProfile,
      period: testPeriod,
    });

    const text = csv.toString('utf-8');

    expect(text).toContain('4360');
    expect(text).toMatch(/500,00/);
    expect(rows_count).toBe(1);

    assertGolden('case_03_steuerfrei.csv', csv);
  });

  it('Header-Struktur: Zeile 1 und 2 gemäß DATEV-Format-510', () => {
    const receipts = [makeReceipt()];
    const { csv } = renderDatevCsv({
      receipts,
      profile: testProfile,
      period: testPeriod,
    });

    const text = csv.toString('utf-8');
    const lines = text.split('\r\n');

    // Zeile 1 muss mit "EXTF" beginnen (nach BOM)
    const firstLine = lines[0].replace(/^﻿/, '');
    expect(firstLine).toMatch(/^"EXTF";700;/);

    // Zeile 2: Spalten-Header (DATEV Format 510 Standardspalten)
    expect(lines[1]).toContain('Umsatz');
    expect(lines[1]).toContain('BU-Schluessel');
  });

  it('Multi-Receipt: 3 Belege in einer CSV', () => {
    const receipts = [
      makeReceipt({ receipt_id: 'rcpt-m-1', total_gross: 119.0, skr_account: '3100' }),
      makeReceipt({ receipt_id: 'rcpt-m-2', total_gross: 595.0, skr_account: '4240' }),
      makeReceipt({ receipt_id: 'rcpt-m-3', total_gross: 238.0, skr_account: '3100' }),
    ];

    const { csv, rows_count } = renderDatevCsv({
      receipts,
      profile: testProfile,
      period: testPeriod,
    });

    const text = csv.toString('utf-8');

    expect(rows_count).toBe(3);
    expect(text).toMatch(/119,00/);
    expect(text).toMatch(/595,00/);
    expect(text).toMatch(/238,00/);
  });
});
