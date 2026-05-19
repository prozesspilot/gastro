-- 110_kasse_transactions_fk_relax.sql
-- T005 — integration_id nullable machen.
--
-- Migration 040 hat `integration_id NOT NULL` mit FK auf kasse_integrations.
-- T005 nutzt aber pos_credentials (Migration 022) als Token-Storage —
-- kasse_integrations ist im Code aktuell nicht populiert. Damit Sync-Inserts
-- in kasse_transactions funktionieren, machen wir integration_id optional.
--
-- Spaeter (wenn kasse_integrations als Single-Source-of-Truth migriert wird,
-- T018-Cleanup oder M15-Phase-2), kann der FK wieder NOT NULL gemacht und
-- mit bestehenden Daten via UPDATE re-konnektiert werden.

ALTER TABLE kasse_transactions ALTER COLUMN integration_id DROP NOT NULL;
