-- 061_auth_audit_log_insert_fn.sql
-- M14 — SECURITY DEFINER Hilfsfunktion für auth_audit_log-Inserts.
--
-- Hintergrund:
--   auth_audit_log hat RLS mit INSERT-Policy `WITH CHECK (is_rls_bypassed())`.
--   is_rls_bypassed() gibt nur dann true zurück, wenn die DB-Rolle exakt
--   'gastro_owner' ist UND app.bypass_rls = 'on' gesetzt ist.
--   Der normale App-User (gastro_app) erfüllt diese Bedingung nicht → jeder
--   direkte INSERT aus dem App-Pool schlägt in Production fehl.
--
-- Lösung (Option B — SECURITY DEFINER):
--   Diese Funktion läuft mit den Rechten des Definers (gastro_owner), daher
--   kann sie die RLS-Policy umgehen. Der App-User ruft die Funktion per
--   SELECT auf — nie direkt die Tabelle beschreiben.
--
-- Sicherheits-Modell:
--   - Nur gastro_app darf EXECUTE aufrufen (kein PUBLIC-Grant).
--   - search_path ist explizit gesetzt (verhindert Search-Path-Injection).
--   - Alle Parameter sind typisiert — keine dynamische SQL.
--   - Die Append-Only-Trigger auf auth_audit_log bleiben weiterhin aktiv
--     und greifen auch für SECURITY DEFINER Aufrufe.

CREATE OR REPLACE FUNCTION insert_auth_audit_log(
  p_user_id    uuid,
  p_event_type text,
  p_ip_address text,
  p_user_agent text,
  p_metadata   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO auth_audit_log (user_id, event_type, ip_address, user_agent, metadata)
  VALUES (
    p_user_id,
    p_event_type,
    p_ip_address::inet,
    p_user_agent,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

-- Nur der App-User darf diese Funktion aufrufen.
-- REVOKE zuerst, damit kein PUBLIC-Grant aus vorherigen Versionen übrig bleibt.
REVOKE ALL ON FUNCTION insert_auth_audit_log(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_auth_audit_log(uuid, text, text, text, jsonb) TO gastro_app;

-- Rollback-Hinweis (für _rollback.sql falls nötig):
-- DROP FUNCTION IF EXISTS insert_auth_audit_log(uuid, text, text, text, jsonb);
