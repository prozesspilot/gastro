/**
 * T052 — Single Source of Truth für SKR-Konten beim Lexware-Export.
 *
 * Das SKR-Konto wird EINMAL bei der Kategorisierung (M03 / T048) aus
 * SYSTEM_CATEGORIES berechnet, dem Mitarbeiter angezeigt UND in
 * `payload.categorization.skr_account` persistiert. Der Export (M05) konsumiert
 * GENAU diesen persistierten Wert — er rechnet NICHT mit einer eigenen Map neu.
 * Damit gilt strukturell: angezeigtes SKR-Konto == gebuchtes SKR-Konto.
 *
 * Vor T052 hatte M05 eine eigene, abweichende Map (`category-skr-map.ts`) mit
 * anderem Vokabular, anderen Werten und anderem Kontenrahmen — Folge: der
 * angezeigte SKR wich vom gebuchten ab. Die Map wurde mit T052 entfernt.
 *
 * Fallback-Kette (nur falls — Ausnahme — keine Kategorisierung persistiert ist,
 * z. B. ein Beleg, der nie durch /categorize lief). In ALLEN Fällen ist die
 * Quelle SYSTEM_CATEGORIES, niemals ein zweiter Pfad:
 *   1) `payload.categorization.skr_account` (der angezeigte Wert) — Normalfall
 *   2) `skrAccountFor(beleg.category, PILOT_SKR_CHART)` aus SYSTEM_CATEGORIES
 *   3) `skrAccountFor(FALLBACK_CATEGORY_ID, PILOT_SKR_CHART)` — sonstige_aufwand
 *
 * GRENZE DER GARANTIE (T054): „angezeigt == gebucht" gilt hier auf der Ebene des
 * SKR-Konto-Strings. Die anschließende Übersetzung SKR-Konto → Lexoffice-
 * `categoryId`-UUID (`core/adapters/booking/lexoffice/category.mapper.ts`) ist ein
 * separater Schritt; dessen Heuristik ist aktuell mit einem abweichenden SKR-Satz
 * verschlüsselt, sodass am echten Buchungspunkt noch eine Divergenz entstehen kann.
 * Das schließt T054 (Seed der `lexoffice_category_map` / Heuristik-Angleichung).
 */

import {
  FALLBACK_CATEGORY_ID,
  PILOT_SKR_CHART,
  skrAccountFor,
} from '../../m03-categorization/system-categories';

/** Form des persistierten Kategorisierungs-Blocks (nur das hier benötigte Feld). */
interface PersistedCategorization {
  skr_account?: unknown;
}

/** Minimale Beleg-Form, die der Resolver braucht (Subset der M05-BelegRow). */
export interface BelegForSkr {
  category: string | null;
  payload: Record<string, unknown>;
}

/**
 * Ermittelt das beim Lexware-Export zu buchende SKR-Konto.
 *
 * Liefert immer einen nicht-leeren String: im Normalfall den bei der
 * Kategorisierung persistierten Wert, sonst den Fallback über SYSTEM_CATEGORIES.
 */
export function resolveExportSkrAccount(beleg: BelegForSkr): string {
  // 1) Persistierter Wert aus der Kategorisierung (Normalfall, T048).
  const categorization = beleg.payload?.categorization as PersistedCategorization | undefined;
  const persisted = categorization?.skr_account;
  if (typeof persisted === 'string' && persisted.length > 0) {
    return persisted;
  }

  // 2) Fallback: aus SYSTEM_CATEGORIES rekonstruieren (gleiche Quelle!).
  if (beleg.category) {
    const account = skrAccountFor(beleg.category, PILOT_SKR_CHART);
    if (account) return account;
  }

  // 3) Letzter Fallback: sonstige_aufwand — ebenfalls aus SYSTEM_CATEGORIES.
  // FALLBACK_CATEGORY_ID ist garantiert in SYSTEM_CATEGORIES, daher ist
  // skrAccountFor hier nie null (?? '' nur, um den string|null-Typ zu schließen;
  // ein leerer String degradiert im CategoryMapper ohnehin sauber zu 'sonstige').
  return skrAccountFor(FALLBACK_CATEGORY_ID, PILOT_SKR_CHART) ?? '';
}

/**
 * Wurde der Beleg bereits kategorisiert (M03/T048)? Signal ist der vom
 * categorize-Handler persistierte `payload.categorization`-Block.
 *
 * Genutzt als Export-Status-Gate (Review #2): ein noch NICHT kategorisierter
 * Beleg darf nicht exportiert werden — sonst greift oben die Sonstige-Fallback-
 * Kette und der Beleg würde still ohne KI-Konto auf „Sonstige" gebucht.
 */
export function hasPersistedCategorization(payload: Record<string, unknown>): boolean {
  const categorization = payload?.categorization;
  return typeof categorization === 'object' && categorization !== null;
}
