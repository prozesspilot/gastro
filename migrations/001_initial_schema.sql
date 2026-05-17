-- =============================================================================
-- D2 · Migration 001 — Initiales Schema
-- ProzessPilot — Buchhaltungsautomation
-- =============================================================================

-- pgcrypto für AES-256-GCM-Verschlüsselung von PII-Feldern
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Tabelle: tenants
-- Jeder Mandant (Steuerberatungskanzlei oder Endkunde) hat einen Eintrag.
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,          -- URL-sicherer Bezeichner, z. B. "mustermann-gmbh"
  name        TEXT        NOT NULL,                 -- Anzeigename
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tabelle: customers
-- Kundenstammdaten pro Mandant; PII-Felder AES-256-verschlüsselt (pgcrypto).
-- Entschlüsselung erfolgt im Applikations-Layer mit PP_PGCRYPTO_KEY.
-- =============================================================================
CREATE TABLE IF NOT EXISTS customers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Verschlüsselte PII-Felder (Wert: pgp_sym_encrypt(plaintext, key))
  name_enc        BYTEA       NOT NULL,             -- Kundenname
  email_enc       BYTEA,                            -- E-Mail (optional)
  tax_number_enc  BYTEA,                            -- Steuernummer / USt-IdNr.

  -- Nicht-sensitive Metadaten
  external_id     TEXT,                             -- z. B. DATEV-Kundennummer
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, external_id)
);

-- =============================================================================
-- Tabelle: document_inbox
-- Eingehende Belege (PDF, Bild) nach Upload in MinIO.
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_inbox (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,

  -- Speicherort
  storage_key     TEXT        NOT NULL,             -- MinIO Object-Key
  original_name   TEXT        NOT NULL,             -- Originaldateiname
  content_type    TEXT        NOT NULL DEFAULT 'application/pdf',
  size_bytes      BIGINT      NOT NULL DEFAULT 0,

  -- Verarbeitungsstatus
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message   TEXT,

  -- Routing-Info (wird durch D9 befüllt)
  routing_tag     TEXT,

  -- Zeitstempel
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tabelle: routing_jobs
-- Aufträge für den Routing-Service (D9) und n8n-Workflows (D7).
-- =============================================================================
CREATE TABLE IF NOT EXISTS routing_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id     UUID        REFERENCES document_inbox(id) ON DELETE CASCADE,

  -- Job-Status
  status          TEXT        NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'done', 'failed', 'dead')),
  attempts        INT         NOT NULL DEFAULT 0,
  max_attempts    INT         NOT NULL DEFAULT 3,
  error_message   TEXT,

  -- Nutzlast für n8n / Worker
  payload         JSONB       NOT NULL DEFAULT '{}',
  result          JSONB,

  -- Zeitplanung: Wann soll der Job frühestens laufen?
  run_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tabelle: audit_log
-- Unveränderliches Protokoll aller relevanten Aktionen (Compliance).
-- Kein FK auf tenants — Einträge bleiben auch nach Mandanten-Löschung erhalten.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  tenant_id   UUID        NOT NULL,                 -- kein FK (bewusst)
  actor       TEXT        NOT NULL,                 -- 'system' | 'n8n' | User-ID
  action      TEXT        NOT NULL,                 -- z. B. 'document.received'
  resource    TEXT,                                 -- z. B. 'document_inbox:uuid'
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indizes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_customers_tenant
  ON customers (tenant_id);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_active
  ON customers (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_doc_inbox_tenant
  ON document_inbox (tenant_id);

CREATE INDEX IF NOT EXISTS idx_doc_inbox_tenant_status
  ON document_inbox (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_doc_inbox_customer
  ON document_inbox (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_routing_jobs_tenant
  ON routing_jobs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_routing_jobs_queue
  ON routing_jobs (tenant_id, status, run_at)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time
  ON audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log (action, created_at DESC);

-- =============================================================================
-- Trigger-Funktion: updated_at automatisch setzen
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER tg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER tg_doc_inbox_updated_at
  BEFORE UPDATE ON document_inbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER tg_routing_jobs_updated_at
  BEFORE UPDATE ON routing_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
