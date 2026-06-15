/**
 * T054 — Tests für den CategoryMapper (SKR-Konto → Lexoffice categoryId).
 *
 * Deckt ab:
 *   - RLS-Kontext (app.current_tenant) wird auf der Connection gesetzt.
 *   - DB-Lookup-Treffer (customer + 'default') werden bevorzugt.
 *   - Heuristik (Default-Mapping im Code) löst alle 14 System-Kategorien gegen
 *     realistische Lexware-Kategorienamen korrekt auf — NICHT auf 'Sonstige'.
 *   - Fallback auf die Sonstige-UUID, wenn nichts matcht / listCategories wirft.
 */

import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { SYSTEM_CATEGORIES } from '../../../../modules/m03-categorization/system-categories';
import { CategoryMapper } from './category.mapper';
import type { LexofficeClient } from './lexoffice.client';

const FALLBACK_SONSTIGE = '00000000-0000-4000-8000-000000004980';
const TENANT = '550e8400-e29b-41d4-a716-446655440000';

/** Realistische Lexware-Kategorienamen, einer pro System-Kategorie (food zuerst). */
const LEXOFFICE_CATEGORIES: Array<{ id: string; name: string; type: string }> = [
  { id: 'cat-food', name: 'Wareneingang Lebensmittel', type: 'expense' },
  { id: 'cat-nonfood', name: 'Wareneingang Handelswaren', type: 'expense' },
  { id: 'cat-energie', name: 'Energiekosten', type: 'expense' },
  { id: 'cat-miete', name: 'Miete / Pacht', type: 'expense' },
  { id: 'cat-personal', name: 'Personalkosten / Löhne und Gehälter', type: 'expense' },
  { id: 'cat-versicherung', name: 'Versicherungen / Beiträge', type: 'expense' },
  { id: 'cat-marketing', name: 'Werbekosten', type: 'expense' },
  { id: 'cat-reise', name: 'Reisekosten', type: 'expense' },
  { id: 'cat-bewirtung', name: 'Bewirtungskosten (mit Geschäftspartnern)', type: 'expense' },
  { id: 'cat-buero', name: 'Bürobedarf', type: 'expense' },
  { id: 'cat-reparatur', name: 'Reparatur / Instandhaltung', type: 'expense' },
  { id: 'cat-steuer', name: 'Steuern', type: 'expense' },
  { id: 'cat-kommunikation', name: 'Telekommunikation', type: 'expense' },
  { id: 'cat-sonstige', name: 'Sonstige Ausgaben', type: 'expense' },
];

/** Erwartete Auflösung je System-Kategorie-ID → Lexware-categoryId. */
const EXPECTED_BY_CATEGORY: Record<string, string> = {
  wareneinkauf_food: 'cat-food',
  wareneinkauf_nonfood: 'cat-nonfood',
  betriebskosten_energie: 'cat-energie',
  miete: 'cat-miete',
  personal: 'cat-personal',
  versicherung: 'cat-versicherung',
  marketing: 'cat-marketing',
  reise: 'cat-reise',
  bewirtung: 'cat-bewirtung',
  buerokosten: 'cat-buero',
  reparatur: 'cat-reparatur',
  steuer: 'cat-steuer',
  kommunikation: 'cat-kommunikation',
  sonstige_aufwand: 'cat-sonstige',
};

interface MockOpts {
  customerRow?: string | null;
  defaultRow?: string | null;
  categories?: Array<{ id: string; name: string; type: string }>;
  listThrows?: boolean;
}

function makeMapper(opts: MockOpts) {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const queryMock = vi.fn(async (text: string, params?: unknown[]) => {
    queries.push({ text, params });
    if (text.startsWith('SELECT lexoffice_category_id')) {
      const cid = params?.[0];
      const row = cid === 'default' ? opts.defaultRow : opts.customerRow;
      return { rows: row ? [{ lexoffice_category_id: row }] : [] };
    }
    return { rows: [] };
  });
  const releaseMock = vi.fn();
  const conn = { query: queryMock, release: releaseMock } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => conn) } as unknown as Pool;
  const listCategoriesMock = opts.listThrows
    ? vi.fn(async () => {
        throw new Error('lexoffice down');
      })
    : vi.fn(async () => opts.categories ?? []);
  const client = { listCategories: listCategoriesMock } as unknown as LexofficeClient;
  return {
    mapper: new CategoryMapper({ pool, client }),
    queryMock,
    releaseMock,
    listCategoriesMock,
    queries,
  };
}

describe('CategoryMapper.mapSkrToLexoffice', () => {
  it('setzt den RLS-Kontext (app.current_tenant) auf der Connection', async () => {
    const { mapper, releaseMock, queries } = makeMapper({ customerRow: 'cat-x' });
    await mapper.mapSkrToLexoffice('4650', TENANT);

    const setConfig = queries.find((q) => q.text.includes('set_config'));
    expect(setConfig).toBeDefined();
    expect(setConfig?.params).toEqual([TENANT]);
    expect(queries[0].text).toBe('BEGIN');
    expect(queries.some((q) => q.text === 'COMMIT')).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });

  it('customer-spezifischer Treffer gewinnt (kein listCategories-Call)', async () => {
    const { mapper, listCategoriesMock } = makeMapper({ customerRow: 'cat-customer' });
    expect(await mapper.mapSkrToLexoffice('4650', TENANT)).toBe('cat-customer');
    expect(listCategoriesMock).not.toHaveBeenCalled();
  });

  it('default-Treffer wird genutzt und in die customer-Map kopiert', async () => {
    const { mapper, queries, listCategoriesMock } = makeMapper({
      customerRow: null,
      defaultRow: 'cat-default',
    });
    expect(await mapper.mapSkrToLexoffice('4650', TENANT)).toBe('cat-default');
    expect(
      queries.some(
        (q) =>
          q.text.includes('INSERT INTO lexoffice_category_map') && q.text.includes("'default'"),
      ),
    ).toBe(true);
    expect(listCategoriesMock).not.toHaveBeenCalled();
  });

  it('ROLLBACK + rethrow + Connection-Release, wenn ein Query unerwartet wirft', async () => {
    const { mapper, queryMock, releaseMock } = makeMapper({ customerRow: null, defaultRow: null });
    queryMock.mockImplementationOnce(async () => ({ rows: [] })); // BEGIN ok
    queryMock.mockImplementationOnce(async () => {
      throw new Error('guc fail'); // set_config wirft
    });
    await expect(mapper.mapSkrToLexoffice('4650', TENANT)).rejects.toThrow('guc fail');
    expect(queryMock.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
    // Wichtigste Leak-Sicherung: Release läuft auch im Throw-Pfad (finally).
    expect(releaseMock).toHaveBeenCalled();
  });

  describe('Heuristik: alle 14 System-Kategorien lösen korrekt auf (nicht Sonstige)', () => {
    for (const cat of SYSTEM_CATEGORIES) {
      it(`${cat.id} (SKR03 ${cat.skr03_konto}) → ${EXPECTED_BY_CATEGORY[cat.id]}`, async () => {
        const { mapper } = makeMapper({
          customerRow: null,
          defaultRow: null,
          categories: LEXOFFICE_CATEGORIES,
        });
        const result = await mapper.mapSkrToLexoffice(cat.skr03_konto, TENANT);
        expect(result).toBe(EXPECTED_BY_CATEGORY[cat.id]);
        expect(result).not.toBe(FALLBACK_SONSTIGE);
      });
    }
  });

  it('Bewirtung (SKR03 4650) landet NICHT auf Sonstige (Kern des Findings)', async () => {
    const { mapper } = makeMapper({ categories: LEXOFFICE_CATEGORIES });
    expect(await mapper.mapSkrToLexoffice('4650', TENANT)).toBe('cat-bewirtung');
  });

  it('unabhängig von der Lexware-API-Reihenfolge (food/non-food kippt nicht)', async () => {
    // Review #1: listCategories()-Reihenfolge ist NICHT garantiert. Mit
    // umgedrehter Reihenfolge (non-food zuerst) muss food trotzdem auf food
    // auflösen — sonst bucht ein Lebensmittel-Beleg auf das Non-Food-Konto.
    const reversed = [...LEXOFFICE_CATEGORIES].reverse();
    const { mapper } = makeMapper({ categories: reversed });
    expect(await mapper.mapSkrToLexoffice('3100', TENANT)).toBe('cat-food');
    expect(await mapper.mapSkrToLexoffice('3200', TENANT)).toBe('cat-nonfood');
  });

  it('kein Heuristik-Match → Fallback Sonstige-UUID', async () => {
    const { mapper } = makeMapper({
      categories: [{ id: 'x', name: 'Völlig anderes', type: 'expense' }],
    });
    expect(await mapper.mapSkrToLexoffice('4650', TENANT)).toBe(FALLBACK_SONSTIGE);
  });

  it('unbekanntes SKR-Konto → Fallback Sonstige-UUID', async () => {
    const { mapper } = makeMapper({ categories: LEXOFFICE_CATEGORIES });
    expect(await mapper.mapSkrToLexoffice('9999', TENANT)).toBe(FALLBACK_SONSTIGE);
  });

  it('listCategories wirft → Fallback Sonstige-UUID (kein Crash)', async () => {
    const { mapper } = makeMapper({ listThrows: true });
    expect(await mapper.mapSkrToLexoffice('4650', TENANT)).toBe(FALLBACK_SONSTIGE);
  });
});
