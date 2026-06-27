# T080 — Task-Datenmodell (Migration: tasks / task_collaborators / task_activity_log)

**ID:** T080
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out — Mitarbeiter-Aufgaben-Dashboard, Kern-Komponente der Mitarbeiter-Webapp)
**Branch:** `steve/T080-tasks-datenmodell`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** keine
**Ziel-Meilenstein:** Build-out Phase C (Task-System, „folgt nach Web-Chat")
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Datenmodell für das **interne Mitarbeiter-Aufgaben-Dashboard** anlegen: eine Migration (127)
mit `tasks`, `task_collaborators`, `task_activity_log`. Grundlage für T081 (Backend-API) und
T082 (Webapp-Dashboard).

**Produkt-Kontext (GF Steve, 2026-06-27):** Das Dashboard zeigt **Aufgaben, die Mitarbeitern
zugewiesen sind** — ausdrücklich **keine** Kunden-Belege. Geschäftsführer/Management legen
Aufgaben für Mitarbeiter an (nach Priorität); der Mitarbeiter sieht beim Login „seine" Aufgaben.
Steves eigene Aufgaben kommen später aus `tasks/MANUELLE_AUFGABEN.md` (T083).

**Anker:** Alt-Spec `tasks/_eingefroren/T024-task-datenmodell.md` (Geister-Welt-veraltet, NICHT
1:1 übernehmen) + `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` §4.1–4.3, auf die
**belege-Welt** portiert (CLAUDE.md §3.6/§3.7).

---

## Architektur-Entscheidung: `tasks` ist eine cross-tenant Staff-Tabelle (KEINE Tenant-RLS)

> Bewusste, begründete Abweichung von CLAUDE.md §5.5 — vom code-reviewer zu prüfen.

Alle bestehenden Tabellen (`belege`, `chat_*`, …) sind **tenant-isoliert** per RLS-Policy
`is_rls_bypassed() OR tenant_id = current_tenant_id()`, wobei das Backend pro Request **genau
einen** aktiven Tenant via `app.current_tenant` setzt (`withTenant`, `backend/src/core/db/tenant.ts`).

`tasks` ist anders: Ein Mitarbeiter sieht **„alle meine Aufgaben über alle Mandanten hinweg"**
(Dashboard-Tabs „Meine offenen / Team / Erledigt"). Es gibt also **keinen** einzelnen aktiven
Tenant — die tenant-scoped RLS-Policy würde das Dashboard strukturell unmöglich machen. Zudem
setzt der Request-Pfad `app.current_user_id` **nicht** (verifiziert: `withTenant` setzt nur
`app.current_tenant`), eine user-basierte Policy hätte also kein GUC-Backing.

**Entscheidung:** `tasks`, `task_collaborators`, `task_activity_log` bekommen **keine
Tenant-RLS**. Begründung:
- Es sind **interne Staff-Arbeitsdaten**, kein Endkunden-PII-Isolations-Scope (Steve + Andreas
  betreuen ohnehin alle Mandanten; das „Team"-Tab zeigt absichtlich fremde Aufgaben).
- `tenant_id` ist **nur ein optionaler Verweis** („betrifft Mandant X"), keine Sicherheitsgrenze.
- Zugriffsschutz liegt in der **App-Schicht** (T081): nur authentifizierte Staff-Session
  (JWT `pp_auth`) erreicht die Endpoints; Schreibaktionen per Rollen-Gate; „Meine"-View via
  `assigned_to`-Filter.
- DB-Zugriff läuft daher **nicht** über `withTenant`, sondern über den Pool direkt (T081 baut
  einen schlanken Repository-Pfad; kein `app.current_tenant` nötig).

Falls später echte Tenant-Isolation gewünscht ist (z. B. Mandanten-gebundene Sub-Accounts),
wäre ein dedizierter Staff-Context-Helper (`app.current_user_id` + Policy) der saubere Weg —
**Folge-Task, nicht jetzt**.

---

## Akzeptanz-Kriterien

- [ ] Migration `127_tasks.sql` + Rollback `127_tasks_rollback.sql` (nächste freie Nummer; zuletzt 126).
- [ ] Tabelle `tasks`:
  - `id` UUID PK, `tenant_id` UUID **NULL** REFERENCES `tenants(id)` ON DELETE SET NULL (optionaler Verweis),
  - `type` VARCHAR(50) NOT NULL (z. B. `beleg_pruefen`, `onboarding`, `manuelle_aufgabe`, `sonstige`),
  - `title` VARCHAR(200) NOT NULL, `description` TEXT,
  - `reference_type` VARCHAR(50) NULL, `reference_id` UUID NULL (lose Verknüpfung, **kein** FK),
  - `status` VARCHAR(20) NOT NULL DEFAULT `'offen'` CHECK in (`offen`,`in_arbeit`,`pausiert`,`erledigt`,`verworfen`),
  - `priority` VARCHAR(10) NOT NULL DEFAULT `'normal'` CHECK in (`niedrig`,`normal`,`hoch`,`kritisch`),
  - `assigned_to` UUID NULL REFERENCES `users(id)` ON DELETE SET NULL,
  - `created_by` UUID NULL REFERENCES `users(id)` ON DELETE SET NULL,
  - `claimed_at`, `due_at`, `completed_at` TIMESTAMPTZ NULL,
  - `created_at`, `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now().
- [ ] Tabelle `task_collaborators` (Helfer einladen): `task_id` FK→tasks ON DELETE CASCADE, `user_id` FK→users ON DELETE CASCADE, `added_by` FK→users NULL, `added_at`, PK `(task_id, user_id)`.
- [ ] Tabelle `task_activity_log`: `id` UUID PK, `task_id` FK→tasks ON DELETE CASCADE, `actor` UUID NULL FK→users (NULL=system), `action` VARCHAR(50) NOT NULL, `payload` JSONB, `created_at`.
- [ ] **Keine Tenant-RLS** auf den drei Tabellen (Begründung im Migrations-Kopf-Kommentar, s. o.). Kein `ENABLE/FORCE ROW LEVEL SECURITY`.
- [ ] Indizes: `(assigned_to) WHERE status NOT IN ('erledigt','verworfen')`, `(status, priority, due_at)`, `(tenant_id)`, `task_activity_log (task_id, created_at)`.
- [ ] `GRANT`s analog bestehender Tabellen für Rolle `gastro_app` (SELECT/INSERT/UPDATE/DELETE auf den 3 Tabellen).
- [ ] Migration läuft lokal (`node dist/core/db/migrate.js` bzw. Test-DB-Setup) gegen frische DB durch; Rollback läuft sauber zurück.
- [ ] `npm run build` + `npm test` grün (DB-Tests mit frischer `prozesspilot_test`, siehe Memory `backend-db-test-fresh-db`).
- [ ] code-reviewer-Agent gibt OK (insb. zur RLS-Abweichung)
- [ ] PR-Description vollständig

---

## Spec-Referenzen

- `tasks/_eingefroren/T024-task-datenmodell.md` — Alt-Spec (Anker, Geister-Welt-veraltet → portiert)
- `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` §4.1–4.3 — Tabellen-Schema
- `backend/migrations/124_chat_sessions.sql` / `125_chat_messages.sql` — Migrations-/GRANT-Muster (belege-Welt)
- `backend/migrations/002_helpers.sql` — RLS-Helper (`current_tenant_id`, `is_rls_bypassed`) — hier bewusst NICHT verwendet
- CLAUDE.md §5.5 (Multi-Tenancy — Abweichung begründet), §6.5 (Migrations-Regeln)

---

## Notes

- **NICHT** mit dem `tasks/`-Verzeichnis (Markdown-Workflow-Tasks) verwechseln — hier geht es um die **DB-Tabelle** fürs operative Mitarbeiter-Dashboard.
- Status-FSM bewusst auf 5 Werte begrenzt (passt zu Quick-Actions claim→`in_arbeit` / pause→`pausiert` / complete→`erledigt` / discard→`verworfen`). Der Alt-Spec-Wert `wartet_auf_kunde` entfällt im ersten Wurf (kann später per CHECK-Erweiterung dazu).
- `reference_type`/`reference_id` als lose Verknüpfung **ohne FK** (Muster wie `chat_sessions.trigger_reference_id`): ein referenzierter Beleg darf unabhängig gelöscht werden.

---

## Offene Fragen (während der Bearbeitung)

<keine offen — RLS-Modell oben entschieden>

---

## Review-Ergebnis (PR #194, mehrdimensionaler adversarialer Workflow, 2026-06-27)

5 Review-Lenses (Security/RLS · SQL-Schema · Tests · Konventionen/Drift · Tragfähigkeit) →
jede Finding adversarial verifiziert. **28 Findings, 19 bestätigt, 0 Blocker.**

- **Architektur validiert:** Die No-RLS-Entscheidung wurde bestätigt und hat einen direkten
  Repo-**Präzedenzfall**: `020_users_auth.sql` (users/auth_sessions sind ebenfalls cross-tenant,
  bewusst ohne RLS). Kein Sonderweg. Drift-Check sauber (0 Geister-Tabellen-Referenzen).
- **Adversarial herausgefiltert (9):** u.a. der „GRANT-AC-Divergenz"-Vorwurf (3×) — `ALTER
  DEFAULT PRIVILEGES` ist korrekt; sowie „reference_id-IDOR" und „PII-in-JSONB" (kein Writer im PR).
- **Eingearbeitet (PR #194):** collaborators-CASCADE + PK-Duplicate-Test, SET-NULL-Test,
  gastro_app-Zugriffstest, Index-Existenz-Test, NOT-NULL/Default-Test (7→12 Tests);
  Index `idx_task_collaborators_user`; Präzedenzfall-Zitat + priority-Sortier-Warnung in der Migration.

### ⚠️ VERBINDLICHE Invarianten für T081 (aus dem Review — ohne RLS ist die App die einzige Grenze)

1. **Jeder `tasks`-Endpoint hinter authentifizierter Staff-Session** (JWT `pp_auth`); kein anonymer/Magic-Link-Zugang.
2. **Rollen-Gate auf allen Schreibaktionen** (create/assign/claim/complete/collaborator-add), analog T062.
3. **„Meine"-/Sichtbarkeits-Filter IM SQL erzwingen** (`assigned_to`/collaborator), nie erst im Frontend.
4. **`tasks` NIE innerhalb eines `withTenant()`-Blocks abfragen** — das setzt nur `app.current_tenant` ohne Policy-Wirkung → trügerisches Pseudo-Scoping (liefert trotzdem alle Tenants).
5. **`payload` (JSONB) / `description` / `title`: keine Endkunden-PII/Secrets** — nur Meta (`{from,to,by}`). `task_activity_log` ist KEIN GoBD-/Accountability-Audit (das bleibt `audit_log`/060).
6. **`priority` per CASE/array_position sortieren** (kritisch→hoch→normal→niedrig), nie naiv `ORDER BY priority`.
7. **Test, der nachweist:** Mitarbeiter A kann Aufgabe von B nicht ohne Berechtigung mutieren.

### Offene Folge-Notizen (nicht-blockierend)
- **T083-Idempotenz:** MANUELLE_AUFGABEN-Sync braucht ein Dedup-Feld (z.B. `source`/`source_key` TEXT
  + UNIQUE), sonst erzeugt ein erneuter `/schicht`-Sync Duplikate. Additiv per Migration in T083 lösbar.
- **Spec §4.1** Status-Kommentar bei Gelegenheit an die tatsächliche FSM (`in_arbeit`/`pausiert`) angleichen.

## Lessons Learned (nach Abschluss)

<nach Merge ausfüllen>
