-- =============================================================================
-- Migration 016 — Receipt Deduplication
--
-- Verhindert doppelte Belege anhand des SHA-256 Hashs des Dateiinhalts.
-- Pro Tenant + Customer + sha256 darf nur ein Receipt existieren.
-- =============================================================================

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_dedup
  ON receipts (tenant_id, customer_id, file_sha256)
  WHERE file_sha256 IS NOT NULL;
