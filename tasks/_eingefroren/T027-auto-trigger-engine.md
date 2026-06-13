# T027 — Auto-Trigger-Engine für Tasks

> **Owner:** Andreas (Backend/Infra)
> **Priorität:** P1 (Pilot — ohne Trigger entstehen Tasks nicht automatisch)
> **Dependencies:** **T024** (Datenmodell) gemerged; profitiert von T025 (API)
> **Welle:** 6
> **Spec-Referenzen:** `Mitarbeiter_Webapp.md` §5 (Auto-Trigger-Engine, Trigger-Tabelle §5.1, Implementation §5.2) · `01_Datenmodell_Events.md` (Redis-Streams `pp.*`/`gastro.*`)
> **Audit:** REPORT-2026-05-26 F03

---

## Ziel

Engine, die aus System-Events automatisch Tasks erzeugt (z.B. „Beleg braucht manuelle Prüfung" → Task `beleg_pruefen`, „DATEV-Export fehlgeschlagen" → `datev_fehler`). Gemäß §5: Trigger-Tabelle + Listener auf Redis-Streams bzw. Cron.

---

## Akzeptanz-Kriterien

- [ ] Trigger-Definition gemäß §5.1 (Event-Typ → Task-Typ-Mapping, Bedingungen, Ziel-Rolle/Assignee, Dedup-Key).
- [ ] Listener auf relevante Redis-Stream-Events (`gastro.receipt.*`, `gastro.export.*`, …) **oder** Cron-Scan — Variante gemäß §5.2 wählen + begründen.
- [ ] Idempotenz: dasselbe Event erzeugt nicht doppelt denselben Task (Dedup über `related_entity` + `type`).
- [ ] Erzeugte Tasks landen tenant-isoliert in `tasks` (T024) und sind über T025-API sichtbar.
- [ ] Mindestens 2 konkrete Trigger pilot-relevant verdrahtet (z.B. `requires_review`-Beleg → `beleg_pruefen`; fehlgeschlagener Export → `datev_fehler`/`export_fehler`).
- [ ] Unit-Tests (Trigger-Matching, Dedup) + Integrationstest gegen echte DB; CI grün.

---

## Hinweise

- Bestehende Cron-/Worker-Muster: `backend/src/cron/` (z.B. `sumup-daily.ts`, `pos-credentials-cleanup.ts`).
- Event-Namen-Konvention CLAUDE.md §6.2 (`gastro.<entity>.<verb_past>`). Falls Events bisher nur in n8n existieren: klären, ob Trigger im Backend-Stream-Listener oder via n8n-Callback läuft (n8n-vs-Backend-Trennung §5.1 CLAUDE.md).
- Hängt fachlich mit M01 `requires_review`-Logik (T008) zusammen.
