/**
 * T052 — Tests für den Export-SKR-Resolver (Single Source of Truth).
 *
 * Kernaussage: das von M05 gebuchte SKR-Konto ist GENAU das bei der
 * Kategorisierung (M03/T048) angezeigte/persistierte Konto. Beide Pfade speisen
 * sich aus SYSTEM_CATEGORIES — es gibt keine zweite, abweichende Map mehr.
 */

import { describe, expect, it } from 'vitest';
import {
  FALLBACK_CATEGORY_ID,
  PILOT_SKR_CHART,
  SYSTEM_CATEGORIES,
  type SkrChart,
  skrAccountFor,
} from '../../m03-categorization/system-categories';
import { resolveExportSkrAccount } from '../services/resolve-export-skr';

/** Baut einen Beleg, wie ihn der categorize-Handler (T048) hinterlässt. */
function belegWithCategorization(categoryId: string, chart: SkrChart) {
  return {
    category: categoryId,
    payload: {
      categorization: {
        category: categoryId,
        skr_account: skrAccountFor(categoryId, chart),
        skr_chart: chart,
      },
    },
  };
}

describe('resolveExportSkrAccount', () => {
  describe('Single Source of Truth: angezeigt == gebucht', () => {
    // Akzeptanz-Kriterium #1: für ALLE 14 Kategorien und BEIDE Kontenrahmen muss
    // das gebuchte Konto exakt dem bei der Kategorisierung persistierten gleichen.
    const charts: SkrChart[] = ['SKR03', 'SKR04'];
    for (const chart of charts) {
      for (const cat of SYSTEM_CATEGORIES) {
        it(`${cat.id} (${chart}): gebucht == angezeigt`, () => {
          const angezeigt = skrAccountFor(cat.id, chart);
          const beleg = belegWithCategorization(cat.id, chart);
          expect(resolveExportSkrAccount(beleg)).toBe(angezeigt);
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
});
