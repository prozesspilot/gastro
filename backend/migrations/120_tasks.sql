-- 120_tasks.sql
-- Mitarbeiter-Task-System: Tasks, Kollaboratoren, Aktivitäts-Log.
--
-- Diese Tabellen bilden das Rückgrat des Task-Dashboards in der Mitarbeiter-
-- Webapp (admin.prozesspilot.net). Mitarbeiter können Tasks übernehmen, an
-- andere zuweisen, Helfer einladen und den Fortschritt per Activity-Log
-- verfolgen.
--
-- Spec-Referenz:
--   Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md §4.1–4.3
--   Modulkonzept/Konzeptentwicklung/_audit/REPORT-2026-05-26.md F02
--
-- RLS-Pattern: analog 060_audit_log.sql + 040_kasse.sql.
--   - `tasks` hat tenant_id-Spalte → direkte RLS-Policy.
--   - `task_collaborators` + `task_activity_log` erhalten EIGENE tenant_id-
--     Spalte (statt JOIN über task_id). Begründung:
--     (a) RLS-Policy kann ohne Sub-Select direkt auf der Tabelle greifen.
--     (b) Kein SECURITY DEFINER-Trick nötig.
--     (c) Slight Denormalisierung, aber Wert ist immer aus tasks.tenant_id
--         ableitbar — Trigger hält es konsistent.
--     DECISION: tenant_id in Subtabellen als explizite Spalte (Denormalisierung
--     erlaubt für RLS-Effizienz, Konsistenz per FK + Trigger).

-- ---------------------------------------------------------------------------
-- tasks — ein Arbeitselement für einen Mitarbeiter oder das gesamte Team
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant-Bezug (nullable: globale Tasks ohne Tenant-Kontext, z.B. Reseller-Report)
  tenant_id             UUID REFERENCES tenants(id) ON DELETE SET NULL,

  -- Task-Klassifikation
  type                  VARCHAR(50) NOT NULL,
                        -- 'beleg_pruefen' / 'datev_fehler' / 'onboarding' /
                        -- 'reauth_lexoffice' / 'reauth_sumup' / 'upgrade_vorschlag' /
                        -- 'steuerberater_mail' / 'chat_wartezeit' / 'mahnung' /
                        -- 'provisions_report' / 'ci_reparieren' / 'sonstige'
  title                 VARCHAR(200) NOT NULL,
  description           TEXT,

  -- Verknüpfung zu einer Entität (z.B. Beleg, Tenant, Rechnung)
  reference_type        VARCHAR(50),   -- 'beleg' / 'tenant' / 'invoice' / 'kasse_transaction' / NULL
  reference_id          UUID,          -- FK-lose Referenz (Tabelle wechselt je nach reference_type)

  -- Status + Priorität
  status                VARCHAR(30)     NOT NULL DEFAULT 'offen'
                        CHECK (status IN ('offen','in_bearbeitung','wartet_auf_kunde','pausiert','erledigt','verworfen')),
  priority              VARCHAR(10)     NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('niedrig','normal','hoch','kritisch')),

  -- Zuweisung
  assigned_to           UUID            REFERENCES users(id) ON DELETE SET NULL,
  claimed_at            TIMESTAMPTZ,

  -- Zeitplanung
  due_at                TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,

  -- Discord-Verknüpfung (wenn Task im Discord-Thread besprochen)
  discord_message_id    VARCHAR(25),     -- Discord Snowflake-ID

  created_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Kern-Indizes: Queries nach Tenant + Status, nach Zuweisung, nach Priorität/Fälligkeit
CREATE INDEX idx_tasks_tenant_status ON tasks (tenant_id, status, due_at)
  WHERE status NOT IN ('erledigt', 'verworfen');

CREATE INDEX idx_tasks_assigned_to ON tasks (assigned_to, status, due_at)
  WHERE assigned_to IS NOT NULL AND status NOT IN ('erledigt', 'verworfen');

CREATE INDEX idx_tasks_status_priority ON tasks (status, priority, due_at)
  WHERE status NOT IN ('erledigt', 'verworfen');

CREATE INDEX idx_tasks_reference ON tasks (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- RLS: Mitarbeiter sehen nur Tasks in ihrem aktuellen Tenant-Context (oder globale Tasks).
-- Globale Tasks (tenant_id IS NULL) sind für alle sichtbar.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY tasks_tenant_isolation ON tasks
  FOR ALL
  USING (
    is_rls_bypassed()
    OR tenant_id IS NULL
    OR tenant_id = current_tenant_id()
  )
  WITH CHECK (
    is_rls_bypassed()
    OR tenant_id IS NULL
    OR tenant_id = current_tenant_id()
  );

-- ---------------------------------------------------------------------------
-- task_collaborators — "Helfer einladen": mehrere Mitarbeiter pro Task
-- ---------------------------------------------------------------------------
-- DECISION: tenant_id als explizite Spalte (Denormalisierung für RLS-Effizienz).
-- Wert wird per Trigger aus tasks.tenant_id gefüllt — nie direkt schreiben.
CREATE TABLE task_collaborators (
  task_id               UUID            NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id               UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id             UUID            REFERENCES tenants(id) ON DELETE SET NULL,  -- denorm, via Trigger

  added_by              UUID            REFERENCES users(id) ON DELETE SET NULL,
  added_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

  PRIMARY KEY (task_id, user_id)
);

-- Trigger: tenant_id aus verknüpftem task lesen, damit RLS ohne Sub-Select arbeiten kann
CREATE OR REPLACE FUNCTION task_collaborators_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT tenant_id INTO NEW.tenant_id
  FROM tasks
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_collaborators_before_insert
BEFORE INSERT ON task_collaborators
FOR EACH ROW EXECUTE FUNCTION task_collaborators_set_tenant_id();

CREATE INDEX idx_task_collaborators_user ON task_collaborators (user_id, task_id);
CREATE INDEX idx_task_collaborators_tenant ON task_collaborators (tenant_id);

ALTER TABLE task_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_collaborators FORCE ROW LEVEL SECURITY;

CREATE POLICY task_collaborators_tenant_isolation ON task_collaborators
  FOR ALL
  USING (
    is_rls_bypassed()
    OR tenant_id IS NULL
    OR tenant_id = current_tenant_id()
  )
  WITH CHECK (
    is_rls_bypassed()
    OR tenant_id IS NULL
    OR tenant_id = current_tenant_id()
  );

-- ---------------------------------------------------------------------------
-- task_activity_log — unveränderlicher Aktivitäts-Log pro Task
-- ---------------------------------------------------------------------------
-- DECISION: tenant_id als explizite Spalte (Denormalisierung für RLS-Effizienz).
-- Wert wird per Trigger aus tasks.tenant_id gefüllt.
CREATE TABLE task_activity_log (
  id                    BIGSERIAL       PRIMARY KEY,  -- monoton für Reihenfolge
  task_id               UUID            NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id             UUID            REFERENCES tenants(id) ON DELETE SET NULL,  -- denorm, via Trigger

  -- Wer hat die Aktion ausgelöst? NULL = System
  actor_user_id         UUID            REFERENCES users(id) ON DELETE SET NULL,

  -- Was ist passiert?
  event_type            VARCHAR(60)     NOT NULL,
                        -- 'created' / 'claimed' / 'unclaimed' / 'assigned' / 'status_changed' /
                        -- 'commented' / 'priority_changed' / 'collaborator_added' /
                        -- 'collaborator_removed' / 'completed' / 'discarded' / 'reopened'

  payload               JSONB           NOT NULL DEFAULT '{}'::jsonb,  -- kontextspezifische Details

  occurred_at           TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Trigger: tenant_id aus verknüpftem task lesen
CREATE OR REPLACE FUNCTION task_activity_log_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT tenant_id INTO NEW.tenant_id
  FROM tasks
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_activity_log_before_insert
BEFORE INSERT ON task_activity_log
FOR EACH ROW EXECUTE FUNCTION task_activity_log_set_tenant_id();

CREATE INDEX idx_task_activity_log_task ON task_activity_log (task_id, occurred_at DESC);
CREATE INDEX idx_task_activity_log_tenant ON task_activity_log (tenant_id, occurred_at DESC);
CREATE INDEX idx_task_activity_log_actor ON task_activity_log (actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_log FORCE ROW LEVEL SECURITY;

CREATE POLICY task_activity_log_tenant_isolation ON task_activity_log
  FOR ALL
  USING (
    is_rls_bypassed()
    OR tenant_id IS NULL
    OR tenant_id = current_tenant_id()
  )
  WITH CHECK (
    is_rls_bypassed()
    OR tenant_id IS NULL
    OR tenant_id = current_tenant_id()
  );
