---
name: webapp-design-system
description: "Webapp nutzt seit T065 das ProzessPilot Light Design System (index.css-Tokens, Azure-Marke, Poppins/Manrope) — UI-Arbeit immer über Tokens, nie hartkodierte Farben."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9dad7ad0-0b6a-43a0-9a23-ca3262a982f2
---

Die Mitarbeiter-Webapp (`webapp/`) nutzt seit **T065 (PR #140, 2026-06-17)** das **ProzessPilot Light Design System** — kein Dark-Theme mehr. Quelle: in Claude Design erstellt, dokumentiert in `design/README.md`, produktiv portiert in `webapp/src/index.css` (von 2096 auf ~350 Z. neu geschrieben, totes CSS gelöscht).

**Tokens (alle in `:root` von `index.css`):**
- Marke: `--color-brand:#0A95E0` (Azure), Hover `#0879C2`, Aktiv `#0A619C`, Akzent `--color-accent:#00BEF0`.
- Neutral: kühle Slate-Skala `--pp-gray-50…950`; Flächen `--surface-page` (#F6F8FB), `--surface-card` (#fff), `--surface-sunken`.
- Status (Beleg-Lebenszyklus): `--status-{neutral|progress|success|attention|error}-{fg|bg|dot}`.
- Schatten `--shadow-xs…xl`, Radien `--radius-sm/--radius/--radius-lg/--radius-xl`, Abstände `--space-*`.
- Schrift: `--font-display` Poppins, `--font-body` Manrope, `--font-mono` JetBrains Mono (in `index.html` per Google-Fonts-`<link>` geladen).
- **Rückwärts-kompatible Aliase** (`--bg/--surface/--card/--text/--text-muted/--border/--blue/--green/--orange/…`) sind auf die Hell-Werte gemappt — viele Komponenten nutzen diese inline.

**REGEL für UI-Arbeit:** immer Tokens verwenden, **nie** hartkodierte Hex-Werte in Komponenten (genau das war das Alt-Problem — Dunkel-Pastell mit schwachem Kontrast auf hell, vgl. CategoryBadge/Status-Hex-Fix in T065). Lebende Komponenten-Klassen (app-shell, sidebar, nav-item, top-bar, card, kpi-*, primary/secondary/ghost/danger, badge+Varianten active/info/pending/inactive/purple, modal, toast, skeleton, conn-*, error-screen/box, tenant-selector, field) sind in `index.css` definiert.

**Offen:** Logo `webapp/public/icon.svg` ist noch der alte blau-violett-pinke Verlauf (passt nicht zur Azure-Marke) — separater Task. Verifikation per Playwright-Screenshot (gemockte M14-Session + Tenant, Catch-all-Route ZUERST registrieren wegen Playwrights Reverse-Matching). Related: [[a3-webapp-reboot-plan]].
