-- =============================================================================
-- Migration 015 — Volltextsuche auf Receipts
--
-- Erweitert die receipts-Tabelle um eine tsvector-Spalte und einen
-- BEFORE INSERT/UPDATE-Trigger, der das Such-Vektor-Feld pflegt.
-- =============================================================================

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_receipts_search
  ON receipts USING GIN (search_vector);

CREATE OR REPLACE FUNCTION receipts_update_search() RETURNS TRIGGER AS $$
DECLARE
  ocr_text TEXT;
  vendor   TEXT;
  cat      TEXT;
  fname    TEXT;
BEGIN
  -- Punktuation in Dateinamen normalisieren, damit "Bahn.pdf" tokenisiert wird
  fname    := regexp_replace(COALESCE(NEW.original_name, ''), '[._\-/]', ' ', 'g');
  ocr_text := regexp_replace(COALESCE(NEW.metadata->>'ocr_text', ''), '[._\-/]', ' ', 'g');
  vendor   := COALESCE(NEW.metadata->'categorization'->>'vendor', '');
  cat      := COALESCE(NEW.metadata->'categorization'->>'category', '');

  NEW.search_vector :=
      setweight(to_tsvector('german', fname),    'A')
    || setweight(to_tsvector('german', vendor),  'A')
    || setweight(to_tsvector('german', cat),     'B')
    || setweight(to_tsvector('german', ocr_text),'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_receipts_search ON receipts;
CREATE TRIGGER tg_receipts_search
  BEFORE INSERT OR UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION receipts_update_search();

-- Bestehende Zeilen einmalig aktualisieren, damit der Vektor gefüllt ist
UPDATE receipts SET metadata = metadata WHERE search_vector IS NULL;
