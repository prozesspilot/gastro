# T085 — Dark-/Light-Mode-Umschalter (Mitarbeiter-Webapp)

**ID:** T085
**Verantwortlich:** Steve
**Priorität:** P2 (UX, Mitarbeiter-Webapp)
**Branch:** `steve/T085-darkmode-toggle`
**Dependencies:** T065 (Light Design System / Token-`index.css`)

---

## Was zu tun ist

Ein Umschalter unten links in der Sidebar-Fußzeile, der zwischen hellem und dunklem Design wechselt.

## Umsetzung

Das Design System (T065) ist tokenbasiert — Komponenten lesen ausschließlich `var(--…)`. Daher
genügt ein Dark-Token-Satz; die UI rethemed automatisch, kein Komponenten-Umbau.

- `index.css`: `:root[data-theme="dark"]`-Block überschreibt die Tokens (Flächen/Text/Rahmen/Status/
  Schatten; Marke Azure bleibt) + `color-scheme` + 3 Overrides für hardkodierte Hell-Flächen
  (`.top-bar`, `.badge.purple`, `.error-box`). `.theme-toggle`-Style.
- `lib/theme.ts`: `getInitialTheme` (Wahl > System-Präferenz > light), `applyTheme` (setzt
  `data-theme` auf `<html>` + persistiert in localStorage `pp_theme`).
- `components/ThemeToggle.tsx`: Button (🌙/☀️), hält State + wendet an.
- `Layout.tsx`: ThemeToggle in der Sidebar-Fußzeile.
- `index.html`: No-Flash-Inline-Script setzt `data-theme` vor dem ersten Paint.

## Tests

- `ThemeToggle.test.tsx` — 4 (Default light, Wechsel→dark + Persistenz, zurück→light, Wiederherstellung aus localStorage).

## Status

✅ Implementiert. Webapp tsc + 241 passed + Build grün.

**Bewusste Grenze:** Einzelne hartkodierte Inline-Farben (z. B. `#fff` auf Brand-Buttons) sind im
Dark unkritisch; falls später eine Stelle im Dark schlecht aussieht, punktuell auf Tokens umstellen.
