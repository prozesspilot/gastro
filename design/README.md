# ProzessPilot — Design System (Light)

Quelle: in **Claude Design** generiert (2026-06-17), Marke = ProzessPilot Azure.
Die kanonische Vorschau (alle Screens + Komponenten als eine HTML-Datei) liegt im
Claude-Design-Artifact. Auf Wunsch wird sie zusätzlich hier eingecheckt
(`prozesspilot-design-system.html`).

Die Design-Tokens (`:root`) und Komponenten-Styles wurden in `webapp/src/index.css`
**portiert** (Task T065) — das ist die produktive Umsetzung.

**Regel für künftige UI-Arbeit:** Farben/Abstände/Radien/Schatten immer aus den
Design-Tokens nehmen (`--color-brand`, `--surface-*`, `--status-*`, `--shadow-*`,
`--space-*`), keine hartkodierten Hex-Werte in Komponenten.

## Marke
- Primär (Azure): `#0A95E0` · Hover `#0879C2` · Aktiv `#0A619C` · Akzent/Cyan `#00BEF0`
- Neutrale: kühle Slate-Skala (`#F6F8FB` … `#181E27`)
- Status (Beleg-Lebenszyklus): neutral=Slate · in Arbeit=Blau · abgeschlossen=Grün ·
  Prüfung nötig=Orange · Fehler=Rot

## Schriften
- **Poppins** — Display/Headlines
- **Manrope** — Body/UI
- **JetBrains Mono** — Zahlen/IDs/Beträge
