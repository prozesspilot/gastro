/**
 * M03 — override-resolver Tests
 *
 * Akzeptanzkriterien aus dem Auftrag:
 *   - Exact match 'Metro AG' → trifft
 *   - Fuzzy 'Metro  AG' (doppel-space) → trifft (Levenshtein ≤ 2 nach Normalisierung)
 *   - 'Shell AG' vs 'Metro AG' → kein Match → null
 */

import { describe, expect, it } from 'vitest';
import { levenshtein, resolveOverride } from '../services/override-resolver';

describe('M03 override-resolver', () => {
  const customWithMetro = {
    supplier_overrides: {
      'Metro AG': {
        category: 'wareneinkauf_food',
        category_label: 'Wareneinkauf Lebensmittel',
        skr: '3100',
        tax_key: '9',
      },
    },
  };

  it('exact match auf "Metro AG" → trifft', () => {
    const r = resolveOverride({ supplierName: 'Metro AG', profileCustom: customWithMetro });
    expect(r).not.toBeNull();
    expect(r?.engine).toBe('override');
    expect(r?.confidence).toBe(1.0);
    expect(r?.category).toBe('wareneinkauf_food');
    expect(r?.skr_account).toBe('3100');
  });

  it('fuzzy match "Metro  AG" (doppel-space) → trifft', () => {
    const r = resolveOverride({ supplierName: 'Metro  AG', profileCustom: customWithMetro });
    expect(r).not.toBeNull();
    expect(r?.engine).toBe('override');
    expect(r?.skr_account).toBe('3100');
  });

  it('case-insensitive match "metro ag" → trifft', () => {
    const r = resolveOverride({ supplierName: 'metro ag', profileCustom: customWithMetro });
    expect(r).not.toBeNull();
  });

  it('nahe fuzzy "Metr AG" (1 Edit) → trifft', () => {
    const r = resolveOverride({ supplierName: 'Metr AG', profileCustom: customWithMetro });
    expect(r).not.toBeNull();
    expect(r?.skr_account).toBe('3100');
  });

  it('unverwandter Name "Shell AG" → null', () => {
    const r = resolveOverride({ supplierName: 'Shell AG', profileCustom: customWithMetro });
    expect(r).toBeNull();
  });

  it('leerer Override-Block → null', () => {
    const r = resolveOverride({ supplierName: 'Metro AG', profileCustom: {} });
    expect(r).toBeNull();
  });

  it('leerer SupplierName → null', () => {
    const r = resolveOverride({ supplierName: '', profileCustom: customWithMetro });
    expect(r).toBeNull();
  });

  it('Levenshtein: identisch → 0', () => {
    expect(levenshtein('foo', 'foo')).toBe(0);
  });

  it('Levenshtein: einzelne Substitution → 1', () => {
    expect(levenshtein('Metro', 'Metra')).toBe(1);
  });

  it('Levenshtein: zwei Edits → 2', () => {
    expect(levenshtein('Metro', 'Metz')).toBe(2);
  });
});
