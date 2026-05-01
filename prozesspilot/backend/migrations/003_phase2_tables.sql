-- =============================================================================
-- Migration 003 — Phase 2 Tables
-- Alle Tabellen die für Phase-2-Module (M03, M05, M08) benötigt werden.
-- =============================================================================

-- ── customers (Basis-Tabelle, idempotent) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  email       TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);

-- ── tenants (Basis-Tabelle, idempotent) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── receipts (zentrale Tabelle) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  receipt_id          TEXT        PRIMARY KEY,
  customer_id         TEXT        NOT NULL,
  tenant_id           TEXT,
  status              TEXT        NOT NULL DEFAULT 'received',
  file_object_key     TEXT        NOT NULL,
  file_sha256         TEXT        NOT NULL,
  payload             JSONB       NOT NULL DEFAULT '{}',
  processing_started_at  TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, file_sha256)
);
CREATE INDEX IF NOT EXISTS idx_receipts_customer_status
  ON receipts (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_receipts_document_date
  ON receipts (((payload->'extraction'->'fields'->>'document_date')::text));

-- ── audit_log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  tenant_id   TEXT,
  actor       TEXT        NOT NULL DEFAULT 'system',
  action      TEXT        NOT NULL,
  resource    TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── categories (M03 globale Kategorien) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  category_id      TEXT        PRIMARY KEY,
  label_de         TEXT        NOT NULL,
  default_skr03    TEXT,
  default_skr04    TEXT,
  default_tax_key  TEXT,
  description      TEXT
);

-- Seed: 14 Standard-Kategorien für Gastronomie
INSERT INTO categories (category_id, label_de, default_skr03, default_skr04, default_tax_key)
VALUES
  ('wareneinkauf_food',          'Wareneinkauf Lebensmittel',     '3100', '5100', '9'),
  ('wareneinkauf_drink',         'Wareneinkauf Getränke',         '3200', '5200', '9'),
  ('betriebskosten_energie',     'Betriebskosten Energie',        '4240', '6310', '9'),
  ('betriebskosten_wasser',      'Betriebskosten Wasser',         '4240', '6310', '9'),
  ('miete',                      'Miete & Pacht',                 '4210', '6310', '9'),
  ('reinigung',                  'Reinigung & Hygiene',           '4985', '6815', '9'),
  ('wartung',                    'Wartung & Reparatur',           '4985', '6815', '9'),
  ('personal',                   'Personalkosten',                '4100', '6000', '0'),
  ('fortbildung',                'Fortbildung',                   '4900', '6830', '9'),
  ('versicherung',               'Versicherungen',                '4360', '6300', '0'),
  ('kfz',                        'KFZ-Kosten',                    '4530', '6570', '9'),
  ('werbung',                    'Werbung & Marketing',           '4600', '6600', '9'),
  ('beratung',                   'Beratung & Buchführung',        '4970', '6815', '9'),
  ('sonstige_betriebskosten',    'Sonstige Betriebskosten',       '4980', '6815', '9'),
  ('sonstige_aufwand',           'Sonstiger Aufwand',             '4980', '6900', '9')
ON CONFLICT (category_id) DO NOTHING;

-- ── customer_categories (M03 kundenspezifische Overrides) ─────────────────────
CREATE TABLE IF NOT EXISTS customer_categories (
  customer_id      TEXT        NOT NULL,
  category_id      TEXT        NOT NULL,
  override_skr     TEXT,
  override_tax_key TEXT,
  PRIMARY KEY (customer_id, category_id)
);

-- ── customer_cost_centers (M03) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_cost_centers (
  customer_id      TEXT        NOT NULL,
  cost_center_id   TEXT        NOT NULL,
  label            TEXT        NOT NULL,
  PRIMARY KEY (customer_id, cost_center_id)
);

-- ── suppliers_global (M03 Stammdaten) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers_global (
  supplier_id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                 TEXT        NOT NULL,
  vat_id               TEXT,
  default_category     TEXT,
  default_skr03        TEXT,
  default_skr04        TEXT,
  default_tax_key      TEXT,
  confidence           NUMERIC(3,2) NOT NULL DEFAULT 0.9,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_global_name ON suppliers_global (lower(name));

-- ── categorization_cache (M03 Claude-Cache) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS categorization_cache (
  cache_key        TEXT        PRIMARY KEY,
  result           JSONB       NOT NULL,
  hits             INT         NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days'
);
CREATE INDEX IF NOT EXISTS idx_categorization_cache_expires ON categorization_cache (expires_at);

-- ── customer_credentials (M05 API-Keys verschlüsselt) ─────────────────────────
CREATE TABLE IF NOT EXISTS customer_credentials (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id      TEXT        NOT NULL,
  kind             TEXT        NOT NULL,  -- 'lexoffice_api_key', 'google_sheets', etc.
  encrypted_value  BYTEA       NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, kind)
);

-- ── lexoffice_category_map (M05 SKR → Lexoffice Mapping) ─────────────────────
CREATE TABLE IF NOT EXISTS lexoffice_category_map (
  customer_id            TEXT        NOT NULL,
  skr_account            TEXT        NOT NULL,
  lexoffice_category_id  UUID        NOT NULL,
  category_name          TEXT,
  source                 TEXT        NOT NULL DEFAULT 'manual',  -- 'manual', 'api_lookup', 'default'
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, skr_account)
);

-- Default-Mappings für gängige SKR03-Konten
INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, category_name, source)
VALUES
  ('default', '3100', '00000000-0000-4000-8000-000000003100', 'Wareneinkauf Lebensmittel', 'default'),
  ('default', '3200', '00000000-0000-4000-8000-000000003200', 'Wareneinkauf Getränke', 'default'),
  ('default', '4210', '00000000-0000-4000-8000-000000004210', 'Miete und Pacht', 'default'),
  ('default', '4240', '00000000-0000-4000-8000-000000004240', 'Energie und Wasser', 'default'),
  ('default', '4985', '00000000-0000-4000-8000-000000004985', 'Reinigung und Wartung', 'default'),
  ('default', '4360', '00000000-0000-4000-8000-000000004360', 'Versicherungen', 'default'),
  ('default', '4530', '00000000-0000-4000-8000-000000004530', 'KFZ-Kosten', 'default'),
  ('default', '4600', '00000000-0000-4000-8000-000000004600', 'Werbung und Marketing', 'default'),
  ('default', '4970', '00000000-0000-4000-8000-000000004970', 'Beratungskosten', 'default'),
  ('default', '4980', '00000000-0000-4000-8000-000000004980', 'Sonstige Betriebskosten', 'default'),
  ('default', '4100', '00000000-0000-4000-8000-000000004100', 'Personalkosten', 'default'),
  ('default', '4900', '00000000-0000-4000-8000-000000004900', 'Fortbildungskosten', 'default')
ON CONFLICT (customer_id, skr_account) DO NOTHING;

-- ── monthly_reports (M08 Monatsberichte) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_reports (
  report_id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id        TEXT        NOT NULL,
  kind               TEXT        NOT NULL DEFAULT 'monthly',
  period             TEXT        NOT NULL,   -- 'YYYY-MM'
  period_year        INT,
  period_month       INT,
  status             TEXT        NOT NULL DEFAULT 'building',  -- 'building', 'done', 'failed'
  totals             JSONB,
  pdf_object_key     TEXT,
  delivery_log       JSONB       NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, period)
);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_customer ON monthly_reports (customer_id, period DESC);

-- ── report_deliveries (M08 Versand-Log) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_deliveries (
  delivery_id        TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_id          TEXT        NOT NULL REFERENCES monthly_reports (report_id) ON DELETE CASCADE,
  channel            TEXT        NOT NULL,
  recipient          TEXT        NOT NULL,
  status             TEXT        NOT NULL,  -- 'delivered', 'failed', 'pending'
  delivered_at       TIMESTAMPTZ,
  external_id        TEXT,
  error              JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── customer_hooks (Hook-System) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_hooks (
  hook_id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id      TEXT        NOT NULL,
  event_type       TEXT        NOT NULL,
  target_url       TEXT        NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  secret           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_hooks_customer_event ON customer_hooks (customer_id, event_type);

-- ── hook_executions (Hook-Log) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hook_executions (
  execution_id     TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  hook_id          TEXT        NOT NULL REFERENCES customer_hooks (hook_id) ON DELETE CASCADE,
  customer_id      TEXT        NOT NULL,
  event_type       TEXT        NOT NULL,
  request_payload  JSONB,
  response_status  INT,
  response_body    TEXT,
  duration_ms      INT,
  success          BOOLEAN     NOT NULL DEFAULT false,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hook_executions_hook ON hook_executions (hook_id, created_at DESC);

-- ── processed_events (Idempotenz Event-Bus) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS processed_events (
  event_id       TEXT        PRIMARY KEY,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
