-- 125_chat_messages.sql
-- T069 / Build-out Phase C — Web-Chat-Widget: Chat-Nachrichten.
--
-- Ein chat_messages-Record = eine Nachricht in einem Web-Chat-Thread (eine
-- chat_sessions). Drei Absender-Typen: 'customer' (Wirt, via Magic-Link-Token),
-- 'staff' (ProzessPilot-Mitarbeiter, via Discord-Auth) und 'system'. Beleg-Fotos
-- (Eingangskanal) werden in T070 über beleg_id verknüpft (Brücke in die belege-Welt).
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md §2.3/§3.1/§8
--   — auf die belege-Welt portiert.
--
-- RLS: Standard-Tenant-Isolation (Muster wie 124_chat_sessions). KEINE eigene
-- SECURITY-DEFINER-Funktion nötig — der Wirt-Zugriff läuft über den Token-Lookup
-- aus 124 (get_chat_session_by_token) → danach normaler RLS-Write/Read unter
-- gesetztem app.current_tenant.

CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Absender. sender_user_id ist NUR bei 'staff' gesetzt (FK auf die reale
  -- Discord-OAuth-users-Tabelle, 020_users_auth); bei 'customer'/'system' NULL.
  sender_type     VARCHAR(20) NOT NULL CHECK (sender_type IN ('customer','staff','system')),
  sender_user_id  UUID REFERENCES users(id),

  -- Inhalt: Text ODER ein verknüpfter Beleg (Foto-Upload, gesetzt in T070).
  body            TEXT,
  beleg_id        UUID REFERENCES belege(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ,

  -- Eine Nachricht trägt entweder Text oder einen Beleg (oder beides).
  CONSTRAINT chat_messages_body_or_beleg CHECK (body IS NOT NULL OR beleg_id IS NOT NULL)
);

CREATE INDEX idx_chat_messages_session ON chat_messages (session_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY chat_messages_tenant_isolation ON chat_messages
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
