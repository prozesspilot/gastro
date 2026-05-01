-- 012 — Customer Profiles: fehlende Spalten ergänzen
--
-- 010_m10_minimal.sql hat customer_profiles bereits mit (customer_id TEXT,
-- integrations, created_at, updated_at) angelegt. 011 versuchte eine neue
-- Tabelle via CREATE TABLE IF NOT EXISTS — die fehlenden Spalten wurden dabei
-- nie hinzugefügt. Diese Migration holt das nach.

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS profile_version INT  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS modules_enabled JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS routing         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by      TEXT;

-- History-Tabelle (aus 011 — falls noch nicht vorhanden)
CREATE TABLE IF NOT EXISTS customer_profile_history (
  history_id      BIGSERIAL PRIMARY KEY,
  customer_id     TEXT      NOT NULL,
  profile_version INT       NOT NULL,
  snapshot        JSONB     NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary  TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_history_customer
  ON customer_profile_history (customer_id, changed_at DESC);
