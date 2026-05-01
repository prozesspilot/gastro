-- =============================================================================
-- Migration 003 · M01 (Belegerfassung & OCR) — globale Lieferanten-Stammdaten
-- =============================================================================
-- Quelle: M01 §11.
--
-- Bewusste Entscheidungen:
--   - Globale Tabelle ohne customer_id-Spalte. Sie ist Stammdaten für ALLE
--     Mandanten gemeinsam (z. B. "Metro AG", "Stadtwerke München").
--     Kundenindividuelle Mappings liegen in customer_profiles.custom.supplier_overrides.
--   - Kein RLS — Zugriff steuert ausschließlich der Backend-Service.
--   - aliases als TEXT[] mit GIN-Index für Fuzzy-/Containment-Lookups.
--   - vat_id ist UNIQUE, aber NULL-fähig (nicht alle Lieferanten haben USt-ID).
-- =============================================================================

CREATE TABLE IF NOT EXISTS suppliers_global (
  supplier_id        TEXT        PRIMARY KEY,           -- z. B. ULID/Slug
  vat_id             TEXT        UNIQUE,                -- z. B. "DE123456789"
  display_name       TEXT        NOT NULL,              -- "Metro AG"
  aliases            TEXT[]      NOT NULL DEFAULT '{}', -- Fuzzy-Match-Kandidaten
  default_category   TEXT,                              -- z. B. "wareneinkauf_food"
  default_skr        TEXT,                              -- z. B. "3100"
  country            TEXT        NOT NULL DEFAULT 'DE',
  source             TEXT,                              -- 'manual' | 'crawl' | 'llm'
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN-Index für aliases @> ARRAY[$1] und ähnliche Containment-Lookups.
CREATE INDEX IF NOT EXISTS idx_suppliers_aliases
  ON suppliers_global USING gin (aliases);

-- Lookup nach normalisiertem display_name (lower-case) für exakten Match.
CREATE INDEX IF NOT EXISTS idx_suppliers_display_name_lower
  ON suppliers_global (lower(display_name));

-- updated_at automatisch pflegen (Trigger-Funktion existiert aus 001).
CREATE OR REPLACE TRIGGER tg_suppliers_global_updated_at
  BEFORE UPDATE ON suppliers_global
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
