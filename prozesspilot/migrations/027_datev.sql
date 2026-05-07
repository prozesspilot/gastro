-- =============================================================================
-- Migration 012 — M04 DATEV Export
-- Tabellen für DATEV-Export-Jobs und CSV-Tracking.
-- =============================================================================

-- ── datev_exports (Export-Log pro Monat) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS datev_exports (
  datev_export_id     TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id         TEXT        NOT NULL,
  period_year         INT         NOT NULL,
  period_month        INT         NOT NULL,
  receipt_ids         TEXT[]      NOT NULL DEFAULT '{}',
  csv_object_key      TEXT        NOT NULL DEFAULT '',
  csv_sha256          TEXT        NOT NULL DEFAULT '',
  zip_object_key      TEXT,
  delivered_at        TIMESTAMPTZ,
  delivery_message_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_datev_customer_period
  ON datev_exports (customer_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_datev_exports_customer
  ON datev_exports (customer_id, created_at DESC);
