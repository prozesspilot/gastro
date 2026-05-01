-- =============================================================================
-- Migration 020 — M05 Lexoffice-Integration
--
-- Mapping-Tabelle SKR-Konto → Lexoffice categoryId pro Kunde. Wird beim
-- Onboarding initial via Lexoffice GET /v1/categories befüllt; danach durch
-- den Backend-CategoryMapper bei Bedarf erweitert.
--
-- Default-Mappings für customer_id='default' werden mit Platzhalter-UUIDs
-- angelegt — beim ersten Lexoffice-Aufruf eines neuen Kunden werden sie auf
-- echte Lexoffice-Kategorien gemappt.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lexoffice_category_map (
  customer_id           TEXT NOT NULL,
  skr_account           TEXT NOT NULL,
  lexoffice_category_id UUID NOT NULL,
  category_name         TEXT,
  source                TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'api_lookup' | 'default'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, skr_account)
);

CREATE OR REPLACE TRIGGER tg_lexoffice_category_map_updated_at
  BEFORE UPDATE ON lexoffice_category_map
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Default-Einträge (Platzhalter-UUIDs, werden beim ersten echten Lexoffice-
-- Onboarding ersetzt). 5 sinnvolle Defaults für Gastronomie:
INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, category_name, source) VALUES
  ('default', '3100', '00000000-0000-4000-8000-000000003100', 'Wareneingang Lebensmittel',  'default'),
  ('default', '4240', '00000000-0000-4000-8000-000000004240', 'Strom / Gas / Wasser',       'default'),
  ('default', '4985', '00000000-0000-4000-8000-000000004985', 'Reinigung / Wartung',        'default'),
  ('default', '4600', '00000000-0000-4000-8000-000000004600', 'Werbung',                    'default'),
  ('default', '4980', '00000000-0000-4000-8000-000000004980', 'Sonstige Aufwendungen',      'default')
ON CONFLICT (customer_id, skr_account) DO NOTHING;
