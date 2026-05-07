-- =============================================================================
-- Migration 014 — M09 Lieferanten-Kommunikation
-- Tabellen für automatische Lieferanten-Kommunikation
-- =============================================================================

-- ── communications (Kommunikations-Log) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS communications (
  communication_id   TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL,
  receipt_id         TEXT,
  expected_id        TEXT,
  channel            TEXT NOT NULL DEFAULT 'email',
  direction          TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  template           TEXT,
  to_address         TEXT,
  from_address       TEXT,
  subject            TEXT,
  reference_id       TEXT,
  body_text          TEXT,
  body_html          TEXT,
  status             TEXT NOT NULL,   -- 'sent','mock_sent','delivered','bounced','reply_received'
  external_id        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_reference ON communications (reference_id);
CREATE INDEX IF NOT EXISTS idx_comm_customer ON communications (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_receipt ON communications (receipt_id);

-- ── supplier_contacts (Lieferanten-Stammdaten) ───────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_contacts (
  contact_id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  customer_id      TEXT NOT NULL,
  supplier_name    TEXT NOT NULL,
  contact_email    TEXT,
  contact_phone    TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, supplier_name)
);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_customer ON supplier_contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_name ON supplier_contacts (customer_id, lower(supplier_name));

-- ── expected_receipts (Erwartete Belege — Cron-Erinnerungen) ────────────────
CREATE TABLE IF NOT EXISTS expected_receipts (
  expected_id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  customer_id        TEXT NOT NULL,
  supplier_name      TEXT NOT NULL,
  cadence            TEXT NOT NULL DEFAULT 'monthly',  -- 'monthly', 'quarterly'
  expected_day       INT,                              -- z. B. 5 (5. eines Monats)
  amount_min         NUMERIC,
  amount_max         NUMERIC,
  remind_after_days  INT NOT NULL DEFAULT 5,
  active             BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_expected_receipts_customer ON expected_receipts (customer_id, active);
