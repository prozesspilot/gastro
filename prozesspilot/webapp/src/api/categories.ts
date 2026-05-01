import type { Category } from '../types';
import { apiRequest, unwrap } from './_client';

const FALLBACK_CATEGORIES: Category[] = [
  { id: 'wareneinkauf_food',      name: 'Wareneinkauf Lebensmittel', skr03_konto: '3100', skr04_konto: '5100', is_system: true },
  { id: 'wareneinkauf_nonfood',   name: 'Wareneinkauf Non-Food',     skr03_konto: '3200', skr04_konto: '5200', is_system: true },
  { id: 'betriebskosten_energie', name: 'Energiekosten',             skr03_konto: '4240', skr04_konto: '6325', is_system: true },
  { id: 'miete',                  name: 'Miete & Pacht',             skr03_konto: '4210', skr04_konto: '6310', is_system: true },
  { id: 'personal',               name: 'Personalkosten',            skr03_konto: '4120', skr04_konto: '6020', is_system: true },
  { id: 'versicherung',           name: 'Versicherungen',            skr03_konto: '4360', skr04_konto: '6400', is_system: true },
  { id: 'marketing',              name: 'Marketing & Werbung',       skr03_konto: '4610', skr04_konto: '6600', is_system: true },
  { id: 'reise',                  name: 'Reisekosten',               skr03_konto: '4670', skr04_konto: '6660', is_system: true },
  { id: 'bewirtung',              name: 'Bewirtungskosten',          skr03_konto: '4650', skr04_konto: '6640', is_system: true },
  { id: 'buerokosten',            name: 'Bürokosten',                skr03_konto: '4930', skr04_konto: '6815', is_system: true },
  { id: 'reparatur',              name: 'Reparaturen',               skr03_konto: '4805', skr04_konto: '6335', is_system: true },
  { id: 'steuer',                 name: 'Steuern',                   skr03_konto: '7600', skr04_konto: '7600', is_system: true },
  { id: 'kommunikation',          name: 'Telefon & Internet',        skr03_konto: '4920', skr04_konto: '6805', is_system: true },
  { id: 'sonstige_aufwand',       name: 'Sonstige Aufwendungen',     skr03_konto: '4900', skr04_konto: '6800', is_system: true },
];

export async function getCategories(tenantId?: string): Promise<Category[]> {
  const raw = await apiRequest<unknown>('/categories', { tenantId, optional: true });
  if (raw === undefined) return FALLBACK_CATEGORIES;
  const list = unwrap<Category[] | undefined>(raw);
  return Array.isArray(list) && list.length > 0 ? list : FALLBACK_CATEGORIES;
}
