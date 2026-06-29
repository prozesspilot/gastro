/**
 * T085 — Umschalter zwischen hellem und dunklem Design (Sidebar-Fußzeile).
 *
 * Hält den Theme-State, wendet ihn auf <html> an (data-theme) und persistiert
 * ihn. Beim ersten Mount synchronisiert der useEffect den DOM-Zustand mit dem
 * (ggf. system-abgeleiteten) Initial-Theme.
 */
import { useEffect, useState } from 'react';
import { type Theme, applyTheme, getInitialTheme, storeTheme } from '../lib/theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Spiegelt das Theme in den DOM — ohne zu persistieren, damit der erste Mount
  // (system-abgeleitet) keine Wahl einfriert.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === 'dark';

  function toggle(): void {
    const next: Theme = isDark ? 'light' : 'dark';
    storeTheme(next); // nur die EXPLIZITE Nutzer-Wahl persistieren
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'}
      title={isDark ? 'Helles Design' : 'Dunkles Design'}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isDark ? '☀️' : '🌙'}
      </span>
      <span>{isDark ? 'Helles Design' : 'Dunkles Design'}</span>
    </button>
  );
}
