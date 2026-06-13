# T024 — Task-Datenmodell (Migration: tasks / task_collaborators / task_activity_log)

> **Owner:** Andreas (Backend/Infra)
> **Priorität:** P1 (Pilot — Kern-Komponente der Mitarbeiter-Webapp)
> **Dependencies:** keine
> **Welle:** 5
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` §4.1–4.3 · CLAUDE.md §5.5 (Multi-Tenancy/RLS), §6.5 (Migrations)
> **Audit:** REPORT-2026-05-26 F02 · **Blockt:** T025, T027

---

## Ziel

Das laut Konzept zentrale Task-Dashboard hat aktuell **kein DB-Backing** (Dashboard rendert `webapp/src/data/tasks.ts`-Mock). Diese Task legt das Datenmodell gemäß `Mitarbeiter_Webapp.md` §4 an — Grundlage für T025 (API) und T027 (Auto-Trigger).

Eine Migration, fortlaufend nummeriert (nächste freie Nummer prüfen, aktuell zuletzt `110`), rückwärts-kompatibel, mit Rollback-Skript.

---

## Akzeptanz-Kriterien

- [ ] Tabelle `tasks` gemäß §4.1: u.a. `id`, `tenant_id` (NOT NULL, FK), `type` (z.B. `beleg_pruefen`, `datev_fehler`, `onboarding`, …), `title`, `description`, `status` (`offen`/`in_arbeit`/`pausiert`/`erledigt`/`verworfen`), `priority`, `assigned_to` (FK users, nullable), `due_at`, `related_entity_type` + `related_entity_id` (z.B. Beleg-Verknüpfung), `created_at`, `updated_at`.
- [ ] Tabelle `task_collaborators` gemäß §4.2 (für „Helfer einladen"): `task_id`, `user_id`, `invited_by`, `invited_at`.
- [ ] Tabelle `task_activity_log` gemäß §4.3: `task_id`, `actor_user_id`, `event_type`, `payload` (JSONB), `occurred_at`.
- [ ] **RLS** auf allen drei Tabellen analog `audit_log` (`ENABLE` + `FORCE ROW LEVEL SECURITY`, Policy `is_rls_bypassed() OR tenant_id = current_tenant_id()`). `task_collaborators`/`task_activity_log` erben tenant-Bezug über `task_id`-Join oder eigene `tenant_id`-Spalte (entscheiden + begründen).
- [ ] Indizes: mindestens `(tenant_id, status, due_at)` und `(tenant_id, assigned_to)`.
- [ ] Rollback-Skript `<nr>_..._rollback.sql`.
- [ ] Migration läuft lokal (`npm run migrate`) gegen frische DB durch; CI grün.

---

## Hinweise

- **NICHT** mit dem `tasks/`-Verzeichnis (Markdown-Workflow-Tasks) verwechseln — hier geht es um die **DB-Tabelle** für das operative Mitarbeiter-Task-Dashboard.
- RLS-Pattern + Helper: `backend/migrations/060_audit_log.sql`, `002_helpers.sql` (`is_rls_bypassed()`, `current_tenant_id()`).
- Eine Migration pro PR (CLAUDE.md §6.5). Bei Nummern-Kollision mit parallelem PR umnummerieren.
