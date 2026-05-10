/**
 * M03 — override-resolver.ts
 *
 * Strategie 1 nach M03-Spec §7.1:
 *   - Schaut in profile.custom.supplier_overrides[supplier_name]
 *   - Exact Match auf normalisierter Form (lowercase, trim, doppel-spaces gemerged)
 *   - Fuzzy Match per Levenshtein-Distanz ≤ 2
 *
 * Bei Treffer: confidence = 1.0, engine = 'override'.
 * Sonst: null → nächste Strategie greift.
 */

import type { CategorizationResult } from './types';

interface SupplierOverrideEntry {
  category?: string;
  category_label?: string;
  skr?: string;
  skr_account?: string;
  tax_key?: string;
  cost_center?: string | null;
}

export interface OverrideResolverInput {
  supplierName: string;
  profileCustom?: Record<string, unknown>;
  /** Wird genutzt um category_label aufzulösen, wenn der Override nur category nennt. */
  categoryLabelLookup?: (categoryId: string) => string | undefined;
}

function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Diakritika
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein-Distanz, iterativ in O(n·m).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insert
        prev[j] + 1, // delete
        prev[j - 1] + cost, // replace
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function resolveOverride(input: OverrideResolverInput): CategorizationResult | null {
  const overrides =
    (input.profileCustom?.supplier_overrides as
      | Record<string, SupplierOverrideEntry>
      | undefined) ?? undefined;
  if (!overrides || !input.supplierName) return null;

  const normalizedTarget = normalize(input.supplierName);

  // Phase 1: Exact match (auf normalisierter Form).
  for (const [key, entry] of Object.entries(overrides)) {
    if (normalize(key) === normalizedTarget) {
      return buildResult(entry, key, input.categoryLabelLookup);
    }
  }

  // Phase 2: Fuzzy match (Levenshtein ≤ 2).
  let bestKey: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of Object.keys(overrides)) {
    const dist = levenshtein(normalize(key), normalizedTarget);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestKey = key;
    }
  }
  if (bestKey && bestDistance <= 2) {
    return buildResult(overrides[bestKey], bestKey, input.categoryLabelLookup);
  }

  return null;
}

function buildResult(
  entry: SupplierOverrideEntry,
  matchedKey: string,
  labelLookup?: (categoryId: string) => string | undefined,
): CategorizationResult {
  const category = entry.category ?? 'sonstige_aufwand';
  const skrAccount = entry.skr_account ?? entry.skr ?? '';
  const label =
    entry.category_label ?? (labelLookup ? labelLookup(category) : undefined) ?? category;
  return {
    engine: 'override',
    confidence: 1.0,
    category,
    category_label: label,
    skr_account: skrAccount,
    tax_key: entry.tax_key ?? '',
    cost_center: entry.cost_center ?? null,
    rationale: `Supplier-Override für '${matchedKey}'`,
  };
}
