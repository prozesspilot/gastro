/**
 * T093 — Slug-Generierung für neue Mandanten.
 *
 * Erzeugt aus dem Anzeige-Namen (z. B. "Pizzeria Bella Italia!") einen
 * URL-/DB-tauglichen Slug ("pizzeria-bella-italia"), passend zur `slugSchema`
 * (nur [a-z0-9-], 2–64 Zeichen) und zur DB-Spalte `tenants.slug VARCHAR(60)`.
 *
 * Deutsche Umlaute/ß werden explizit transliteriert (ä→ae, ö→oe, ü→ue, ß→ss),
 * damit "Müller" → "mueller" (nicht "m-ller"). Sonstige Akzente werden per
 * NFKD in Basisbuchstabe + kombinierendes Zeichen zerlegt; das kombinierende
 * Zeichen fällt anschließend in den `[^a-z0-9]+`-Ersatz (→ Bindestrich, danach
 * getrimmt), sodass "Café" → "cafe" wird. Ergebnis auf `maxLen` (Default 60,
 * = Spaltenbreite) begrenzt. Kann leer/zu kurz sein (Name nur aus Sonderzeichen)
 * — der Aufrufer prüft die Mindestlänge und fordert dann einen manuellen Slug an.
 */
const UMLAUT_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

export function slugifyTenantName(name: string, maxLen = 60): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUT_MAP[c] ?? c)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-') // alles Nicht-Alphanumerische (inkl. NFKD-Akzente) → Bindestrich
    .replace(/^-+|-+$/g, '') // führende/abschließende Bindestriche weg
    .slice(0, maxLen)
    .replace(/-+$/g, ''); // falls slice mitten in einem Bindestrich-Block endet
}
