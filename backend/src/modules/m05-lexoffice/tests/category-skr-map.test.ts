/**
 * T009/M05 — Tests fuer Category → SKR04-Mapping.
 */

import { describe, expect, it } from 'vitest';
import { categoryToSkr04 } from '../services/category-skr-map';

describe('categoryToSkr04', () => {
  it('bewirtung → 6644', () => {
    expect(categoryToSkr04('bewirtung')).toBe('6644');
  });

  it('bewirtung_kunden → 6644', () => {
    expect(categoryToSkr04('bewirtung_kunden')).toBe('6644');
  });

  it('bewirtung_personal → 6645', () => {
    expect(categoryToSkr04('bewirtung_personal')).toBe('6645');
  });

  it('wareneinkauf_food → 5400', () => {
    expect(categoryToSkr04('wareneinkauf_food')).toBe('5400');
  });

  it('case-insensitive', () => {
    expect(categoryToSkr04('BEWIRTUNG')).toBe('6644');
    expect(categoryToSkr04('Bewirtung_Kunden')).toBe('6644');
  });

  it('unbekannte Kategorie → 4980 (Fallback Sonstige)', () => {
    expect(categoryToSkr04('frei_erfundene_kategorie')).toBe('4980');
  });

  it('null/undefined → 4980', () => {
    expect(categoryToSkr04(null)).toBe('4980');
    expect(categoryToSkr04(undefined)).toBe('4980');
  });

  it('Whitespace wird getrimmt', () => {
    expect(categoryToSkr04('  bewirtung  ')).toBe('6644');
  });
});
