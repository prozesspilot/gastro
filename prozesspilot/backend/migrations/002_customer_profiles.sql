-- =============================================================================
-- Migration 002 — Customer-Profile
-- Modul-Konfiguration und Routing-Regeln pro Kunde, mit Versionshistorie.
-- =============================================================================

-- Aktuelles Profil pro Kunde (1:1 zu customers).
CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id     UUID        PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  profile_version INT         NOT NULL DEFAULT 1,
  modules_enabled JSONB       NOT NULL DEFAULT '[]'::jsonb,
  integrations    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  routing         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  custom          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- Versionshistorie — bei jedem Update ein Snapshot der vorherigen Version.
CREATE TABLE IF NOT EXISTS customer_profile_history (
  history_id      BIGSERIAL   PRIMARY KEY,
  customer_id     UUID        NOT NULL REFERENCES customers(id),
  profile_version INT         NOT NULL,
  snapshot        JSONB       NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary  TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_profile_history_customer
  ON customer_profile_history (customer_id, changed_at DESC);
