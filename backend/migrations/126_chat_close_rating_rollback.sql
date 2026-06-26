-- 126_chat_close_rating_rollback.sql
-- Rollback zu 126_chat_close_rating.sql (T075).
-- Stellt die Funktions-Signatur aus 124 wieder her und entfernt die neuen Spalten.

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
  last_activity_at      timestamptz
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
           s.last_activity_at
      FROM chat_sessions s
     WHERE s.token = p_token;

  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION get_chat_session_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_chat_session_by_token(text) TO gastro_app;

ALTER TABLE chat_sessions
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS closed_by,
  DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS rating_comment,
  DROP COLUMN IF EXISTS rated_at;
