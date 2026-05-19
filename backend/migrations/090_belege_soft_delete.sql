-- 090_belege_soft_delete.sql
-- T015/M01 — Soft-Delete fuer belege.
--
-- DSGVO + GoBD-Kontext:
--   * GoBD § 147 AO verlangt 10 Jahre Aufbewahrung steuerrelevanter Belege.
--   * Hart-Loeschen direkt aus belege ist daher waehrend dieser Frist verboten.
--   * Stattdessen: `deleted_at`-Timestamp + Filter im Listing.
--   * Ein separater Cron-Job (T018 Backlog) kann nach Ablauf der Frist
--     `DELETE FROM belege WHERE deleted_at < now() - INTERVAL '10 years'` machen.
--
-- Performance-Hinweis:
--   * Partial-Index auf deleted_at IS NULL macht aktive-Liste-Queries schneller.
--   * Bestehende idx_belege_tenant_status und idx_belege_tenant_received bleiben
--     gueltig; das Filter `deleted_at IS NULL` wird vom Planner ueber den
--     neuen Partial-Index gepushed.

ALTER TABLE belege
  ADD COLUMN deleted_at TIMESTAMPTZ;

-- Partial-Index: nur aktive Belege (Listing-Query).
CREATE INDEX idx_belege_tenant_active
  ON belege (tenant_id, received_at DESC)
  WHERE deleted_at IS NULL;
