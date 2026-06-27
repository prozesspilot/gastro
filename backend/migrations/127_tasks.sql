-- 127_tasks.sql
-- T080 / Build-out — Mitarbeiter-Aufgaben-Dashboard: Datenmodell.
--
-- Drei Tabellen für das INTERNE Mitarbeiter-Aufgaben-Dashboard:
--   tasks               — eine zugewiesene/zu erledigende Aufgabe
--   task_collaborators  — eingeladene Helfer ("👥 Helfer einladen")
--   task_activity_log    — Aktivitäts-Historie pro Aufgabe (created/claimed/…)
--
-- Produkt-Kontext (GF Steve, 2026-06-27): Das Dashboard zeigt AUFGABEN, die
-- Mitarbeitern zugewiesen sind — ausdrücklich KEINE Kunden-Belege. GF/Management
-- legen Aufgaben für Mitarbeiter an (nach Priorität); der Mitarbeiter sieht beim
-- Login "seine" Aufgaben (assigned_to). Steves eigene Aufgaben kommen später aus
-- tasks/MANUELLE_AUFGABEN.md (T083).
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md §4.1–4.3,
--   Alt-Spec tasks/_eingefroren/T024-task-datenmodell.md (Geister-Welt-veraltet),
--   auf die belege-Welt portiert (CLAUDE.md §3.6/§3.7).
--
-- ===========================================================================
-- RLS-ENTSCHEIDUNG: KEINE Tenant-RLS auf diesen drei Tabellen (bewusste,
-- begründete Abweichung von CLAUDE.md §5.5).
-- ---------------------------------------------------------------------------
-- Alle bisherigen Tabellen (belege, chat_*, …) sind tenant-isoliert per Policy
-- `tenant_id = current_tenant_id()`, wobei das Backend pro Request GENAU EINEN
-- aktiven Tenant via `app.current_tenant` setzt (withTenant, core/db/tenant.ts).
--
-- `tasks` ist strukturell anders: Ein Mitarbeiter sieht "alle meine Aufgaben
-- über alle Mandanten hinweg" (Dashboard-Tabs Meine/Team/Erledigt). Es gibt
-- KEINEN einzelnen aktiven Tenant — eine tenant-scoped Policy würde das
-- Dashboard unmöglich machen. Eine user-basierte Policy hätte zudem kein
-- GUC-Backing (der Request-Pfad setzt `app.current_user_id` NICHT).
--
-- Daher: keine RLS. Es sind INTERNE Staff-Arbeitsdaten (kein Endkunden-PII-
-- Isolations-Scope; Steve + Andreas betreuen ohnehin alle Mandanten, das
-- "Team"-Tab zeigt absichtlich fremde Aufgaben). `tenant_id` ist nur ein
-- optionaler Verweis ("betrifft Mandant X"), keine Sicherheitsgrenze.
-- Zugriffsschutz liegt in der App-Schicht (T081): nur authentifizierte
-- Staff-Session (JWT pp_auth) erreicht die Endpoints; Schreibaktionen per
-- Rollen-Gate; "Meine"-View via assigned_to-Filter.
--
-- Tabellen-GRANTs sind hier NICHT nötig: setup-app-role.sql konfiguriert
-- `ALTER DEFAULT PRIVILEGES`, künftige Tabellen bekommen gastro_app-Rechte
-- automatisch (Muster wie 124/125, dort ebenfalls keine Tabellen-GRANTs).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Optionaler Mandanten-Verweis ("betrifft Mandant X"). NULL = globale/interne
  -- Aufgabe (z. B. aus MANUELLE_AUFGABEN.md). ON DELETE SET NULL: ein gelöschter
  -- Tenant entwertet die Aufgabe nicht, der Verweis fällt nur weg.
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,

  type            VARCHAR(50)  NOT NULL,          -- z. B. 'beleg_pruefen', 'onboarding', 'manuelle_aufgabe', 'sonstige'
  title           VARCHAR(200) NOT NULL,
  description     TEXT,

  -- Lose Verknüpfung zu einer Entität (z. B. Beleg-Vorschau bei 'beleg_pruefen').
  -- BEWUSST KEIN FK (Muster wie chat_sessions.trigger_reference_id): die
  -- referenzierte Entität darf unabhängig gelöscht werden.
  reference_type  VARCHAR(50),
  reference_id    UUID,

  status          VARCHAR(20)  NOT NULL DEFAULT 'offen'
                  CHECK (status IN ('offen','in_arbeit','pausiert','erledigt','verworfen')),
  priority        VARCHAR(10)  NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('niedrig','normal','hoch','kritisch')),

  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,  -- wer ist dran (Mitarbeiter)
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,  -- wer hat angelegt (GF/Management/System)

  claimed_at      TIMESTAMPTZ,
  due_at          TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Meine offenen Aufgaben": schneller Lookup nach Bearbeiter, nur aktive Stati.
CREATE INDEX idx_tasks_assigned_open ON tasks (assigned_to)
  WHERE status NOT IN ('erledigt','verworfen');
-- Listen-/Sortier-Pfad (Default-Sortierung nach Fälligkeit, gefiltert nach Status/Prio).
CREATE INDEX idx_tasks_status_priority ON tasks (status, priority, due_at);
-- "Aufgaben rund um diesen Mandanten" (TenantDetail).
CREATE INDEX idx_tasks_tenant ON tasks (tenant_id);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- task_collaborators ("Helfer einladen")
-- ---------------------------------------------------------------------------
CREATE TABLE task_collaborators (
  task_id   UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

-- ---------------------------------------------------------------------------
-- task_activity_log (Aktivitäts-Historie pro Aufgabe)
-- ---------------------------------------------------------------------------
CREATE TABLE task_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor       UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = System (Auto-Trigger)
  action      VARCHAR(50) NOT NULL,                          -- 'created','claimed','status_changed','commented',…
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_activity_log_task ON task_activity_log (task_id, created_at);
