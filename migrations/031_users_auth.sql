-- =============================================================================
-- Migration 031 — M14: Users + Auth
-- Echte Authentifizierung (JWT + Refresh-Token), granulare Permissions,
-- Replay-Detection per Token-Familie, Auth-Audit-Log.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Users
-- DECISION: tenant_id ist UUID (nicht TEXT wie in M14-Spec), weil
-- tenants.id im Repo bereits UUID ist (Migration 003).
-- DECISION: users.id ist TEXT mit Prefix "usr_" + ULID-26-Zeichen.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                   TEXT PRIMARY KEY,
    tenant_id            UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email                TEXT NOT NULL,
    email_lower          TEXT NOT NULL,
    display_name         TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    password_must_change BOOLEAN NOT NULL DEFAULT false,
    permissions          JSONB NOT NULL DEFAULT '[]'::jsonb,
    preset               TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    last_login_at        TIMESTAMPTZ,
    failed_attempts      INTEGER NOT NULL DEFAULT 0,
    locked_until         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Eindeutige Email pro Tenant; für super_admins (tenant_id NULL) global eindeutig.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email
    ON users (COALESCE(tenant_id::text, ''), email_lower);

CREATE INDEX IF NOT EXISTS idx_users_tenant
    ON users (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email_lower);

-- Row-Level-Security: User sehen nur Tenant-eigene User, super_admin (tenant_id NULL)
-- ist global sichtbar. Wenn pp.tenant_id nicht gesetzt ist, sind nur super_admins
-- sichtbar — Login-Handler arbeitet als Superuser (bypass RLS).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
    USING (
        tenant_id::text = current_setting('pp.tenant_id', true)
        OR tenant_id IS NULL
    );

-- ─────────────────────────────────────────────────────────────────────
-- Refresh-Tokens (revocable Sessions)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL,
    family_id     TEXT NOT NULL,
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    revoke_reason TEXT,
    user_agent    TEXT,
    ip_address    INET
);

CREATE INDEX IF NOT EXISTS idx_refresh_user
    ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_token
    ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_family
    ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expiring
    ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Auth-Audit (separat von audit_log, weil hochfrequent)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_events (
    id              TEXT PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    email_attempted TEXT,
    ip_address      INET,
    user_agent      TEXT,
    details         JSONB
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_time
    ON auth_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_failed
    ON auth_events (occurred_at DESC) WHERE event_type = 'login_failed';
CREATE INDEX IF NOT EXISTS idx_auth_events_tenant_time
    ON auth_events (tenant_id, occurred_at DESC);
