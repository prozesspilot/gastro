/**
 * T007/M01 — Tests für den Light-Field-Extractor.
 *
 * Deckt die drei T007-Pflichtfelder ab:
 *   * Datum  — DD.MM.YYYY, DD.MM.YY, ISO; Plausibilitäts-Filter
 *   * Betrag — Anker („Summe / Gesamt") + Fallback („größter Betrag")
 *   * Lieferant — erste plausible Zeile
 *
 * Plus: Confidence-pro-Feld + Edge-Cases (leerer Text, nur Whitespace).
 */

import { describe, expect, it } from 'vitest';
import { extractLightFields } from '../services/ocr-field-extractor';

describe('ocr-field-extractor — Datum', () => {
  it('extrahiert DD.MM.YYYY (deutsch)', () => {
    const res = extractLightFields('Bewirtungsbeleg vom 28.04.2026\nSumme: 12,50 EUR');
    expect(res.fields.document_date).toBe('2026-04-28');
    expect(res.confidence_per_field.document_date).toBe(0.7);
  });

  it('extrahiert ISO-Datum mit höherer Confidence', () => {
    const res = extractLightFields('Date: 2026-04-28\nTotal: 12.50 EUR');
    expect(res.fields.document_date).toBe('2026-04-28');
    expect(res.confidence_per_field.document_date).toBe(1.0);
  });

  it('konvertiert 2-stelliges Jahr (24 → 2024)', () => {
    const res = extractLightFields('05.06.24\nSumme 5,00');
    expect(res.fields.document_date).toBe('2024-06-05');
  });

  it('filtert unplausibles Datum (Zukunft > 1 Tag)', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    const dateStr = `${String(future.getDate()).padStart(2, '0')}.${String(future.getMonth() + 1).padStart(2, '0')}.${future.getFullYear()}`;
    const res = extractLightFields(`${dateStr}\nSumme 10,00`);
    expect(res.fields.document_date).toBeUndefined();
    expect(res.confidence_per_field.document_date).toBe(0);
  });

  it('gibt Confidence 0 wenn kein Datum gefunden', () => {
    const res = extractLightFields('Kein Datum hier\nSumme 10,00');
    expect(res.fields.document_date).toBeUndefined();
    expect(res.confidence_per_field.document_date).toBe(0);
  });
});

describe('ocr-field-extractor — Betrag', () => {
  it('erkennt Betrag mit Anker-Wort "Summe" (Confidence 1.0)', () => {
    const res = extractLightFields('Pizza Bella Italia\n28.04.2026\nSumme: 142,85 EUR');
    expect(res.fields.total_gross).toBe(142.85);
    expect(res.fields.currency).toBe('EUR');
    expect(res.confidence_per_field.total_gross).toBe(1.0);
  });

  it('erkennt Betrag mit Anker "Gesamtbetrag"', () => {
    const res = extractLightFields('Restaurant XY\n01.01.2026\nGesamtbetrag 99,99 €');
    expect(res.fields.total_gross).toBe(99.99);
    expect(res.confidence_per_field.total_gross).toBe(1.0);
  });

  it('case-insensitive Anker', () => {
    const res = extractLightFields('Beleg\n01.01.2026\nGESAMT 50,00');
    expect(res.fields.total_gross).toBe(50.0);
  });

  it('parsed deutschen Tausender-Punkt + Komma', () => {
    const res = extractLightFields('Lieferant\n01.01.2026\nSumme: 1.234,56 EUR');
    expect(res.fields.total_gross).toBe(1234.56);
  });

  it('parsed englisches Format mit Punkt-Dezimaltrennzeichen', () => {
    const res = extractLightFields('Supplier\n2026-01-01\nTotal: 1234.56');
    expect(res.fields.total_gross).toBe(1234.56);
  });

  it('Fallback: nimmt größten Betrag wenn kein Anker (Confidence 0.4)', () => {
    const res = extractLightFields('Pizzeria\n28.04.2026\n12,50\n45,00\n8,99');
    expect(res.fields.total_gross).toBe(45.0);
    expect(res.confidence_per_field.total_gross).toBe(0.4);
  });

  it('Confidence 0 wenn kein Betrag gefunden', () => {
    const res = extractLightFields('Nur Text, keine Zahlen');
    expect(res.fields.total_gross).toBeUndefined();
    expect(res.confidence_per_field.total_gross).toBe(0);
  });
});

describe('ocr-field-extractor — Lieferant', () => {
  it('nimmt erste plausible Zeile als Lieferant', () => {
    const res = extractLightFields('Pizzeria Bella Italia\n28.04.2026\nSumme 50,00');
    expect(res.fields.supplier_name).toBe('Pizzeria Bella Italia');
    expect(res.confidence_per_field.supplier_name).toBe(0.7);
  });

  it('überspringt nicht-aussagekräftige erste Zeile ("Rechnung")', () => {
    const res = extractLightFields('Rechnung\nMetro AG\n28.04.2026\nSumme 50,00');
    expect(res.fields.supplier_name).toBe('Metro AG');
    expect(res.confidence_per_field.supplier_name).toBe(0.4);
  });

  it('liefert Confidence 0 wenn keine geeignete Zeile vorhanden', () => {
    const res = extractLightFields('123\n456\n789');
    expect(res.fields.supplier_name).toBeUndefined();
    expect(res.confidence_per_field.supplier_name).toBe(0);
  });

  it('normalisiert mehrfache Whitespaces in Supplier-Name', () => {
    const res = extractLightFields('Pizzeria   Bella    Italia\nSumme 10,00');
    expect(res.fields.supplier_name).toBe('Pizzeria Bella Italia');
  });
});

describe('ocr-field-extractor — Gesamtbild', () => {
  it('vollständiger Beleg → alle Felder + hohe Konfidenz', () => {
    const text = `Pizzeria Bella Italia
Musterstr. 12, 80331 München
Datum: 28.04.2026
Pizza Margherita      8,50 EUR
Pasta Carbonara      12,00 EUR
Gesamtbetrag:        20,50 EUR`;
    const res = extractLightFields(text);
    expect(res.fields.supplier_name).toBe('Pizzeria Bella Italia');
    expect(res.fields.document_date).toBe('2026-04-28');
    expect(res.fields.total_gross).toBe(20.5);
    expect(res.overall_confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('leerer Text liefert alle Confidence-Werte 0', () => {
    const res = extractLightFields('');
    expect(res.overall_confidence).toBe(0);
    expect(res.fields).toEqual({});
  });

  it('Whitespace-only Text liefert 0', () => {
    const res = extractLightFields('   \n  \t  \n');
    expect(res.overall_confidence).toBe(0);
  });

  it('teilweise Erkennung → mittlere Konfidenz', () => {
    // Nur Datum, kein Betrag, kein Supplier
    const res = extractLightFields('28.04.2026');
    expect(res.fields.document_date).toBe('2026-04-28');
    expect(res.fields.supplier_name).toBeUndefined();
    expect(res.fields.total_gross).toBeUndefined();
    expect(res.overall_confidence).toBeGreaterThan(0);
    expect(res.overall_confidence).toBeLessThan(0.5);
  });
});
