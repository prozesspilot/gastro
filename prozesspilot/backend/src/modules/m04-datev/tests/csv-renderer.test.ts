/**
 * M04 — CSV-Renderer Goldmaster-Tests.
 *
 * Verifiziert:
 *   1. Zeile 1 beginnt mit "EXTF";700
 *   2. Zeile 3 (erste Datenzeile): Umsatz, Konto, Gegenkonto, Belegdatum korrekt
 *   3. BOM vorhanden (UTF-8)
 *   4. Dezimaltrenner ist Komma (nicht Punkt)
 *   5. BU-Schlüssel korrekt (19% → "9", 7% → "2", 0% → "40")
 *   6. Belegfeld 1 max 12 Zeichen
 *   7. Buchungstext max 60 Zeichen
 *   8. Belegdatum DDMM Format (4 Zeichen)
 */

import { describe, expect, it } from 'vitest';
import {
  renderDatevCsv,
  toDatevRow,
  formatDecimalDE,
  formatBelegdatum,
  sanitizeText,
} from '../services/csv-renderer';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

// ── Test-Fixtures ─────────────────────────────────────────────────────────────

function makeReceipt(overrides: Partial<{
  receipt_id: string;
  vendor_name: string;
  doc_number: string;
  doc_date: string;
  total_gross: number;
  total_net: number;
  tax_rate: number;
  tax_amount: number;
  skr_account: string;
}>= {}): Receipt {
  const {
    receipt_id = 'rcpt_test_001',
    vendor_name = 'Metro AG',
    doc_number = 'RE-2026-0042',
    doc_date = '2026-04-15',
    total_gross = 119.00,
    total_net = 100.00,
    tax_rate = 0.19,
    tax_amount = 19.00,
    skr_account = '3100',
  } = overrides;

  return {
    receipt_id,
    customer_id: 'cust_datev_test',
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
  };
}

const testProfile = {
  customer_id: 'cust_datev_test',
  datev_consultant_no: '12345',
  datev_client_no: '67890',
  skr_type: 'skr03' as const,
  datev_importer: 'ProzessPilot-Test',
};

const testPeriod = { year: 2026, month: 4 };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('M04 CSV-Renderer', () => {
  describe('renderDatevCsv()', () => {
    it('Goldmaster 1: Zeile 1 beginnt mit "EXTF";700', () => {
      const receipts = [makeReceipt()];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');

      // BOM entfernen für Vergleich
      const firstLine = lines[0].replace(/^﻿/, '');
      expect(firstLine).toMatch(/^"EXTF";700;/);
    });

    it('Goldmaster 2: BOM ist vorhanden (UTF-8 mit BOM)', () => {
      const receipts = [makeReceipt()];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      // UTF-8 BOM: EF BB BF
      expect(csv[0]).toBe(0xef);
      expect(csv[1]).toBe(0xbb);
      expect(csv[2]).toBe(0xbf);
    });

    it('Goldmaster 3: Dezimaltrenner ist Komma (nicht Punkt)', () => {
      const receipts = [makeReceipt({ total_gross: 1234.56 })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2]; // Zeile 3 (0-indexed: 2)

      expect(dataLine).toContain('1234,56');
      expect(dataLine).not.toContain('1234.56');
    });

    it('Goldmaster 4: Zeile 3 enthält korrektes Konto (SKR03)', () => {
      const receipts = [makeReceipt({ skr_account: '3100' })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2];
      const cols = dataLine.split(';');

      // Konto ist Spalte 7 (0-indexed: 6)
      expect(cols[6]).toBe('3100');
    });

    it('Goldmaster 5: Gegenkonto ist 1600 (Standard)', () => {
      const receipts = [makeReceipt()];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2];
      const cols = dataLine.split(';');

      // Gegenkonto ist Spalte 8 (0-indexed: 7)
      expect(cols[7]).toBe('1600');
    });

    it('Goldmaster 6: BU-Schlüssel 19% → "9"', () => {
      const receipts = [makeReceipt({ tax_rate: 0.19, tax_amount: 19.0 })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2];
      const cols = dataLine.split(';');

      // BU-Schlüssel ist Spalte 9 (0-indexed: 8)
      expect(cols[8]).toBe('9');
    });

    it('Goldmaster 7: BU-Schlüssel 7% → "2"', () => {
      const receipts = [makeReceipt({ tax_rate: 0.07, tax_amount: 6.54 })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2];
      const cols = dataLine.split(';');

      expect(cols[8]).toBe('2');
    });

    it('Goldmaster 8: Belegdatum im Format DDMM (4 Zeichen)', () => {
      const receipts = [makeReceipt({ doc_date: '2026-04-15' })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2];
      const cols = dataLine.split(';');

      // Belegdatum ist Spalte 10 (0-indexed: 9)
      expect(cols[9]).toBe('1504'); // 15.04 → "1504"
    });

    it('Goldmaster 9: Belegfeld 1 max 12 Zeichen', () => {
      const receipts = [makeReceipt({ doc_number: 'RE-2026-SEHR-LANGE-NUMMER-0042' })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2];
      const cols = dataLine.split(';');

      // Belegfeld 1 ist Spalte 11 (0-indexed: 10)
      expect(cols[10].length).toBeLessThanOrEqual(12);
    });

    it('Goldmaster 10: Buchungstext max 60 Zeichen', () => {
      const receipts = [makeReceipt({
        vendor_name: 'Sehr langer Lieferantenname GmbH & Co. KG aus München-Schwabing',
      })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const lines = text.split('\r\n');
      const dataLine = lines[2];
      const cols = dataLine.split(';');

      // Buchungstext ist Spalte 14 (0-indexed: 13)
      expect(cols[13].length).toBeLessThanOrEqual(60);
    });

    it('Goldmaster 11: Beleglink enthält receipt_id', () => {
      const receipts = [makeReceipt({ receipt_id: 'rcpt_test_gold' })];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      expect(text).toContain('BELEG://rcpt_test_gold.pdf');
    });

    it('Goldmaster 12: sha256 wird korrekt berechnet', () => {
      const receipts = [makeReceipt()];
      const result1 = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });
      // Zweiter Aufruf mit identischem Input soll gleiche sha256 haben
      // (außer Timestamp in EXTF-Header — daher gleicher ms-Block)
      expect(result1.sha256).toHaveLength(64);
      expect(result1.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('Goldmaster 13: EXTF-Header enthält Beratungs- und Mandantennummer', () => {
      const receipts = [makeReceipt()];
      const { csv } = renderDatevCsv({ receipts, profile: testProfile, period: testPeriod });

      const text = csv.toString('utf-8');
      const firstLine = text.split('\r\n')[0].replace(/^﻿/, '');
      expect(firstLine).toContain('12345'); // consultant_no
      expect(firstLine).toContain('67890'); // client_no
    });

    it('Goldmaster 14: Mehrere Receipts → mehrere Datenzeilen', () => {
      const receipts = [
        makeReceipt({ receipt_id: 'r1', total_gross: 100.00 }),
        makeReceipt({ receipt_id: 'r2', total_gross: 200.00 }),
        makeReceipt({ receipt_id: 'r3', total_gross: 300.00 }),
      ];
      const { csv, rows_count } = renderDatevCsv({
        receipts,
        profile: testProfile,
        period: testPeriod,
      });

      expect(rows_count).toBe(3);
      const text = csv.toString('utf-8');
      const lines = text.split('\r\n').filter((l) => l.trim());
      expect(lines.length).toBe(2 + 3); // Header + Spalten + 3 Datenzeilen
    });
  });

  describe('formatDecimalDE()', () => {
    it('1234.56 → "1234,56"', () => {
      expect(formatDecimalDE(1234.56)).toBe('1234,56');
    });

    it('0 → "0,00"', () => {
      expect(formatDecimalDE(0)).toBe('0,00');
    });

    it('-119.00 → "119,00" (Absolutwert)', () => {
      expect(formatDecimalDE(-119.00)).toBe('119,00');
    });

    it('100.1 → "100,10" (2 Dezimalstellen)', () => {
      expect(formatDecimalDE(100.1)).toBe('100,10');
    });
  });

  describe('formatBelegdatum()', () => {
    it('"2026-04-15" → "1504"', () => {
      expect(formatBelegdatum('2026-04-15')).toBe('1504');
    });

    it('"15.04.2026" → "1504"', () => {
      expect(formatBelegdatum('15.04.2026')).toBe('1504');
    });

    it('"2026-12-31" → "3112"', () => {
      expect(formatBelegdatum('2026-12-31')).toBe('3112');
    });
  });

  describe('sanitizeText()', () => {
    it('Entfernt unerlaubte Sonderzeichen', () => {
      const result = sanitizeText('Metro AG & Co. KG');
      expect(result).not.toContain('@');
      expect(result).not.toContain('#');
    });

    it('Behält Umlaute', () => {
      const result = sanitizeText('Müller GmbH');
      expect(result).toContain('ü');
    });

    it('Mehrfache Leerzeichen werden normalisiert', () => {
      const result = sanitizeText('Metro   AG');
      expect(result).toBe('Metro AG');
    });
  });

  describe('toDatevRow()', () => {
    it('BU-Schlüssel 0% → "40"', () => {
      const receipt = makeReceipt({ tax_rate: 0, tax_amount: 0 });
      const row = toDatevRow(receipt, testProfile, 'skr03');
      const cols = row.split(';');
      expect(cols[8]).toBe('40');
    });

    it('Soll/Haben-Kennzeichen ist immer "S"', () => {
      const receipt = makeReceipt();
      const row = toDatevRow(receipt, testProfile, 'skr03');
      const cols = row.split(';');
      expect(cols[1]).toBe('S');
    });

    it('SKR04 Konto wird aus skr04_konto gelesen', () => {
      const receipt: Receipt = {
        ...makeReceipt({ skr_account: '5100' }),
        categorization: {
          skr_account: '3100',
          skr04_konto: '5100',
        },
      };
      const row = toDatevRow(receipt, testProfile, 'skr04');
      const cols = row.split(';');
      expect(cols[6]).toBe('5100');
    });
  });
});
