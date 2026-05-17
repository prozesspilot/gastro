/**
 * M03 — skr-mapper Tests
 *
 * Akzeptanzkriterien aus dem Auftrag:
 *   - SKR03: wareneinkauf_food → '3100'
 *   - SKR04: wareneinkauf_food → '5100'
 *   - Customer-Override vorhanden → Override-Wert gewinnt
 *
 * Tests nutzen einen Fake-Pool, der nur die DB-Calls aus skr-mapper.ts beantwortet.
 */

import { describe, expect, it, vi } from 'vitest';
import { getCategoryLabel, mapSkrAccount, mapTaxKey } from '../services/skr-mapper';

interface FakePool {
  query: ReturnType<typeof vi.fn>;
}

function buildFakePool(rows: Record<string, unknown[]>): FakePool {
  return {
    query: vi.fn(async (sql: string) => {
      if (/customer_categories/i.test(sql)) {
        return { rows: rows.customer_categories ?? [] };
      }
      if (/categories/i.test(sql)) {
        return { rows: rows.categories ?? [] };
      }
      return { rows: [] };
    }),
  };
}

describe('M03 skr-mapper', () => {
  it('SKR03: wareneinkauf_food → 3100', async () => {
    const pool = buildFakePool({
      customer_categories: [],
      categories: [
        {
          category_id: 'wareneinkauf_food',
          label_de: 'Wareneinkauf Lebensmittel',
          default_skr03: '3100',
          default_skr04: '5100',
          default_tax_key: '9',
        },
      ],
    });
    const skr = await mapSkrAccount(pool as never, 'wareneinkauf_food', 'SKR03', 'cust_001');
    expect(skr).toBe('3100');
  });

  it('SKR04: wareneinkauf_food → 5100', async () => {
    const pool = buildFakePool({
      customer_categories: [],
      categories: [
        {
          category_id: 'wareneinkauf_food',
          label_de: 'Wareneinkauf Lebensmittel',
          default_skr03: '3100',
          default_skr04: '5100',
          default_tax_key: '9',
        },
      ],
    });
    const skr = await mapSkrAccount(pool as never, 'wareneinkauf_food', 'SKR04', 'cust_001');
    expect(skr).toBe('5100');
  });

  it('Customer-Override gewinnt über Default', async () => {
    const pool = buildFakePool({
      customer_categories: [{ override_skr: '3120', override_tax_key: null }],
      categories: [
        {
          category_id: 'wareneinkauf_food',
          label_de: 'Wareneinkauf Lebensmittel',
          default_skr03: '3100',
          default_skr04: '5100',
          default_tax_key: '9',
        },
      ],
    });
    const skr = await mapSkrAccount(pool as never, 'wareneinkauf_food', 'SKR03', 'cust_a3f4b2');
    expect(skr).toBe('3120');
  });

  it('Unbekannte Kategorie → wirft UNKNOWN_CATEGORY', async () => {
    const pool = buildFakePool({ customer_categories: [], categories: [] });
    await expect(
      mapSkrAccount(pool as never, 'unbekannt_xyz', 'SKR03', 'cust_001'),
    ).rejects.toThrow(/UNKNOWN_CATEGORY/);
  });

  it('mapTaxKey: profile.routing.tax_keys_map gewinnt', async () => {
    const pool = buildFakePool({
      categories: [{ default_tax_key: '0' }],
      customer_categories: [],
    });
    const key = await mapTaxKey(pool as never, 'wareneinkauf_food', 0.19, { '0.19': '9' });
    expect(key).toBe('9');
  });

  it('mapTaxKey: ohne Map fällt auf categories.default_tax_key', async () => {
    const pool = buildFakePool({
      categories: [{ default_tax_key: '8' }],
      customer_categories: [],
    });
    const key = await mapTaxKey(pool as never, 'wareneinkauf_food', 0.07);
    expect(key).toBe('8');
  });

  it('getCategoryLabel: liefert label_de', async () => {
    const pool = buildFakePool({
      categories: [{ label_de: 'Wareneinkauf Lebensmittel' }],
      customer_categories: [],
    });
    const label = await getCategoryLabel(pool as never, 'wareneinkauf_food');
    expect(label).toBe('Wareneinkauf Lebensmittel');
  });
});
