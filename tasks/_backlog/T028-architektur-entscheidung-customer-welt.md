# T028 — Architektur-Entscheidung: Legacy-`customer`-Welt vs. `tenant`-Reboot

> **Owner:** Steve + Andreas (gemeinsam — Entscheidungs-Task, kein reiner Code)
> **Priorität:** P1 (Pilot — blockiert sauberen Datenmodell-Stand)
> **Dependencies:** keine
> **Welle:** 5
> **Spec-Referenzen:** `01_Datenmodell_Events.md` §6 · `backend/migrations/030_belege.sql` · `backend/src/app.ts:267–302`
> **Audit:** REPORT-2026-05-26 F09 · **Blockt:** T029

---

## Ziel

Das Backend registriert **zwei parallele Daten-Welten gleichzeitig**:
- **Alt:** `customer_id`-Welt — Routen `/customers`, Module `customers/`, `profiles/`, `documents/`, `reports/`, `receipts/`.
- **Neu (Reboot):** `tenant_id`/`belege`-Welt mit RLS (`030_belege.sql` erklärt `receipts` für tot).

`01_Datenmodell_Events.md` §6 beschreibt noch die **alte** Welt. Diese Task trifft die Entscheidung, **welche Welt der Standard ist**, und legt den Migrationspfad fest. Sie produziert primär eine dokumentierte Entscheidung (ADR), nicht zwingend Code.

---

## Akzeptanz-Kriterien

- [ ] Entscheidung dokumentiert (ADR unter `infra/decisions/` oder im Konzept): bleibt die `customer`-Welt (z.B. weil n8n-Workflows sie nutzen) oder wird sie abgebaut?
- [ ] Falls Abbau: Liste der betroffenen Routen/Module/Tabellen + Reihenfolge (welche n8n-Workflows hängen dran?) — verzahnt mit **T019** (alte /receipts-Routen entfernen).
- [ ] Falls Koexistenz: klare Regel, welche Welt für welchen Zweck (z.B. „belege = Pilot-Pfad, customer = Legacy/n8n bis Migration X") + Hinweis in CLAUDE.md/Konzept.
- [ ] Ergebnis triggert konkret **T029** (Datenmodell-Doc-Sync) mit dem entschiedenen Zielbild.
- [ ] Keine widersprüchliche Doku mehr: §6 und der Code-Stand erzählen dieselbe Geschichte.

---

## Hinweise

- Diese Frage konnte das Audit nicht selbst entscheiden (Specs uneindeutig) — bewusst als **menschliche Architektur-Entscheidung** markiert.
- Verwandt: T019 (Routen-Cleanup), T029 (Doc-Sync), T023 (Integrationstests).
