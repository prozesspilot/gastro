/**
 * M03 — skr-mapper.ts
 *
 * Mappt category_id → SKR-Konto und MwSt-Satz → Tax-Key.
 * Nutzt:
 *   - categories (global) für Default-Mapping pro SKR-Chart
 *   - customer_categories (Override) wenn vorhanden
 *   - profile.routing.tax_keys_map (z. B. {"0.19":"9","0.07":"8"})
 */

import type { Pool } from 'pg';

interface CategoryRow {
  category_id: string;
  label_de: string;
  default_skr03: string | null;
  default_skr04: string | null;
  default_tax_key: string | null;
}

interface CustomerOverrideRow {
  override_skr: string | null;
  override_tax_key: string | null;
}

export type SkrChart = 'SKR03' | 'SKR04';

/**
 * Liefert das SKR-Konto für eine Kategorie.
 *
 * Reihenfolge:
 *   1) customer_categories.override_skr (falls vorhanden für diesen Kunden)
 *   2) categories.default_skr03 / default_skr04 je nach Chart
 *
 * Wirft, wenn die Kategorie unbekannt ist (M03-Spec §12: ungültige
 * Kategorie führt zu requires_review im Handler).
 */
export async function mapSkrAccount(
  pool: Pool,
  categoryId: string,
  skrChart: SkrChart,
  customerId: string,
): Promise<string> {
  // Override-Check zuerst.
  const overrideRes = await pool.query<CustomerOverrideRow>(
    `SELECT override_skr, override_tax_key
       FROM customer_categories
      WHERE customer_id = $1 AND category_id = $2
      LIMIT 1`,
    [customerId, categoryId],
  );
  if (overrideRes.rows[0]?.override_skr) {
    return overrideRes.rows[0].override_skr;
  }

  // Default aus categories.
  const defRes = await pool.query<CategoryRow>(
    `SELECT category_id, label_de, default_skr03, default_skr04, default_tax_key
       FROM categories
      WHERE category_id = $1
      LIMIT 1`,
    [categoryId],
  );
  const cat = defRes.rows[0];
  if (!cat) {
    throw new Error(`UNKNOWN_CATEGORY: ${categoryId}`);
  }

  const skr = skrChart === 'SKR04' ? cat.default_skr04 : cat.default_skr03;
  if (!skr) {
    throw new Error(`NO_DEFAULT_SKR: category=${categoryId} chart=${skrChart}`);
  }
  return skr;
}

/**
 * Liefert das Steuerkennzeichen für einen MwSt-Satz.
 *
 * Reihenfolge:
 *   1) profile.routing.tax_keys_map[String(taxRate)]   (z. B. "0.19" → "9")
 *   2) categories.default_tax_key
 *   3) leerer String (Pipeline darf das tolerieren, requires_review später)
 */
export async function mapTaxKey(
  pool: Pool,
  categoryId: string,
  taxRate: number,
  taxKeysMap?: Record<string, string>,
): Promise<string> {
  // Profil-Map zuerst.
  if (taxKeysMap) {
    // Toleriert sowohl "0.19" als auch "0.190".
    const candidates = [
      taxRate.toString(),
      taxRate.toFixed(2),
      taxRate.toFixed(3),
    ];
    for (const k of candidates) {
      if (taxKeysMap[k]) return taxKeysMap[k];
    }
  }

  // Default aus categories.
  const defRes = await pool.query<{ default_tax_key: string | null }>(
    `SELECT default_tax_key FROM categories WHERE category_id = $1 LIMIT 1`,
    [categoryId],
  );
  return defRes.rows[0]?.default_tax_key ?? '';
}

/** Liefert das Label (label_de) für eine category_id. */
export async function getCategoryLabel(
  pool: Pool,
  categoryId: string,
): Promise<string | undefined> {
  const { rows } = await pool.query<{ label_de: string }>(
    `SELECT label_de FROM categories WHERE category_id = $1 LIMIT 1`,
    [categoryId],
  );
  return rows[0]?.label_de;
}
