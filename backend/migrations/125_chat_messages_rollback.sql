-- 125_chat_messages_rollback.sql — Rollback zu 125_chat_messages.sql (T069).

DROP POLICY IF EXISTS chat_messages_tenant_isolation ON chat_messages;
DROP TABLE IF EXISTS chat_messages;
