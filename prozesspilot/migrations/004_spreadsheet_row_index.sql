-- =============================================================================
-- Migration 004 · M07 (Excel / Google Sheets Export) — spreadsheet_row_index
-- =============================================================================
-- Cache-Tabelle für die Idempotenz-Logik in M07 §9.2:
--   (sheet_id × tab × receipt_id) → row_index
--
-- Der Adapter schaut hier zuerst nach, bevor er via Sheets-API einen Row-Lookup
-- machen würde. Das hält Re-Runs O(1) und schützt vor Doppel-Anhängen wenn
-- WF-MASTER-RECEIPT denselben Beleg ein zweites Mal durch M07 schickt.
--
-- Bewusste Vereinfachungen (siehe M07-README "Decisions"):
--   - KEIN RLS (Pflicht-Vorgabe der Aufgabe). Die Tabelle enthält keine
--     personenbezogenen oder finanziellen Daten, sondern nur den Sheet-Index.
--     Der customer_id ist Teil des Primary Keys, eine versehentliche
--     Cross-Tenant-Query liefert daher kein "fremdes" Receipt zurück, weil
--     receipt_id projektweit über customer_id eindeutig kontextualisiert wird.
--   - customer_id ist TEXT (kein FK), konsistent zu 010_m10_minimal.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS spreadsheet_row_index (
  customer_id   TEXT        NOT NULL,
  sheet_id      TEXT        NOT NULL,
  tab           TEXT        NOT NULL,
  receipt_id    TEXT        NOT NULL,
  row_index     INT         NOT NULL CHECK (row_index >= 1),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, sheet_id, tab, receipt_id)
);

-- Reverse-Lookup: alle Belege eines Tabs (z. B. für Re-Sync-Tooling).
CREATE INDEX IF NOT EXISTS idx_spreadsheet_row_index_tab
  ON spreadsheet_row_index (customer_id, sheet_id, tab);

-- updated_at automatisch pflegen (Trigger-Funktion existiert aus 001).
CREATE OR REPLACE TRIGGER tg_spreadsheet_row_index_updated_at
  BEFORE UPDATE ON spreadsheet_row_index
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
