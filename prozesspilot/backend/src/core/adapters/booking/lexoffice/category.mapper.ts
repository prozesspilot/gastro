/**
 * M05 — Category-Mapper SKR-Konto → Lexoffice categoryId.
 *
 * Strategie:
 *   1) Lookup in lexoffice_category_map (customer_id, skr_account)
 *   2) Falls leer: customer_id='default' Fallback
 *   3) Falls auch leer: Lexoffice client.listCategories() → Heuristik (Name-Match)
 *      → INSERT in Map. Schlägt der Lookup fehl, fallback auf 'sonstige' UUID.
 *
 * Hinweis: Die Heuristik im listCategories-Path ist absichtlich konservativ —
 * sie matcht nur, wenn ein eindeutig zuordbarer Lexoffice-Eintrag existiert.
 */

import type { Pool } from 'pg';
import { logger } from '../../../logger';
import type { LexofficeClient } from './lexoffice.client';
import type { LexofficeUuid } from './lexoffice.types';

const FALLBACK_SONSTIGE = '00000000-0000-4000-8000-000000004980';

interface MapRow {
  lexoffice_category_id: LexofficeUuid;
}

interface MapperOpts {
  pool: Pool;
  client: LexofficeClient;
}

export class CategoryMapper {
  private readonly pool: Pool;
  private readonly client: LexofficeClient;

  constructor(opts: MapperOpts) {
    this.pool = opts.pool;
    this.client = opts.client;
  }

  async mapSkrToLexoffice(skrAccount: string, customerId: string): Promise<LexofficeUuid> {
    // 1) Customer-spezifische Map
    const cust = await this.lookup(customerId, skrAccount);
    if (cust) return cust;

    // 2) Default-Map
    const def = await this.lookup('default', skrAccount);
    if (def) {
      // Optional: in customer-Map kopieren, damit Reads schneller werden
      await this.pool
        .query(
          `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, source)
           VALUES ($1, $2, $3, 'default')
           ON CONFLICT (customer_id, skr_account) DO NOTHING`,
          [customerId, skrAccount, def],
        )
        .catch(() => {
          /* best-effort */
        });
      return def;
    }

    // 3) Lexoffice fragen, ob ein Mapping ableitbar ist
    try {
      const cats = await this.client.listCategories();
      const heuristicMatch = pickByHeuristic(cats, skrAccount);
      if (heuristicMatch) {
        await this.pool.query(
          `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, category_name, source)
           VALUES ($1, $2, $3, $4, 'api_lookup')
           ON CONFLICT (customer_id, skr_account) DO UPDATE
             SET lexoffice_category_id = EXCLUDED.lexoffice_category_id, category_name = EXCLUDED.category_name`,
          [customerId, skrAccount, heuristicMatch.id, heuristicMatch.name],
        );
        return heuristicMatch.id;
      }
    } catch (err) {
      logger.warn({ err, skrAccount }, 'Lexoffice listCategories fehlgeschlagen');
    }

    // 4) Fallback: 'sonstige'
    return FALLBACK_SONSTIGE;
  }

  private async lookup(customerId: string, skrAccount: string): Promise<LexofficeUuid | null> {
    const { rows } = await this.pool.query<MapRow>(
      `SELECT lexoffice_category_id
         FROM lexoffice_category_map
        WHERE customer_id = $1 AND skr_account = $2
        LIMIT 1`,
      [customerId, skrAccount],
    );
    return rows[0]?.lexoffice_category_id ?? null;
  }
}

function pickByHeuristic(
  cats: Array<{ id: string; name: string; type: string }>,
  skrAccount: string,
): { id: string; name: string } | null {
  // SKR03-Bereiche → Heuristische Substring-Suche im Lexoffice-Namen
  // (Lexoffice-Kategorien sind in DE benannt).
  const map: Record<string, string[]> = {
    '3100': ['warenein', 'lebensmittel'],
    '3200': ['warenein'],
    '4210': ['miete', 'pacht'],
    '4240': ['energie', 'strom', 'gas'],
    '4985': ['reinigung', 'wartung'],
    '4360': ['versicherung'],
    '4530': ['kfz', 'fahrz'],
    '4600': ['werbung', 'marketing'],
    '4970': ['beratung', 'buchhaltung'],
    '4980': ['sonstige'],
    '4900': ['fortbildung', 'schulung'],
    '4100': ['lohn', 'personal'],
  };
  const needles = map[skrAccount];
  if (!needles) return null;

  const expense = cats.filter((c) => /expense/i.test(c.type));
  const candidates = expense.filter((c) => needles.some((n) => c.name.toLowerCase().includes(n)));
  return candidates[0] ?? null;
}
