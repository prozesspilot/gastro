-- 122_invoices.sql
-- Auto-Rechnungs-Generator — Tabelle invoices
--
-- Jede Rechnung ist einem Tenant zugeordnet und hat eine fortlaufende
-- GoBD-konforme Rechnungsnummer. Stripe-Migration erfolgt ab ~25 Tenants
-- (§6.3 Mitarbeiter_Webapp.md); bis dahin manuelle Zahlung + Mahn-Tasks.
--
-- Spec-Referenz: Mitarbeiter_Webapp.md §6.2; T035

-- ---------------------------------------------------------------------------
-- Sequenz für GoBD-konforme, lückenlose Rechnungsnummern
-- (Pro-Tenant-Sequenz ist in Anwendungslogik implementiert — DB-Sequenz
--  garantiert globale Lückenlosigkeit via SERIAL, Tenant-Prefix im Code)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS invoices_number_seq START 1;

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- GoBD-Pflicht: fortlaufende, eindeutige Rechnungsnummer
  -- Format: PP-YYYY-NNNNN (z. B. "PP-2026-00001")
  invoice_number      VARCHAR(20)   UNIQUE NOT NULL,

  -- 'setup' = Einmalige Setup-Fee; 'monthly' = monatliche Paket-Gebühr
  invoice_type        VARCHAR(20)   NOT NULL CHECK (invoice_type IN ('setup', 'monthly')),

  -- Abrechnungszeitraum (nur bei 'monthly' relevant)
  period_year         SMALLINT      NULL,   -- z. B. 2026
  period_month        SMALLINT      NULL,   -- 1–12
  -- Idempotenz-Constraint: pro Tenant + Monat genau eine Rechnung
  -- (NULL-Werte werden von UNIQUE-Index in PG ausgenommen — nur gefüllte Werte geprüft)

  -- Beträge in EUR, 2 Dezimalstellen (DECIMAL exakt, kein Float-Rounding)
  amount_netto        DECIMAL(10,2) NOT NULL CHECK (amount_netto >= 0),
  ust_rate            DECIMAL(5,4)  NOT NULL DEFAULT 0.19,  -- 0.19 = 19 % USt
  ust_amount          DECIMAL(10,2) NOT NULL CHECK (ust_amount >= 0),
  amount_brutto       DECIMAL(10,2) NOT NULL CHECK (amount_brutto >= 0),

  -- PDF in MinIO (Stub für Pilot — wird in T036/Stripe-Phase gefüllt)
  pdf_path            VARCHAR(500)  NULL,

  -- Status-Maschine (§6.1)
  status              VARCHAR(20)   NOT NULL DEFAULT 'gestellt'
                      CHECK (status IN ('gestellt', 'bezahlt', 'gemahnt_1', 'gemahnt_2', 'inkasso', 'storniert')),

  -- Zahlung
  paid_at             TIMESTAMPTZ   NULL,
  paid_amount         DECIMAL(10,2) NULL,

  -- Mahnwesen
  reminder_sent_at    TIMESTAMPTZ   NULL,

  -- Fälligkeit: 14 Tage nach Erstellung (§6.1)
  due_at              DATE          NOT NULL,

  -- Zeitstempel
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Trigger: updated_at automatisch setzen
CREATE TRIGGER invoices_set_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Idempotenz-Index: pro Tenant + Periode genau eine monthly-Rechnung
-- DECISION: Partial-Index auf period_year/month IS NOT NULL — setup-Rechnungen
-- sind nicht periodengebunden (können mehrfach gestellt werden, z. B. nach Storno).
CREATE UNIQUE INDEX invoices_tenant_period_uidx
  ON invoices (tenant_id, period_year, period_month)
  WHERE period_year IS NOT NULL AND period_month IS NOT NULL;

-- Performance: Tenant-scoped Queries (Webapp-Liste, Mahn-Cron)
CREATE INDEX invoices_tenant_status_idx ON invoices (tenant_id, status);
CREATE INDEX invoices_due_status_idx    ON invoices (due_at, status) WHERE status = 'gestellt';
CREATE INDEX invoices_created_at_idx    ON invoices (created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: Mitarbeiter-Webapp liest cross-tenant (via is_rls_bypassed()),
-- Tenant-eigene Requests nur eigene Rechnungen.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY invoices_isolation ON invoices
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
