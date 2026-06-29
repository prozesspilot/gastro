/**
 * T085 — Theme-Verwaltung (Light/Dark) für die Mitarbeiter-Webapp.
 *
 * Das aktive Theme wird über `data-theme` auf <html> gesteuert; index.css
 * überschreibt darunter die Design-Tokens. Persistenz in localStorage. Das
 * erste Setzen (flackerfrei) macht ein Inline-Script in index.html — diese
 * Funktionen halten Laufzeit-Wechsel + Persistenz konsistent dazu.
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'pp_theme';

/** Gespeicherte Wahl oder null (nie gewählt / localStorage nicht verfügbar). */
export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Wahl > System-Präferenz > 'light'. Muss zur Logik im index.html-Script passen. */
export function getInitialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    /* matchMedia nicht verfügbar (z. B. jsdom) → light */
  }
  return 'light';
}

/** Setzt `data-theme` auf <html> und persistiert die Wahl. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* Persistenz best-effort */
  }
}
