/**
 * T052 — Tests für den Export-SKR-Resolver (Single Source of Truth).
 *
 * Kernaussage: das von M05 gebuchte SKR-Konto ist GENAU das bei der
 * Kategorisierung (M03/T048) angezeigte/persistierte Konto. Beide Pfade speisen
 * sich aus SYSTEM_CATEGORIES — es gibt keine zweite, abweichende Map mehr.
 *
 * Nicht-tautologisch (Review #3): Die erwarteten SKR-Konten sind hier
 * UNABHÄNGIG hartkodiert (`EXPECTED_SKR`), nicht aus `skrAccountFor` abgeleitet.
 * So fängt der Test auch eine Regression *innerhalb* von SYSTEM_CATEGORIES
 * (z. B. vertauschte SKR03/SKR04-Spalten) — und nicht nur, dass der Resolver
 * „irgendeinen" persistierten Wert zurückgibt.
 */

import { describe, expect, it } from 'vitest';
import {
  FALLBACK_CATEGORY_ID,
  PILOT_SKR_CHART,
  type SkrChart,
  skrAccountFor,
} from '../../m03-categorization/system-categories';
import {
  hasPersistedCategorization,
  resolveExportSkrAccount,
} from '../services/resolve-export-skr';

/**
 * Unabhängig festgeschriebene Erwartungswerte (Quelle: system-categories.ts).
 * Ändert sich dort ein Konto, MUSS diese Tabelle bewusst nachgezogen werden —
 * genau das ist der Sinn (kein stilles Auseinanderlaufen).
 */
const EXPECTED_SKR: Record<string, { SKR03: string; SKR04: string }> = {
  wareneinkauf_food: { SKR03: '3100', SKR04: '5100' },
  wareneinkauf_nonfood: { SKR03: '3200', SKR04: '5200' },
  betriebskosten_energie: { SKR03: '4240', SKR04: '6325' },
  miete: { SKR03: '4210', SKR04: '6310' },
  personal: { SKR03: '4120', SKR04: '6020' },
  versicherung: { SKR03: '4360', SKR04: '6400' },
  marketing: { SKR03: '4610', SKR04: '6600' },
  reise: { SKR03: '4670', SKR04: '6660' },
  bewirtung: { SKR03: '4650', SKR04: '6640' },
  buerokosten: { SKR03: '4930', SKR04: '6815' },
  reparatur: { SKR03: '4805', SKR04: '6335' },
  steuer: { SKR03: '7600', SKR04: '7600' },
  kommunikation: { SKR03: '4920', SKR04: '6805' },
  sonstige_aufwand: { SKR03: '4900', SKR04: '6800' },
};

const CHARTS: SkrChart[] = ['SKR03', 'SKR04'];

describe('SYSTEM_CATEGORIES — SKR-Konten festgeschrieben (SSoT-Pin)', () => {
  // Catcht eine Regression *in der Quelle* (vertauschte Spalten/Tippfehler),
  // unabhängig vom Resolver.
  for (const chart of CHARTS) {
    for (const [categoryId, expected] of Object.entries(EXPECTED_SKR)) {
      it(`${categoryId} (${chart}) = ${expected[chart]}`, () => {
        expect(skrAccountFor(categoryId, chart)).toBe(expected[chart]);
      });
    }
  }
});

describe('resolveExportSkrAccount', () => {
  describe('Single Source of Truth: angezeigt == gebucht (gegen hartkodierte Werte)', () => {
    // Akzeptanz-Kriterium #1 (SKR-Konto-Ebene): der Export liefert exakt das
    // Konto, das die Kategorisierung persistiert hätte — geprüft gegen die
    // unabhängige EXPECTED_SKR-Tabelle.
    for (const chart of CHARTS) {
      for (const [categoryId, expected] of Object.entries(EXPECTED_SKR)) {
        it(`${categoryId} (${chart}): gebucht == ${expected[chart]}`, () => {
          const beleg = {
            category: categoryId,
            payload: {
              categorization: {
                category: categoryId,
                skr_account: expected[chart],
                skr_chart: chart,
              },
            },
          };
          expect(resolveExportSkrAccount(beleg)).toBe(expected[chart]);
        });
      }
    }
  });

  it('persistierter skr_account gewinnt — auch wenn er von der Kategorie abweicht', () => {
    // Beweist die „konsumiere den persistierten Wert"-Semantik: der Export rechnet
    // NICHT selbst aus beleg.category, sondern nutzt den gespeicherten Wert.
    const beleg = {
      category: 'bewirtung',
      payload: { categorization: { skr_account: '9999' } },
    };
    expect(resolveExportSkrAccount(beleg)).toBe('9999');
  });

  describe('Fallback (kein persistierter Wert) — Quelle bleibt SYSTEM_CATEGORIES', () => {
    it('bekannte Kategorie ohne Kategorisierung → skrAccountFor(category, PILOT_SKR_CHART)', () => {
      const beleg = { category: 'bewirtung', payload: {} };
      expect(resolveExportSkrAccount(beleg)).toBe(skrAccountFor('bewirtung', PILOT_SKR_CHART));
    });

    it('unbekannte Kategorie → sonstige_aufwand-Konto (SYSTEM_CATEGORIES)', () => {
      const beleg = { category: 'frei_erfunden', payload: {} };
      expect(resolveExportSkrAccount(beleg)).toBe(
        skrAccountFor(FALLBACK_CATEGORY_ID, PILOT_SKR_CHART),
      );
    });

    it('category=null und keine Kategorisierung → sonstige_aufwand-Konto', () => {
      const beleg = { category: null, payload: {} };
      expect(resolveExportSkrAccount(beleg)).toBe(
        skrAccountFor(FALLBACK_CATEGORY_ID, PILOT_SKR_CHART),
      );
    });

    it('leerer persistierter skr_account fällt auf die Kategorie zurück', () => {
      const beleg = {
        category: 'miete',
        payload: { categorization: { skr_account: '' } },
      };
      expect(resolveExportSkrAccount(beleg)).toBe(skrAccountFor('miete', PILOT_SKR_CHART));
    });
  });

  describe('Robustheit gegen fehlerhafte Payloads', () => {
    it('skr_account als Zahl (nicht String) → Fallback', () => {
      // payload ist Record<string, unknown> → fehlerhafte Form ohne Cast möglich.
      const beleg = { category: 'miete', payload: { categorization: { skr_account: 1234 } } };
      expect(resolveExportSkrAccount(beleg)).toBe(skrAccountFor('miete', PILOT_SKR_CHART));
    });

    it('categorization als String (nicht Objekt) → Fallback', () => {
      const beleg = { category: 'miete', payload: { categorization: 'kaputt' } };
      expect(resolveExportSkrAccount(beleg)).toBe(skrAccountFor('miete', PILOT_SKR_CHART));
    });
  });
});

describe('hasPersistedCategorization (Export-Status-Gate)', () => {
  it('true wenn categorization-Objekt vorhanden', () => {
    expect(hasPersistedCategorization({ categorization: { skr_account: '4650' } })).toBe(true);
  });

  it('false bei leerem Payload (nie kategorisiert)', () => {
    expect(hasPersistedCategorization({})).toBe(false);
  });

  it('false wenn categorization null oder kein Objekt', () => {
    expect(hasPersistedCategorization({ categorization: null })).toBe(false);
    expect(hasPersistedCategorization({ categorization: 'x' })).toBe(false);
  });
});
