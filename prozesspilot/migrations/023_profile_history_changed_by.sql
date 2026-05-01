-- 023 — customer_profile_history: changed_by-Spalte ergänzen
--
-- Die History-Tabelle existiert seit 011/012, hat aber keine changed_by-Spalte.
-- Phase 3 (Pro-Paket) erlaubt das Anzeigen von "Geändert von" in der Webapp,
-- daher holen wir die Spalte nach.

ALTER TABLE customer_profile_history
  ADD COLUMN IF NOT EXISTS changed_by TEXT;
