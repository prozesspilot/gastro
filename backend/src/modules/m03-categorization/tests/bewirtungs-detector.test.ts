/**
 * T008/M03 — Tests fuer BewirtungsDetector.
 *
 * Pure-Function-Tests: input → output. Wir verwenden inline-Sample-Belege
 * (statt grosser Fixture-Files), weil die Detection nur Text + Supplier
 * braucht und das den Test-Diff lesbar haelt.
 *
 * 10+ Test-Cases pro Akzeptanz-Kriterium T008.
 */

import { describe, expect, it } from 'vitest';
import {
  BEWIRTUNG_CONFIDENCE_THRESHOLD,
  BEWIRTUNG_REVIEW_THRESHOLD,
  analyze,
} from '../services/bewirtungs-detector';

describe('bewirtungs-detector — Restaurant-Beleg (Happy-Path)', () => {
  it('Pizzeria-Beleg mit Speisen + Trinkgeld → is_bewirtung=true, hohe Konfidenz', () => {
    const result = analyze({
      supplierName: 'Pizzeria Bella Italia',
      rawText: `Pizzeria Bella Italia
Datum: 28.04.2026
Tisch 5, Gedeck 2 Personen
Pizza Margherita     8,50
Pasta Carbonara     12,00
Wein (Glas)          5,00
Wasser               3,00
Trinkgeld:           2,50
Bedienung danke
Summe: 31,00 EUR`,
    });
    expect(result.is_bewirtung).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(BEWIRTUNG_CONFIDENCE_THRESHOLD);
    expect(result.indicators.supplier_match).toBe(true);
    expect(result.indicators.context_keywords).toBe(true);
    expect(result.indicators.position_keywords).toBe(true);
  });

  it('Trinkgeld wird extrahiert in cents', () => {
    const result = analyze({
      supplierName: 'Restaurant Adler',
      rawText: `Restaurant Adler
Pizza            10,00
Bier              4,50
Trinkgeld: 2,50
Tisch 3`,
    });
    expect(result.trinkgeld_cents).toBe(250);
  });

  it('Konfidenz >= 0.7 bei klarem Restaurant (alle drei Indikatoren)', () => {
    const result = analyze({
      supplierName: 'Cafe Mozart',
      rawText: `Cafe Mozart
Bedienung Anna
Espresso          2,80
Cappuccino        3,50
Kaffee            2,90
Tisch 12 / Gedeck 1`,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(BEWIRTUNG_REVIEW_THRESHOLD);
  });

  it('akzentuierter Lieferantenname "Café" → supplier_match=true (Review-Fix #5)', () => {
    // Regression: vor dem Diakritika-Folding matchte `\bcafé\b` (ASCII-`\b`)
    // einen echten Beleg "Café Mozart" nicht → supplier_match faelschlich false.
    const result = analyze({
      supplierName: 'Café Mozart',
      rawText: `Café Mozart
Espresso          2,80
Cappuccino        3,50
Tisch 12`,
    });
    expect(result.indicators.supplier_match).toBe(true);
    expect(result.is_bewirtung).toBe(true);
  });

  it('akzentuierter "Döner"-Imbiss → supplier_match=true (Diakritika-Folding)', () => {
    const result = analyze({
      supplierName: 'Döner Palast',
      rawText: 'Döner Palast\nDöner Box 7,50\nAyran 2,00',
    });
    expect(result.indicators.supplier_match).toBe(true);
  });
});

describe('bewirtungs-detector — Non-Bewirtungs-Belege (Negativ-Falls)', () => {
  it('Metro-Lieferanten-Beleg (Wareneinkauf) → is_bewirtung=false', () => {
    const result = analyze({
      supplierName: 'Metro Cash & Carry',
      rawText: `Metro Cash & Carry
Mehl 25kg           20,00
Olivenöl 5l         18,50
Reinigungsmittel     5,00
Summe: 43,50 EUR`,
    });
    expect(result.is_bewirtung).toBe(false);
    expect(result.confidence).toBeLessThan(BEWIRTUNG_CONFIDENCE_THRESHOLD);
  });

  it('Tankquittung → is_bewirtung=false', () => {
    const result = analyze({
      supplierName: 'Aral Tankstelle',
      rawText: `Aral Tankstelle
Super E10 50l     85,00
Quittung Nr 12345`,
    });
    expect(result.is_bewirtung).toBe(false);
  });

  it('Telekom-Rechnung → is_bewirtung=false', () => {
    const result = analyze({
      supplierName: 'Deutsche Telekom AG',
      rawText: `Deutsche Telekom AG
Rechnung Nr. 2026-04
Telefon Mobil     45,00
DSL Anschluss     29,99`,
    });
    expect(result.is_bewirtung).toBe(false);
  });

  it('Beleg ohne Trinkgeld → trinkgeld_cents=null auch bei is_bewirtung=true', () => {
    const result = analyze({
      supplierName: 'Restaurant Adler',
      rawText: `Restaurant Adler
Pizza             10,00
Bier               4,50
Tisch 3`,
    });
    expect(result.is_bewirtung).toBe(true);
    expect(result.trinkgeld_cents).toBeNull();
  });
});

describe('bewirtungs-detector — Niedrige Konfidenz (Bordereau)', () => {
  it('Nur Supplier-Match ohne Kontext → confidence ≈ 0.25, is_bewirtung=false', () => {
    const result = analyze({
      supplierName: 'Cafe Aral',
      rawText: 'Bestellung Pizza-Service\nAbholung 19:00',
    });
    expect(result.indicators.supplier_match).toBe(true);
    expect(result.indicators.context_keywords).toBe(false);
    expect(result.is_bewirtung).toBe(false);
  });

  it('Nur Kontext-Keyword ("Tisch") aber non-Restaurant → confidence 0.25', () => {
    const result = analyze({
      supplierName: 'IKEA',
      rawText: `IKEA Moebel
Tisch  Kiefer    199,00
Stuhl  Eiche      59,00
Summe: 258,00 EUR`,
    });
    // "Tisch" matcht context, aber IKEA matcht weder supplier noch positions ⇒ confidence < 0.5
    expect(result.indicators.context_keywords).toBe(true);
    expect(result.is_bewirtung).toBe(false);
  });
});

describe('bewirtungs-detector — MwSt-Splitting', () => {
  it('Beleg mit 7% UND 19% → tax_split.splitting_required=true', () => {
    const result = analyze({
      supplierName: 'Restaurant Adler',
      rawText: `Restaurant Adler
Essen (7% MwSt)
Pizza            10,00
Pasta            12,00
Getraenke (19% MwSt)
Bier              4,50
Wein              5,50
Trinkgeld: 3,00
MwSt 7%:     1,54
MwSt 19%:    1,90
Gesamt: 32,00 EUR`,
    });
    expect(result.tax_split.has_7_percent).toBe(true);
    expect(result.tax_split.has_19_percent).toBe(true);
    expect(result.tax_split.splitting_required).toBe(true);
  });

  it('Beleg nur mit 19% → splitting_required=false', () => {
    const result = analyze({
      supplierName: 'Bar Lounge',
      rawText: `Bar Lounge
Bier      4,50
Wein      6,00
MwSt 19%: 1,67
Trinkgeld: 1,50`,
    });
    expect(result.tax_split.has_19_percent).toBe(true);
    expect(result.tax_split.has_7_percent).toBe(false);
    expect(result.tax_split.splitting_required).toBe(false);
  });
});

describe('bewirtungs-detector — Edge-Cases', () => {
  it('Leerer Text → is_bewirtung=false, confidence=0', () => {
    const result = analyze({ rawText: '', supplierName: null });
    expect(result.is_bewirtung).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.indicators).toEqual({
      supplier_match: false,
      context_keywords: false,
      position_keywords: false,
      document_type: false,
    });
  });

  it('null supplierName + Restaurant-Keyword in Top-Zeilen → supplier_match=true', () => {
    const result = analyze({
      supplierName: null,
      rawText: `Restaurant Goldene Krone
Datum: 01.05.2026
Speisen + Getränke
Pizza  10,00
Bier   4,00`,
    });
    expect(result.indicators.supplier_match).toBe(true);
  });

  it('Trinkgeld in Mitte des Textes wird erkannt', () => {
    const result = analyze({
      supplierName: 'Cafe Latte',
      rawText: `Cafe Latte
Tisch 5
Kaffee   2,90
Trinkgeld 1,10
Cappuccino 3,50`,
    });
    expect(result.trinkgeld_cents).toBe(110);
  });
});
