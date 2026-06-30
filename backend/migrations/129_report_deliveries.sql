-- 129_report_deliveries.sql
-- T089/M08 — Steuerberater-Übergabe: Versand-Tracking + Empfänger-Spalte.
--
-- Zweck:
--   1. tenants.advisor_email — die Mail-Adresse des Steuerberaters, an die der
--      Monats-Report (T087) zugestellt wird. Naming: English snake_case (§6.2),
--      konsistent mit der bestehenden Steuerberater-Spalte `advisor_cost_monthly`
--      (Migration 123). Fachbegriff = "steuerberater_email".
--   2. report_deliveries — pro Versand (Report × Kanal × Empfänger) ein Status-Row
--      (pending → sent | failed), mit messageId (`external_id`) und Fehlertext.
--      KEINE Klartext-Mail-Adresse: nur `recipient_hash` (SHA256, PII-frei, vgl.
--      mail.service hashEmailForLog).
--
-- Idempotenz: UNIQUE (report_id, channel, recipient_hash) — ein erneuter Versand
-- desselben Reports an denselben Empfänger aktualisiert den vorhandenen Row
-- (ON CONFLICT im Backend), statt Duplikate anzulegen. Erneuter Versand (z. B.
-- nach 'failed') ist damit ein Status-Update, kein neuer Eintrag.
--
-- RLS wie auf der belege-Welt: is_rls_bypassed() OR tenant_id = current_tenant_id()
-- (Helper aus 002_helpers.sql). Tabellen-GRANTs nicht nötig — ALTER DEFAULT
-- PRIVILEGES aus setup-app-role.sql (Muster wie 124/125/127/128).
--
-- Rückwärts-kompatibel: ADD COLUMN IF NOT EXISTS (nullable) + neue Tabelle.
-- Rollback in 129_report_deliveries_rollback.sql.

-- ---------------------------------------------------------------------------
-- tenants.advisor_email (Empfänger der Steuerberater-Übergabe)
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS advisor_email CITEXT;  -- steuerberater_email

-- ---------------------------------------------------------------------------
-- report_deliveries
-- ---------------------------------------------------------------------------
CREATE TABLE report_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_id       UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,

  -- Versand-Kanal. Aktuell nur 'email'; CHECK lässt spätere Kanäle bewusst zu,
  -- wird dann erweitert (z. B. 'lexware_api' für direkten Push).
  channel         VARCHAR(20) NOT NULL DEFAULT 'email'
                  CHECK (channel IN ('email')),

  -- PII-frei: SHA256-Hex (64 Zeichen) der Empfänger-Mail. Die echte Adresse
  -- steht in tenants.advisor_email und wird zur Sendezeit gelesen — hier nie.
  recipient_hash  CHAR(64) NOT NULL,

  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'failed')),

  -- SMTP messageId (bei Dry-Run NULL — kein echter Versand).
  external_id     TEXT,
  -- Fehlertext bei status='failed' (SMTP-Fehler). Kein PII.
  error           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotenz: ein Delivery-Row pro Report+Kanal+Empfänger.
  CONSTRAINT report_deliveries_report_channel_recipient_unique
    UNIQUE (report_id, channel, recipient_hash)
);

-- "alle Deliveries eines Tenants, neueste zuerst".
CREATE INDEX report_deliveries_tenant_created_idx
  ON report_deliveries (tenant_id, created_at DESC);

CREATE TRIGGER report_deliveries_set_updated_at
BEFORE UPDATE ON report_deliveries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE report_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY report_deliveries_tenant_isolation ON report_deliveries
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
