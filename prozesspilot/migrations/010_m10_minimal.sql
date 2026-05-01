-- =============================================================================
-- Migration 010 · M10 (WhatsApp Eingang) — minimales Schema
-- =============================================================================
-- Pragmatischer Quick-Win, KEIN vollständiges D2.
-- Legt nur die Tabellen an, die M10 zwingend braucht:
--   - customer_profiles    (Resolver: phone_number_id → customer_id)
--   - customer_credentials (wa_access_token verschlüsselt)
--   - receipts             (Idempotenz-Lookup nach file_sha256)
--
-- Bewusste Vereinfachungen:
--   - customer_id ist TEXT, NICHT FK auf customers(id) (UUID).
--     Die existierende customers-Tabelle aus 001_initial_schema.sql nutzt
--     ein anderes ID-Schema (tenant_id + UUID); Foundation D2 wird das
--     später konsolidieren. Bis dahin laufen beide Schemata parallel.
--   - Kein RLS, kein Tenant-Scoping (Sprint-1-MVP).
--   - pgcrypto ist bereits aus 001 aktiv → ciphertext BYTEA reicht hier.
-- =============================================================================

-- =============================================================================
-- Tabelle: customer_profiles
-- Quelle für M10-Routing (integrations.input_whatsapp.{phone_number_id, ...}).
-- =============================================================================
CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id     TEXT        PRIMARY KEY,
  integrations    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup-Index für customer-resolver.ts:
--   WHERE integrations->'input_whatsapp'->>'phone_number_id' = $1
CREATE INDEX IF NOT EXISTS idx_customer_profiles_wa_phone_number_id
  ON customer_profiles ((integrations->'input_whatsapp'->>'phone_number_id'));

-- updated_at automatisch pflegen (Trigger-Funktion existiert aus 001)
CREATE OR REPLACE TRIGGER tg_customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Tabelle: customer_credentials
-- Verschlüsselte Tokens (wa_access_token für M10, später weitere kinds).
-- =============================================================================
CREATE TABLE IF NOT EXISTS customer_credentials (
  credential_id   TEXT        PRIMARY KEY,
  customer_id     TEXT        NOT NULL,
  kind            TEXT        NOT NULL,                       -- 'wa_access_token', 'lexoffice_api_key', ...
  ciphertext      BYTEA       NOT NULL,                       -- pgp_sym_encrypt(plaintext, $key)
  meta            JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- { phone_number_id, graph_api_version, ... }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
);

-- credential.service.ts: WHERE customer_id=$1 AND kind=$2 ORDER BY rotated_at DESC NULLS LAST, created_at DESC
CREATE INDEX IF NOT EXISTS idx_customer_credentials_lookup
  ON customer_credentials (customer_id, kind, rotated_at DESC NULLS LAST, created_at DESC);

-- =============================================================================
-- Tabelle: receipts
-- Beleg-Stamm. M10 schreibt NICHT direkt rein, liest aber für Idempotenz.
-- =============================================================================
CREATE TABLE IF NOT EXISTS receipts (
  receipt_id        TEXT        PRIMARY KEY,                  -- z. B. ULID 01HVZ8X4M3...
  customer_id       TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'received',
  file_object_key   TEXT        NOT NULL,                     -- MinIO object key
  file_sha256       TEXT        NOT NULL,                     -- 64 Hex-Zeichen
  payload           JSONB       NOT NULL DEFAULT '{}'::jsonb, -- enthält file.{mime_type, size_bytes}
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, file_sha256)                            -- Idempotenz-Anker für M10 + WF-MASTER-RECEIPT
);

CREATE INDEX IF NOT EXISTS idx_receipts_customer_status
  ON receipts (customer_id, status);

CREATE OR REPLACE TRIGGER tg_receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
