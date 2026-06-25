-- 124_chat_sessions.sql
-- T068 / Build-out Phase C — Web-Chat-Widget: Chat-Session-Tracking (Magic-Link).
--
-- Ein chat_sessions-Record = ein DAUERHAFTER Support-/Eingangs-Kanal für EINEN
-- Tenant (Wirt). Magic-Link-basiert, KEIN Login: der `token` IST die Credential.
-- Anders als die einmalige Onboarding-Session (122) ist der Chat ein dauerhafter
-- Kanal (der Wirt schickt monatlich Belege) → `expires_at` ist NULL-bar
-- (NULL = unbefristet, GF-Entscheidung 2026-06-24), Widerruf über status='revoked'.
-- Genau EIN aktiver Link pro Mandant (partieller Unique-Index).
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md §2.2, §4
--   — auf die belege-Welt portiert (CLAUDE.md §3.6/§3.7). chat_messages folgt in T069.
--
-- RLS:
--   Tenant-Isolation wie überall: is_rls_bypassed() OR tenant_id = current_tenant_id().
--   Der öffentliche Chat-Lookup kennt den Tenant aber NOCH NICHT (er hat nur den
--   global-eindeutigen Token). Cross-Tenant-Lookup läuft daher über die SECURITY-
--   DEFINER-Funktion get_chat_session_by_token() (Muster wie 122_onboarding_sessions /
--   121_list_tenants_fn) — eng begrenzt auf genau diesen Token-Lookup, kein
--   genereller Bypass.

-- ---------------------------------------------------------------------------
-- chat_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE chat_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Magic-Link-Credential: 32 Zeichen Base64URL (192 Bit Entropie), global eindeutig.
  token                 VARCHAR(64) UNIQUE NOT NULL,

  -- Status-FSM. 'active' = nutzbar; 'revoked' = vom Staff/System deaktiviert;
  -- 'closed' = vom Lifecycle beendet.
  status                VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','revoked','closed')),

  -- Auslöser-Kontext (trigger-getriebene Link-Ausgabe): woraus entstand die Session?
  -- z. B. 'staff_manual', 'beleg_review', 'reminder'. trigger_reference_id = lose
  -- Referenz (z. B. belege.id) — bewusst KEIN FK (ein referenzierter Beleg darf
  -- unabhängig gelöscht werden).
  trigger_type          VARCHAR(40),
  trigger_reference_id  UUID,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = unbefristet (dauerhafter Kanal). Ein gesetztes expires_at < now() gilt
  -- als abgelaufen (resolveChatSession → 410).
  expires_at            TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  last_activity_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_tenant ON chat_sessions (tenant_id);

-- Genau EIN aktiver Magic-Link pro Mandant (GF-Entscheidung): widerrufene/
-- geschlossene Sessions bleiben als Historie liegen, aber nur eine ist aktiv.
CREATE UNIQUE INDEX uq_chat_sessions_active_tenant
  ON chat_sessions (tenant_id) WHERE status = 'active';

-- RLS: Standard-Tenant-Isolation. Cross-Tenant-Lookup nur via SECURITY-DEFINER-Fn (s. u.).
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY chat_sessions_tenant_isolation ON chat_sessions
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- get_chat_session_by_token(p_token)
-- SECURITY DEFINER: Cross-Tenant-Lookup einer Chat-Session über den Magic-Link-
-- Token. Der Token (192 Bit) IST die Auth — der öffentliche Chat kennt den Tenant
-- erst NACH dem Lookup. Muster + Sicherheitsmodell exakt wie
-- get_onboarding_session_by_token (122) / 121_list_tenants_fn.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_chat_session_by_token(p_token text)
RETURNS TABLE (
  id                    uuid,
  tenant_id             uuid,
  token                 text,
  status                text,
  trigger_type          text,
  trigger_reference_id  uuid,
  created_at            timestamptz,
  expires_at            timestamptz,
  revoked_at            timestamptz,
  last_activity_at      timestamptz
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
           s.trigger_type::text,
           s.trigger_reference_id,
           s.created_at,
           s.expires_at,
           s.revoked_at,
           s.last_activity_at
      FROM chat_sessions s
     WHERE s.token = p_token;

  -- Defense-in-Depth: Bypass am Funktionsende explizit zurücknehmen.
  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION get_chat_session_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_chat_session_by_token(text) TO gastro_app;
