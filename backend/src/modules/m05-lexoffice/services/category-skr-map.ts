/**
 * T009/M05 — ProzessPilot-Kategorie → SKR04-Konto Mapping.
 *
 * Pilot-Set: nur Gastronomie-typische Kategorien. Wenn category=null oder
 * unbekannt → '4980' (Sonstige Aufwendungen) als Fallback.
 *
 * Die SKR-Account-Strings werden vom CategoryMapper an Lexoffice-Category-
 * UUIDs uebersetzt (siehe core/adapters/booking/lexoffice/category.mapper.ts).
 *
 * Erweiterbar pro Tenant via customer_categories Override (existing
 * Migration/Service — Phase 2 wenn der Pilot wirklich custom Kategorien hat).
 */

export const CATEGORY_TO_SKR04: Record<string, string> = {
  // Bewirtungs-Kategorien (T008 Bewirtungs-Hook setzt category='bewirtung')
  bewirtung: '6644', // SKR04 Bewirtungsaufwand abziehbar (70%)
  bewirtung_kunden: '6644',
  bewirtung_personal: '6645',

  // Wareneinkauf (Gastronomie)
  wareneinkauf_food: '5400', // SKR04 Wareneingang 7%
  wareneinkauf_getraenke: '5410',
  wareneinkauf_alkohol: '5410',

  // Betriebsbedarf
  reinigung: '6230',
  buerobedarf: '6815',
  geringwertige_wirtschaftsgueter: '6260',

  // Fahrzeug + Reise
  kfz_kraftstoff: '6520',
  reisekosten: '6660',

  // Sonstiges
  porto: '6800',
  telekommunikation: '6805',
  fortbildung: '6821',
};

/** SKR04-Konto fuer eine ProzessPilot-Kategorie. Fallback: '4980' (Sonstige). */
export function categoryToSkr04(category: string | null | undefined): string {
  if (!category) return '4980';
  const normalized = category.toLowerCase().trim();
  return CATEGORY_TO_SKR04[normalized] ?? '4980';
}
