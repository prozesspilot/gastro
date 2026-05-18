-- 050_export_log.sql
-- Cross-cutting Export-Log für M04 (DATEV), M05 (Lexware Office), M06 (sevDesk),
-- M07 (Excel/Sheets), M11 (IMAP-Monats-Mail). Jeder Export-Versuch wird hier
-- protokolliert — sowohl Erfolg als auch Fehler.
--
-- Diese Tabelle ist die Quelle der Wahrheit für „Wurde dieser Beleg/Monat
-- bereits an System X exportiert?" → Idempotenz pro (beleg_id, target).

CREATE TABLE export_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Worauf bezieht sich der Export?
  beleg_id            UUID REFERENCES belege(id) ON DELETE SET NULL,
  -- Für Monats-Exports (M11, M08) kann beleg_id NULL sein und stattdessen
  -- period_year/period_month gesetzt werden.
  period_year         SMALLINT,
  period_month        SMALLINT CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12),

  -- Ziel
  target              VARCHAR(30) NOT NULL
                      CHECK (target IN (
                        'datev','lexware_office','sevdesk',
                        'excel','google_sheets','imap_monthly',
                        'manual'
                      )),

  -- Ergebnis
  status              VARCHAR(20) NOT NULL
                      CHECK (status IN ('pushed','failed','skipped','retry_pending')),
  external_id         TEXT,                    -- Voucher-ID/Receipt-ID beim Ziel-System
  external_url        TEXT,                    -- Deep-Link zum Beleg im Ziel-System
  error_code          VARCHAR(80),
  error_message       TEXT,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Request/Response für Forensik

  attempt_no          INTEGER NOT NULL DEFAULT 1,
  pushed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_export_log_tenant_target ON export_log (tenant_id, target, pushed_at DESC);
CREATE INDEX idx_export_log_beleg ON export_log (beleg_id) WHERE beleg_id IS NOT NULL;
CREATE INDEX idx_export_log_failed ON export_log (tenant_id, target) WHERE status = 'failed';

-- Idempotenz: pro Beleg × Target maximal ein „pushed"-Eintrag.
-- (Wiederholungs-Versuche zählen als attempt_no=2,3,... und werden als
--  separate Rows mit status='failed' oder 'pushed' geschrieben — der
--  unique-Index gilt nur für pushed.)
CREATE UNIQUE INDEX idx_export_log_beleg_target_pushed
  ON export_log (beleg_id, target)
  WHERE beleg_id IS NOT NULL AND status = 'pushed';

-- Idempotenz für Monats-Exports: pro Tenant × Target × Periode max. 1 pushed.
CREATE UNIQUE INDEX idx_export_log_period_target_pushed
  ON export_log (tenant_id, target, period_year, period_month)
  WHERE beleg_id IS NULL AND status = 'pushed';

ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_log FORCE ROW LEVEL SECURITY;
CREATE POLICY export_log_tenant_isolation ON export_log
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
