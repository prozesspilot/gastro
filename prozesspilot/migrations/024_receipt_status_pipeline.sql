-- Migration 024 — Receipt-Status auf vollständiges Pipeline-Schema erweitern
--
-- Hintergrund: Das Frontend nutzt ein granulares Pipeline-Status-System
-- (received → extracting → extracted → categorizing → ... → completed).
-- Die ursprüngliche CHECK-Constraint kannte nur 4 Werte.
-- Diese Migration ersetzt die Constraint durch alle gültigen Pipeline-Stati.

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_status_check;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_status_check
    CHECK (status IN (
      -- Legacy (Backwards-Kompatibilität)
      'pending',
      'processing',
      'done',
      -- Pipeline-Stati (Frontend M01–M08)
      'received',
      'extracting',
      'extracted',
      'categorizing',
      'categorized',
      'archiving',
      'archived',
      'exporting',
      'exported',
      'completed',
      'requires_review',
      -- Fehler
      'error'
    ));

-- Bestehende 'pending'-Einträge bleiben gültig (kein Datenverlust).
