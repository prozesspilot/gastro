-- 122_onboarding_sessions.sql
-- T016/Build-out Phase B — Onboarding-Wizard: Session-Tracking (Magic-Link).
--
-- Ein onboarding_sessions-Record = ein geführter Setup-Flow für EINEN neuen
-- Tenant (Wirt). Magic-Link-basiert, KEIN Login: der `token` IST die Credential.
-- Persistiert step_data, damit der Wirt den Wizard verlassen + später mit dem
-- gleichen Link fortsetzen kann (30 Tage gültig).
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/Onboarding_Wizard.md §5.1, §6.
--
-- RLS:
--   Tenant-Isolation wie überall: is_rls_bypassed() OR tenant_id = current_tenant_id().
--   Der öffentliche Wizard-Lookup kennt den Tenant aber NOCH NICHT (er hat nur den
--   global-eindeutigen Token). Cross-Tenant-Lookup läuft daher über die SECURITY-
--   DEFINER-Funktion get_onboarding_session_by_token() (Muster wie 121_list_tenants_fn) —
--   eng begrenzt auf genau diesen Token-Lookup, kein genereller Bypass. Schreibende
--   Wizard-Operationen setzen danach app.current_tenant aus der gefundenen Session
--   und laufen unter normaler RLS.

-- ---------------------------------------------------------------------------
-- onboarding_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE onboarding_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Magic-Link-Credential: 32 Zeichen Base64URL (192 Bit Entropie), global eindeutig.
  token                    VARCHAR(64) UNIQUE NOT NULL,

  -- Status-FSM
  status                   VARCHAR(30) NOT NULL DEFAULT 'started'
                           CHECK (status IN ('started','completed','abandoned','premium_handoff')),

  -- Fortschritt (7 Schritte laut Spec §2)
  current_step             INTEGER NOT NULL DEFAULT 1
                           CHECK (current_step BETWEEN 1 AND 7),

  -- Gespeicherte Antworten pro Schritt: { "1": {...}, "2": {...}, ... }
  step_data                JSONB NOT NULL DEFAULT '{}'::jsonb,

  premium_setup_requested  BOOLEAN NOT NULL DEFAULT false,

  -- Zeitstempel
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at               TIMESTAMPTZ NOT NULL,            -- Default-Logik (created_at + 30 Tage) im Backend
  completed_at             TIMESTAMPTZ,
  last_activity_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_sessions_tenant ON onboarding_sessions (tenant_id);

-- RLS: Standard-Tenant-Isolation. Cross-Tenant-Lookup nur via SECURITY-DEFINER-Fn (s. u.).
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_sessions_tenant_isolation ON onboarding_sessions
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- tenants: Wizard-Output-Spalten (Spec §5.2)
-- pos_system existiert bereits (010_tenants.sql). IF NOT EXISTS → idempotent /
-- rückwärts-kompatibel.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) NOT NULL DEFAULT 'pending'
  CHECK (onboarding_status IN ('pending','wizard_started','wizard_done','activated'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_premium BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS advisor_system VARCHAR(30);     -- 'lexware_office' / 'datev_csv' / 'sevdesk' / ...
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS input_channels VARCHAR(30)[];   -- ['whatsapp','email']
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS archive_provider VARCHAR(20);   -- 'google_drive' / 'dropbox' / 'pp_internal'

-- ---------------------------------------------------------------------------
-- get_onboarding_session_by_token(p_token)
-- SECURITY DEFINER: Cross-Tenant-Lookup einer Wizard-Session über den Magic-Link-
-- Token. Der Token (192 Bit) IST die Auth — der öffentliche Wizard kennt den
-- Tenant erst NACH dem Lookup. Muster + Sicherheitsmodell exakt wie
-- 121_list_tenants_fn.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_onboarding_session_by_token(p_token text)
RETURNS TABLE (
  id                       uuid,
  tenant_id                uuid,
  token                    text,
  status                   text,
  current_step             integer,
  step_data                jsonb,
  premium_setup_requested  boolean,
  created_at               timestamptz,
  expires_at               timestamptz,
  completed_at             timestamptz,
  last_activity_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Aktiviert is_rls_bypassed() nur in dieser DEFINER-Funktion (Owner-Rolle +
  -- app.bypass_rls=on). LOCAL → automatischer Reset am Transaktionsende.
  PERFORM set_config('app.bypass_rls', 'on', true);

  RETURN QUERY
    SELECT s.id,
           s.tenant_id,
           s.token::text,
           s.status::text,
           s.current_step,
           s.step_data,
           s.premium_setup_requested,
           s.created_at,
           s.expires_at,
           s.completed_at,
           s.last_activity_at
      FROM onboarding_sessions s
     WHERE s.token = p_token;

  -- Defense-in-Depth: Bypass am Funktionsende explizit zurücknehmen.
  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION get_onboarding_session_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_onboarding_session_by_token(text) TO gastro_app;
