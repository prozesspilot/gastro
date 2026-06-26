-- 126_chat_close_rating.sql
-- T075 / Build-out Phase C — Web-Chat: Chat beenden + Sterne-Bewertung.
--
-- Erweitert chat_sessions (124) um den Abschluss-Lebenszyklus:
--   * closed_at / closed_by  — wer hat den Chat beendet (Wirt oder Mitarbeiter)?
--   * rating / rating_comment / rated_at — kundenseitige Bewertung (1–5 Sterne +
--     optionaler Freitext). Die Bewertung wird zusätzlich als audit_log-Event
--     (chat_session.rated, nur die Zahl — KEIN Kommentar/PII) protokolliert.
--
-- Rückwärts-kompatibel: alle neuen Spalten sind NULL-bar (bestehende Sessions
-- bleiben gültig). Status-FSM (124) kennt 'closed' bereits.
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md (Support-
--   Lifecycle), auf die belege-Welt portiert (CLAUDE.md §3.6/§3.7).

-- ---------------------------------------------------------------------------
-- 1) Neue Spalten
-- ---------------------------------------------------------------------------
ALTER TABLE chat_sessions
  ADD COLUMN closed_at      TIMESTAMPTZ,
  ADD COLUMN closed_by      VARCHAR(20) CHECK (closed_by IN ('customer','staff','system')),
  ADD COLUMN rating         SMALLINT    CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN rating_comment TEXT,
  ADD COLUMN rated_at       TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2) get_chat_session_by_token() um die neuen Spalten erweitern.
--    Der RETURNS-TABLE-Typ ändert sich → CREATE OR REPLACE genügt nicht, daher
--    DROP + CREATE. Sicherheitsmodell unverändert (SECURITY DEFINER + LOCAL-Bypass,
--    Muster wie 124). Das Widget liest darüber den Bewertungs-/Schließ-Status.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_chat_session_by_token(text);

CREATE FUNCTION get_chat_session_by_token(p_token text)
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
  last_activity_at      timestamptz,
  closed_at             timestamptz,
  closed_by             text,
  rating                smallint,
  rating_comment        text,
  rated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
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
           s.last_activity_at,
           s.closed_at,
           s.closed_by::text,
           s.rating,
           s.rating_comment,
           s.rated_at
      FROM chat_sessions s
     WHERE s.token = p_token;

  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION get_chat_session_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_chat_session_by_token(text) TO gastro_app;
