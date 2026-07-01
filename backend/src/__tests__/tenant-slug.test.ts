/**
 * T093 — Unit-Tests für die Tenant-Slug-Generierung.
 * (Liegt in src/__tests__/, weil der vitest-include src/routes/ nicht erfasst.)
 */

import { describe, expect, it } from 'vitest';
import { slugifyTenantName } from '../routes/tenant-slug';

describe('slugifyTenantName', () => {
  it('macht aus Leerzeichen Bindestriche und lowercased', () => {
    expect(slugifyTenantName('Pizzeria Bella Italia')).toBe('pizzeria-bella-italia');
  });

  it('transliteriert deutsche Umlaute und ß', () => {
    expect(slugifyTenantName('Müller Groß')).toBe('mueller-gross');
    expect(slugifyTenantName('Café Öl Über')).toBe('cafe-oel-ueber');
  });

  it('ersetzt Sonderzeichen/Klammern durch einen Bindestrich', () => {
    expect(slugifyTenantName('Zur Post!!! (GmbH)')).toBe('zur-post-gmbh');
  });

  it('trimmt führende/abschließende Bindestriche', () => {
    expect(slugifyTenantName('  --Test--  ')).toBe('test');
  });

  it('liefert leeren String bei reinen Sonderzeichen (Aufrufer verlangt dann manuellen Slug)', () => {
    expect(slugifyTenantName('!!!')).toBe('');
    expect(slugifyTenantName('###—###')).toBe('');
  });

  it('begrenzt auf maxLen und lässt keinen abschließenden Bindestrich zurück', () => {
    const long = slugifyTenantName(`${'wort '.repeat(30)}`, 20);
    expect(long.length).toBeLessThanOrEqual(20);
    expect(long.endsWith('-')).toBe(false);
  });

  it('Standard-maxLen ist 60 (= Spaltenbreite tenants.slug)', () => {
    expect(slugifyTenantName('a'.repeat(80)).length).toBe(60);
  });
});
