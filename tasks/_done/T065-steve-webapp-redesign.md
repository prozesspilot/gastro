# T065 — Webapp-Redesign: ProzessPilot Light Design System

**ID:** T065
**Verantwortlich:** Steve
**Priorität:** P2 (UI/Marke — interne Staff-Webapp auf das Standard-Dokumenten-System hell umstellen)
**Branch:** `steve/T065-webapp-redesign`
**Anker:** `design/README.md` (in Claude Design generiertes Design-System) · CLAUDE.md §5.2 (Mitarbeiter-Webapp)

---

## Was zu tun ist

Die interne Mitarbeiter-Webapp war ein dunkles Dev-Theme (Neon-Akzente, blau-violett-pinker Verlauf). Umstellung auf das **ProzessPilot Light Design System** (Azure-Marke, helle Slate-Neutrale, dokumenten-orientiert), erstellt in Claude Design.

- **`webapp/src/index.css` komplett neu** (2096 → ~350 Z.): neues `:root`-Token-Set (Azure-Brand, Status-Farben, Schatten, Abstände, Schrift) **plus rückwärts-kompatible Aliase** für die von Komponenten genutzten Variablen (`--bg`/`--surface`/`--text`/`--border`/`--blue`/… → Hell-Werte). Totes CSS gelöschter Seiten (T059-Reboot) entfernt. Nur die real verwendeten Klassen restyled (app-shell, sidebar, nav, top-bar, card, kpi, buttons, badges, modal, toast, skeleton, conn-rows, error-screen, tenant-selector, field).
- **`index.html`:** Google-Fonts geladen (Poppins/Manrope/JetBrains Mono), `theme-color` hell.
- **`manifest.json`:** PWA-Farben hell.
- **Inline-Dunkel-Reste in lebenden Komponenten** gefixt: DashboardPage-KPI-Farben → Marken-Tokens, BelegeListPage-Zeilen-Hover (war weiß-auf-weiß), UserMenu-Schatten, EmptyState-Icon-BG. (Beleg-Detail-Lightbox-Overlays `rgba(0,0,0,…)` bewusst belassen.)

## Akzeptanz-Kriterien

- [x] `index.css` auf Design-System-Tokens umgestellt, totes CSS entfernt
- [x] Schriften geladen, `theme-color`/Manifest hell
- [x] `npx tsc --noEmit` + `npm run build` grün (CSS 40 kB → 16 kB)
- [x] `npm test` grün (8 Fails = bekannte Node-26-lokal-localStorage-Falle, CI-Node-20 grün)
- [ ] **Visuelle Abnahme durch Steve** (lokal `cd webapp && npm run dev` oder nach Deploy)

## Nicht in dieser Task (Folge)

- **Logo/Icon** (`public/icon.svg`) ist noch der alte blau-violett-pinke Verlauf — Anpassung an die Azure-Marke separat.
- Feinschliff einzelner Inline-Styles in den Belege-Seiten (Status-Hex `#f87171` etc.) bei Bedarf.
- Adoption der Design-System-Komponenten-Klassen (`.btn`, `.badge-*`, `.data`-Tabelle) bei T060/T061.

## Spec-Referenzen

- `design/README.md` + Claude-Design-Artifact (kanonische Vorschau)
- `webapp/src/index.css`, `webapp/index.html`, `webapp/public/manifest.json`
