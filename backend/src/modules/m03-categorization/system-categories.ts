/**
 * M03 — System-Kategorien (Single Source of Truth).
 *
 * In-Memory-Liste der Gastro-Standardkategorien mit SKR03/SKR04-Konten.
 * Wird genutzt von:
 *   - categories.routes.ts        (GET /api/v1/categories)
 *   - belege-categorizer.ts       (T048/F2 — Pilot-Kategorisierung auf belege)
 *
 * DECISION (Pilot): Kategorien sind hartkodiert. Tenant-spezifische Custom-Konten
 * (DB-Persistenz, Overrides) sind Post-Pilot — siehe CLAUDE.md §3.4 (eingefrorene
 * volle M03-Logik). Quelle der Werte: vormals categories.routes.ts.
 */

export type SkrChart = 'SKR03' | 'SKR04';

export interface SystemCategory {
  id: string;
  name: string;
  skr03_konto: string;
  skr04_konto: string;
  is_system: true;
}

export const SYSTEM_CATEGORIES: readonly SystemCategory[] = [
  {
    id: 'wareneinkauf_food',
    name: 'Wareneinkauf Lebensmittel',
    skr03_konto: '3100',
    skr04_konto: '5100',
    is_system: true,
  },
  {
    id: 'wareneinkauf_nonfood',
    name: 'Wareneinkauf Non-Food',
    skr03_konto: '3200',
    skr04_konto: '5200',
    is_system: true,
  },
  {
    id: 'betriebskosten_energie',
    name: 'Energiekosten',
    skr03_konto: '4240',
    skr04_konto: '6325',
    is_system: true,
  },
  { id: 'miete', name: 'Miete & Pacht', skr03_konto: '4210', skr04_konto: '6310', is_system: true },
  {
    id: 'personal',
    name: 'Personalkosten',
    skr03_konto: '4120',
    skr04_konto: '6020',
    is_system: true,
  },
  {
    id: 'versicherung',
    name: 'Versicherungen',
    skr03_konto: '4360',
    skr04_konto: '6400',
    is_system: true,
  },
  {
    id: 'marketing',
    name: 'Marketing & Werbung',
    skr03_konto: '4610',
    skr04_konto: '6600',
    is_system: true,
  },
  { id: 'reise', name: 'Reisekosten', skr03_konto: '4670', skr04_konto: '6660', is_system: true },
  {
    id: 'bewirtung',
    name: 'Bewirtungskosten',
    skr03_konto: '4650',
    skr04_konto: '6640',
    is_system: true,
  },
  {
    id: 'buerokosten',
    name: 'Bürokosten',
    skr03_konto: '4930',
    skr04_konto: '6815',
    is_system: true,
  },
  {
    id: 'reparatur',
    name: 'Reparaturen',
    skr03_konto: '4805',
    skr04_konto: '6335',
    is_system: true,
  },
  { id: 'steuer', name: 'Steuern', skr03_konto: '7600', skr04_konto: '7600', is_system: true },
  {
    id: 'kommunikation',
    name: 'Telefon & Internet',
    skr03_konto: '4920',
    skr04_konto: '6805',
    is_system: true,
  },
  {
    id: 'sonstige_aufwand',
    name: 'Sonstige Aufwendungen',
    skr03_konto: '4900',
    skr04_konto: '6800',
    is_system: true,
  },
] as const;

/** Fallback-Kategorie, wenn keine sichere Zuordnung möglich ist. */
export const FALLBACK_CATEGORY_ID = 'sonstige_aufwand';

const BY_ID = new Map<string, SystemCategory>(SYSTEM_CATEGORIES.map((c) => [c.id, c]));

export function findCategory(id: string): SystemCategory | undefined {
  return BY_ID.get(id);
}

/** Liefert das SKR-Konto einer Kategorie für den gewählten Kontenrahmen. */
export function skrAccountFor(id: string, chart: SkrChart): string | null {
  const cat = BY_ID.get(id);
  if (!cat) return null;
  return chart === 'SKR04' ? cat.skr04_konto : cat.skr03_konto;
}

/** Gültige Kategorie-ID? (für Validierung der KI-Antwort) */
export function isKnownCategory(id: string): boolean {
  return BY_ID.has(id);
}
