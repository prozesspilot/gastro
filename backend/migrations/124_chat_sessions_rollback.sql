-- 124_chat_sessions_rollback.sql — Rollback zu 124_chat_sessions.sql (T068).
-- Reihenfolge: Funktion → Policy → Tabelle (Indizes fallen mit der Tabelle).

DROP FUNCTION IF EXISTS get_chat_session_by_token(text);
DROP POLICY IF EXISTS chat_sessions_tenant_isolation ON chat_sessions;
DROP TABLE IF EXISTS chat_sessions;
