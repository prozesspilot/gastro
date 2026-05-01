-- =============================================================================
-- Migration 021 — M08 Monatsreporting
--
-- Tabelle für persistente Monats-Reports (PDF in MinIO + Aggregat-Daten).
-- Eindeutigkeit pro (customer_id, period) garantiert Idempotenz: zweiter
-- Build für denselben Monat liefert den existierenden Report.
-- =============================================================================

-- ULID-Helper (wenn aus 010 noch nicht vorhanden, hier als Fallback). Einfaches
-- "rep_" + sub(uuid, 1, 25) genügt für menschliche Lesbarkeit.
CREATE OR REPLACE FUNCTION pp_gen_ulid_text(prefix TEXT) RETURNS TEXT AS $$
  SELECT prefix || replace(replace(replace(encode(gen_random_bytes(12), 'base64'), '/', ''), '+', ''), '=', '');
$$ LANGUAGE SQL VOLATILE;

CREATE TABLE IF NOT EXISTS monthly_reports (
  report_id        TEXT PRIMARY KEY DEFAULT pp_gen_ulid_text('rep_'),
  customer_id      TEXT NOT NULL,
  period           TEXT NOT NULL,                         -- 'YYYY-MM'
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','building','done','failed')),
  pdf_object_key   TEXT,
  totals           JSONB,
  delivery_log     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, period)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_customer
  ON monthly_reports (customer_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_status
  ON monthly_reports (status, created_at DESC);

CREATE OR REPLACE TRIGGER tg_monthly_reports_updated_at
  BEFORE UPDATE ON monthly_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
