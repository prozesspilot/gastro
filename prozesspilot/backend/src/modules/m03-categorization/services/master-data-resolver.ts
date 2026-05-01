/**
 * M03 — master-data-resolver.ts
 *
 * Strategie 2 nach M03-Spec §7.1:
 *   - Sucht in suppliers_global per vat_id, lower(display_name), aliases.
 *   - Bei Treffer mit ausreichender impliziter Confidence (≥ 0.9):
 *       - vat_id-Match    → confidence = 1.0
 *       - name-Match      → confidence = 0.95
 *       - alias-Match     → confidence = 0.90
 *   - Sonst: null (→ Strategie 3 Claude).
 *
 * Da suppliers_global kein explizites confidence-Feld hat, wird die Match-Art
 * zur impliziten Confidence (M01/M03-Spec geht von gepflegten Stammdaten aus).
 */

import type { Pool } from 'pg';
import type { CategorizationResult } from './types';

interface SupplierRow {
  supplier_id: string;
  vat_id: string | null;
  display_name: string;
  default_category: string | null;
  default_skr: string | null;
  match_kind: 'vat_id' | 'name' | 'alias';
}

interface ResolveInput {
  supplierName?: string;
  vatId?: string | null;
}

const MIN_CONFIDENCE = 0.9;

export async function resolveFromMasterData(
  pool: Pool,
  input: ResolveInput,
  categoryLabelLookup: (categoryId: string) => Promise<string | undefined> | string | undefined,
): Promise<CategorizationResult | null> {
  const supplier = (input.supplierName ?? '').trim();
  const vat = (input.vatId ?? '').trim();
  if (!supplier && !vat) return null;

  // Drei Lookups, kombiniert mit Prioritäten in einer Query (vat > name > alias).
  const { rows } = await pool.query<SupplierRow>(
    `SELECT supplier_id, vat_id, display_name, default_category, default_skr,
            CASE
              WHEN $2 <> '' AND vat_id = $2                                   THEN 'vat_id'
              WHEN $1 <> '' AND lower(display_name) = lower($1)               THEN 'name'
              WHEN $1 <> '' AND $1 = ANY(aliases)                             THEN 'alias'
            END AS match_kind
       FROM suppliers_global
      WHERE ($2 <> '' AND vat_id = $2)
         OR ($1 <> '' AND lower(display_name) = lower($1))
         OR ($1 <> '' AND $1 = ANY(aliases))
      ORDER BY
        CASE
          WHEN $2 <> '' AND vat_id = $2                              THEN 1
          WHEN $1 <> '' AND lower(display_name) = lower($1)          THEN 2
          ELSE                                                            3
        END
      LIMIT 1`,
    [supplier, vat],
  );

  const row = rows[0];
  if (!row || !row.default_category || !row.default_skr) return null;

  const confidence =
    row.match_kind === 'vat_id' ? 1.0 :
    row.match_kind === 'name'   ? 0.95 :
    row.match_kind === 'alias'  ? 0.9 :
                                  0.0;

  if (confidence < MIN_CONFIDENCE) return null;

  const labelMaybePromise = categoryLabelLookup(row.default_category);
  const label = (await Promise.resolve(labelMaybePromise)) ?? row.default_category;

  return {
    engine: 'master_data',
    confidence,
    category: row.default_category,
    category_label: label,
    skr_account: row.default_skr,
    tax_key: '',
    cost_center: null,
    rationale: `Master-Data-Match (${row.match_kind}) für '${row.display_name}'`,
  };
}
