-- =============================================================================
-- Migration 011 — M06 sevDesk Integration
-- Tabellen für Account-Mapping, Steuer-Mapping und Export-Log.
-- =============================================================================

-- ── sevdesk_account_map (SKR-Konto → sevDesk AccountingType-ID) ───────────────
CREATE TABLE IF NOT EXISTS sevdesk_account_map (
  customer_id        TEXT    NOT NULL,
  skr_account        TEXT    NOT NULL,
  sevdesk_account_id INT     NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, skr_account)
);

-- Default-Mappings für gängige SKR03-Konten
INSERT INTO sevdesk_account_map (customer_id, skr_account, sevdesk_account_id)
VALUES
  ('default', '3100', 0),
  ('default', '3200', 0),
  ('default', '4210', 0),
  ('default', '4240', 0),
  ('default', '4985', 0),
  ('default', '4360', 0),
  ('default', '4530', 0),
  ('default', '4600', 0),
  ('default', '4970', 0),
  ('default', '4980', 0),
  ('default', '4100', 0),
  ('default', '4900', 0)
ON CONFLICT (customer_id, skr_account) DO NOTHING;

-- ── sevdesk_tax_rule_map (Steuersatz % → sevDesk TaxRule-ID) ─────────────────
CREATE TABLE IF NOT EXISTS sevdesk_tax_rule_map (
  customer_id          TEXT    NOT NULL,
  tax_rate_pct         NUMERIC NOT NULL,
  sevdesk_tax_rule_id  INT     NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, tax_rate_pct)
);

-- Default-Steuersätze (Standard sevDesk TaxRule-IDs — können kundenspezifisch überschrieben werden)
INSERT INTO sevdesk_tax_rule_map (customer_id, tax_rate_pct, sevdesk_tax_rule_id)
VALUES
  ('default', 19, 1),
  ('default', 7,  2),
  ('default', 0,  5)
ON CONFLICT (customer_id, tax_rate_pct) DO NOTHING;

-- ── sevdesk_exports (Export-Log) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sevdesk_exports (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT,
  receipt_id    TEXT        NOT NULL,
  customer_id   TEXT        NOT NULL,
  voucher_id    TEXT        NOT NULL,
  exported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT        NOT NULL DEFAULT 'pushed',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sevdesk_exports_receipt
  ON sevdesk_exports (receipt_id);

CREATE INDEX IF NOT EXISTS idx_sevdesk_exports_customer
  ON sevdesk_exports (customer_id, exported_at DESC);
