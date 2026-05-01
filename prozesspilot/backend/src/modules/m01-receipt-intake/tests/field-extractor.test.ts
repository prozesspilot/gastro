/**
 * M01 — Field-Extractor-Tests
 *
 * Deckt die Pfade aus M01 §9.1:
 *   - Regex (Datum DE/ISO, Beträge mit Komma, USt-ID DE)
 *   - Lieferant über customer_profile.custom.supplier_overrides (Mock)
 *   - Claude-Fallback wenn regex_confidence < 0.6 (Mock)
 */

import { describe, expect, it, vi } from 'vitest';
import { extract } from '../services/field-extractor';
import type { OcrResult } from '../../../core/adapters/ocr/factory';
import fixture01 from '../../../../tests/fixtures/m01/fixture_01_supermarkt.json';
import fixture02 from '../../../../tests/fixtures/m01/fixture_02_handschrift.json';

// Minimaler DB-Stub — suppliers_global liefert per default nichts.
const noopDb = {
  query: vi.fn(async () => ({ rows: [] })),
} as unknown as import('pg').Pool;

function ocrFromFixture(rawText: string, confidence = 0.9): OcrResult {
  return { raw_text: rawText, confidence, blocks: [], words: [], page_count: 1 };
}

describe('field-extractor — Regex-Pfade', () => {
  it('extrahiert Datum im DE-Format (DD.MM.YYYY)', async () => {
    const ocr = ocrFromFixture('Beleg vom 28.04.2026\nGesamt 12,50 EUR');
    const res = await extract(noopDb, ocr, {});
    expect(res.fields.document_date).toBe('2026-04-28');
  });

  it('extrahiert Datum im ISO-Format (YYYY-MM-DD)', async () => {
    const ocr = ocrFromFixture('Date: 2026-04-28\nTotal 12.50 EUR');
    const res = await extract(noopDb, ocr, {});
    expect(res.fields.document_date).toBe('2026-04-28');
  });

  it('extrahiert Beträge mit Komma als Dezimaltrennzeichen', async () => {
    const ocr = ocrFromFixture(fixture01.raw_text, 0.95);
    const res = await extract(noopDb, ocr, {});
    expect(res.fields.total_gross).toBe(142.85);
    expect(res.fields.total_net).toBe(120.04);
    expect(res.fields.currency).toBe('EUR');
  });

  it('extrahiert USt-ID DE', async () => {
    const ocr = ocrFromFixture('Metro AG\nUSt-IdNr: DE123456789');
    const res = await extract(noopDb, ocr, {});
    expect(res.fields.supplier_vat_id).toBe('DE123456789');
  });

  it('liefert hohe Confidence wenn Pflichtfelder vollständig (mit supplier_overrides)', async () => {
    const ocr = ocrFromFixture(fixture01.raw_text, 0.95);
    const res = await extract(noopDb, ocr, {
      custom: { supplier_overrides: { 'Metro AG': { skr: '3100' } } },
    });
    expect(res.fields.supplier_name).toBe('Metro AG');
    expect(res.fields.document_date).toBe('2026-04-28');
    expect(res.fields.total_gross).toBe(142.85);
    expect(res.confidence).toBeGreaterThanOrEqual(0.99);
  });
});

describe('field-extractor — Lieferanten-Lookup', () => {
  it('findet Lieferant über supplier_overrides (Exact-Match)', async () => {
    const ocr = ocrFromFixture('Metro AG\nGesamt 50,00 €\n28.04.2026');
    const res = await extract(noopDb, ocr, {
      custom: { supplier_overrides: { 'Metro AG': { skr: '3100' } } },
    });
    expect(res.fields.supplier_name).toBe('Metro AG');
    expect(res.sources.profile).toBe(true);
  });

  it('findet Lieferant über supplier_overrides (Fuzzy-Match, Levenshtein ≤ 2)', async () => {
    const ocr = ocrFromFixture('Metr0 AG\nGesamt 50,00 €\n28.04.2026');
    const res = await extract(noopDb, ocr, {
      custom: { supplier_overrides: { 'Metro AG': { skr: '3100' } } },
    });
    expect(res.fields.supplier_name).toBe('Metro AG');
  });

  it('fragt suppliers_global an, wenn USt-ID erkannt', async () => {
    const dbMock = {
      query: vi.fn(async () => ({
        rows: [{
          supplier_id:  'sup_metro',
          vat_id:       'DE123456789',
          display_name: 'Metro AG (Großhandel)',
          aliases:      ['Metro AG'],
        }],
      })),
    } as unknown as import('pg').Pool;
    const ocr = ocrFromFixture('Beleg\nUSt-IdNr: DE123456789\n28.04.2026\nGesamt 50,00 €');
    const res = await extract(dbMock, ocr, {});
    expect(res.fields.supplier_name).toBe('Metro AG (Großhandel)');
    expect(res.sources.global).toBe(true);
  });
});

describe('field-extractor — Claude-Fallback-Pfad', () => {
  it('ruft Claude NICHT auf, wenn Regex alle Pflichtfelder liefert', async () => {
    const claudeMock = vi.fn(async () => ({ fields: {}, claude_confidence: 0.9 }));
    const ocr = ocrFromFixture(fixture01.raw_text, 0.95);
    await extract(noopDb, ocr, {
      custom: { supplier_overrides: { 'Metro AG': {} } },
    }, { claudeExtract: claudeMock });
    expect(claudeMock).not.toHaveBeenCalled();
  });

  it('ruft Claude AUF, wenn regex_confidence < 0.6', async () => {
    const claudeMock = vi.fn(async () => ({
      fields: {
        supplier_name: 'Café Klein',
        document_date: '2026-02-01',
        total_gross:   8.30,
      },
      claude_confidence: 0.7,
    }));
    const ocr = ocrFromFixture(fixture02.raw_text, 0.45);
    const res = await extract(noopDb, ocr, {}, { claudeExtract: claudeMock });
    expect(claudeMock).toHaveBeenCalledOnce();
    expect(res.fields.supplier_name).toBe('Café Klein');
    expect(res.fields.total_gross).toBe(8.30);
    expect(res.sources.claude).toBe(true);
  });

  it('ruft Claude AUF, wenn supplier_name fehlt (auch bei Datum + Brutto)', async () => {
    const claudeMock = vi.fn(async () => ({
      fields: { supplier_name: 'Unbekannt GmbH' },
      claude_confidence: 0.6,
    }));
    const ocr = ocrFromFixture('28.04.2026\nGesamt 50,00 EUR');
    const res = await extract(noopDb, ocr, {}, { claudeExtract: claudeMock });
    expect(claudeMock).toHaveBeenCalledOnce();
    expect(res.fields.supplier_name).toBe('Unbekannt GmbH');
  });

  it('verkraftet Claude-Fehler ohne Throw — gibt Regex-Result zurück', async () => {
    const claudeMock = vi.fn(async () => { throw new Error('API_DOWN'); });
    const ocr = ocrFromFixture(fixture02.raw_text, 0.45);
    const res = await extract(noopDb, ocr, {}, { claudeExtract: claudeMock });
    expect(res.fields.document_date).toBe('2026-02-01');
    expect(res.sources.claude).toBe(false);
  });
});
