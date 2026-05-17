-- =============================================================================
-- Migration 019 — M03 Kategorisierung & Buchungsvorbereitung
--
-- Nach M03_Kategorisierung.md §9. Vier Tabellen + Seed-Daten.
--
-- Hinweis: customer_id ist TEXT (kein FK auf customers(id) UUID), weil das
-- Konzept-Datenmodell durchgehend TEXT-IDs (z. B. 'cust_a3f4b2') verwendet.
-- =============================================================================

-- =============================================================================
-- a) categories (global, gemeinsam für alle Kunden)
-- =============================================================================
CREATE TABLE IF NOT EXISTS categories (
  category_id      TEXT PRIMARY KEY,                  -- z. B. 'wareneinkauf_food'
  label_de         TEXT NOT NULL,
  default_skr03    TEXT,
  default_skr04    TEXT,
  default_tax_key  TEXT,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- b) customer_categories — pro-Kunde Override für SKR & Tax-Key
-- =============================================================================
CREATE TABLE IF NOT EXISTS customer_categories (
  customer_id      TEXT NOT NULL,
  category_id      TEXT NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
  override_skr     TEXT,
  override_tax_key TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, category_id)
);

-- =============================================================================
-- c) customer_cost_centers — Kostenstellen pro Kunde
-- =============================================================================
CREATE TABLE IF NOT EXISTS customer_cost_centers (
  customer_id      TEXT NOT NULL,
  cost_center_id   TEXT NOT NULL,
  label            TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, cost_center_id)
);

-- =============================================================================
-- d) Seed: 14 Standardkategorien (Gastronomie)
-- =============================================================================
INSERT INTO categories (category_id, label_de, default_skr03, default_skr04, default_tax_key) VALUES
  ('wareneinkauf_food',      'Wareneinkauf Lebensmittel',  '3100', '5100', '9'),
  ('wareneinkauf_drink',     'Wareneinkauf Getränke',      '3100', '5100', '9'),
  ('betriebskosten_energie', 'Energie / Strom / Gas',      '4240', '6310', '9'),
  ('betriebskosten_wasser',  'Wasser / Abwasser',          '4240', '6310', '9'),
  ('miete',                  'Miete / Pacht',              '4210', '6310', '0'),
  ('reinigung',              'Reinigung / Hygiene',        '4985', '6300', '9'),
  ('wartung',                'Wartung / Reparatur',        '4985', '6300', '9'),
  ('personal',               'Personal / Lohnkosten',      '4100', '6000', '0'),
  ('fortbildung',            'Fortbildung / Schulung',     '4900', '6300', '9'),
  ('versicherung',           'Versicherung',               '4360', '6300', '0'),
  ('kfz',                    'KFZ-Kosten',                 '4530', '6570', '9'),
  ('werbung',                'Werbung / Marketing',        '4600', '6600', '9'),
  ('beratung',               'Beratung / Buchhaltung',     '4970', '6825', '9'),
  ('sonstige_aufwand',       'Sonstige Betriebskosten',    '4980', '6300', '9')
ON CONFLICT (category_id) DO NOTHING;

-- =============================================================================
-- e) categorization_cache — DB-Backup für Redis-Cache (M03 §8.5)
--    Cache-Key: sha256(prompt + supplier + total + items), TTL 30 Tage.
--    Cleanup-Job (separater Cron) löscht abgelaufene Einträge.
-- =============================================================================
CREATE TABLE IF NOT EXISTS categorization_cache (
  cache_key   TEXT PRIMARY KEY,
  result      JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_cache_expires
  ON categorization_cache (expires_at);
