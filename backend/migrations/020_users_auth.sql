-- 020_users_auth.sql
-- M14 — Mitarbeiter-Authentifizierung (ProzessPilot-internes Personal).
--
-- Endkunden (Wirte) haben KEINEN Account in dieser Tabelle — sie nutzen
-- Magic-Link-Tokens (siehe M14 Spec § 7). Hier liegen nur Mitarbeiter:
-- Geschäftsführer (Steve/Andreas), zukünftige Mitarbeiter, Support.
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md

-- ---------------------------------------------------------------------------
-- users — Mitarbeiter-Accounts (Discord-OAuth + Notfall-Login)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Discord-Identität (Standard-Login)
  discord_user_id                     VARCHAR(20) UNIQUE,
  discord_username                    VARCHAR(80),
  discord_avatar_url                  TEXT,
  discord_access_token_encrypted      BYTEA,
  discord_refresh_token_encrypted     BYTEA,
  discord_token_expires_at            TIMESTAMPTZ,

  -- Anzeige
  display_name                        VARCHAR(80) NOT NULL,

  -- Rolle (M14 § 6)
  role                                VARCHAR(30) NOT NULL
                                      CHECK (role IN ('geschaeftsfuehrer','mitarbeiter','support')),

  -- Notfall-Login (nur für role='geschaeftsfuehrer')
  emergency_email                     CITEXT,
  emergency_password_hash             VARCHAR(255),     -- Argon2id
  emergency_totp_secret               VARCHAR(60),      -- Base32-encoded TOTP-Secret
  emergency_backup_codes              JSONB,            -- 10 einmalig-verwendbare Codes (Hashes)

  -- Status
  active                              BOOLEAN NOT NULL DEFAULT true,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at                       TIMESTAMPTZ,
  last_login_method                   VARCHAR(20)
                                      CHECK (last_login_method IN ('discord','emergency') OR last_login_method IS NULL),
  last_login_ip                       INET,

  -- UI-Vorlieben
  preferences                         JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Konsistenz-Check: wer Notfall-Login hat, muss Geschäftsführer sein
  CONSTRAINT emergency_only_for_gf
    CHECK (emergency_email IS NULL OR role = 'geschaeftsfuehrer'),

  -- Email für Notfall-Login muss einzigartig sein (unique unter den Geschäftsführern)
  CONSTRAINT emergency_email_unique UNIQUE (emergency_email)
);

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_users_discord_id ON users (discord_user_id) WHERE active = true;
CREATE INDEX idx_users_active_role ON users (role) WHERE active = true;

-- users hat KEINE tenant_id (Mitarbeiter sehen alle Tenants per Rolle).
-- Kein RLS — Sichtbarkeit wird im Backend via Permission-Checks geregelt.

-- ---------------------------------------------------------------------------
-- auth_sessions — JWT-Session-Tracking für Revocation
-- ---------------------------------------------------------------------------
CREATE TABLE auth_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jwt_jti         VARCHAR(40) UNIQUE NOT NULL,
  login_method    VARCHAR(20) NOT NULL CHECK (login_method IN ('discord','emergency')),
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  revoke_reason   VARCHAR(50) CHECK (revoke_reason IN ('logout','admin_revoke','security_concern','expired') OR revoke_reason IS NULL)
);

CREATE INDEX idx_auth_sessions_jti ON auth_sessions (jwt_jti);
CREATE INDEX idx_auth_sessions_user ON auth_sessions (user_id, expires_at);
CREATE INDEX idx_auth_sessions_active ON auth_sessions (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- auth_audit_log — alle Auth-Events (Login, Logout, Failed, Emergency, ...)
--
-- Sicherheits-Modell:
--   - SELECT: Geschäftsführer dürfen alles sehen; jeder User darf seine
--             eigenen Events sehen. Reicht aus, weil andere Mitarbeiter-Rollen
--             keine fremden Login-IPs/User-Agents brauchen (Stalking-Schutz).
--   - INSERT: nur via Bypass (Auth-Backend nutzt Owner-Connection für
--             Auth-Audit, weil failed-Login-Events u. U. ohne authentifizierten
--             User-Context entstehen).
--   - UPDATE/DELETE: per Trigger geblockt — Append-Only wie audit_log.
-- ---------------------------------------------------------------------------
CREATE TABLE auth_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL bei login_failed_no_user
  event_type   VARCHAR(40) NOT NULL,                           -- 'login_success','login_failed','logout','emergency_login_success', ...
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_audit_user ON auth_audit_log (user_id, created_at DESC);
CREATE INDEX idx_auth_audit_event ON auth_audit_log (event_type, created_at DESC);

ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_log FORCE ROW LEVEL SECURITY;

-- Lesen: bypass ODER eigene Events ODER Rolle 'geschaeftsfuehrer'
-- (Rolle wird vom Backend per `set_config('app.user_role', 'geschaeftsfuehrer', true)` gesetzt)
CREATE POLICY auth_audit_log_select ON auth_audit_log
  FOR SELECT
  USING (
    is_rls_bypassed()
    OR (user_id IS NOT NULL AND user_id = current_user_id())
    OR coalesce(current_setting('app.user_role', true), '') = 'geschaeftsfuehrer'
  );

-- Schreiben: nur über Bypass (Backend nutzt Owner-Connection für Auth-Audit)
CREATE POLICY auth_audit_log_insert ON auth_audit_log
  FOR INSERT
  WITH CHECK (is_rls_bypassed());

-- Append-Only via Trigger (gleiches Pattern wie audit_log).
CREATE OR REPLACE FUNCTION auth_audit_log_block_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_audit_maintenance() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'auth_audit_log is append-only (event=%, user_id=%)',
    COALESCE(NEW.event_type, OLD.event_type),
    COALESCE(NEW.user_id::text, OLD.user_id::text);
END;
$$;

CREATE TRIGGER auth_audit_log_no_update
BEFORE UPDATE ON auth_audit_log
FOR EACH ROW EXECUTE FUNCTION auth_audit_log_block_mutations();

CREATE TRIGGER auth_audit_log_no_delete
BEFORE DELETE ON auth_audit_log
FOR EACH ROW EXECUTE FUNCTION auth_audit_log_block_mutations();
