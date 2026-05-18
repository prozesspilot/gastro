-- 040_kasse.sql
-- M15 — Kassensystem-Connector.
--
-- Wirt verbindet sein Kassensystem (SumUp Lite, SumUp POS Pro, Orderbird, ...)
-- via OAuth mit ProzessPilot. Tägliche Z-Bons werden via Cron-Pull abgeholt,
-- damit der Steuerberater monatlich saubere Umsatzzahlen bekommt.
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md
--
-- T011 verwendet die deutschen Tabellennamen `kasse_integrations` und
-- `kasse_transactions` gemäß Akzeptanz-Kriterien. Die M15-Spec verwendet
-- intern `pos_credentials` / `pos_daily_close` — beide Begriffe sind
-- synonym, die Migration ist Quelle der Wahrheit.

-- ---------------------------------------------------------------------------
-- kasse_integrations — OAuth-Tokens pro Tenant × POS-System
-- ---------------------------------------------------------------------------
CREATE TABLE kasse_integrations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  pos_system                  VARCHAR(30) NOT NULL
                              CHECK (pos_system IN (
                                'sumup_lite','sumup_pos_pro','orderbird',
                                'lightspeed','ready2order'
                              )),
  pos_account_id              VARCHAR(100) NOT NULL,                 -- Account-ID beim POS-Anbieter

  -- OAuth-Credentials (pgcrypto-verschlüsselt)
  access_token_encrypted      BYTEA NOT NULL,
  refresh_token_encrypted     BYTEA NOT NULL,
  token_expires_at            TIMESTAMPTZ NOT NULL,
  scopes                      TEXT[],

  active                      BOOLEAN NOT NULL DEFAULT true,
  last_pull_at                TIMESTAMPTZ,
  last_pull_status            VARCHAR(20)
                              CHECK (last_pull_status IN ('success','failed','partial') OR last_pull_status IS NULL),
  last_pull_error             TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ein Tenant kann pro POS-System nur eine aktive Integration haben.
  CONSTRAINT kasse_integrations_tenant_system_unique UNIQUE (tenant_id, pos_system)
);

CREATE TRIGGER kasse_integrations_set_updated_at
BEFORE UPDATE ON kasse_integrations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_kasse_integrations_active ON kasse_integrations (tenant_id) WHERE active = true;
CREATE INDEX idx_kasse_integrations_pull_due ON kasse_integrations (last_pull_at NULLS FIRST)
  WHERE active = true;

ALTER TABLE kasse_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kasse_integrations FORCE ROW LEVEL SECURITY;
CREATE POLICY kasse_integrations_tenant_isolation ON kasse_integrations
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- kasse_transactions — täglicher Z-Bon-Snapshot pro Tenant × POS × Tag
-- ---------------------------------------------------------------------------
-- Ein Eintrag pro Geschäftstag (kann von Kalendertag abweichen, z. B. erst um
-- 5 Uhr morgens Tageswechsel). Das ist der „Tages-Z-Bon".
-- Spec: M15 § 3.2 (pos_daily_close).
CREATE TABLE kasse_transactions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id              UUID NOT NULL REFERENCES kasse_integrations(id) ON DELETE CASCADE,

  pos_system                  VARCHAR(30) NOT NULL,
  business_date               DATE NOT NULL,

  -- Summen
  total_brutto                NUMERIC(12,2) NOT NULL,
  total_netto                 NUMERIC(12,2) NOT NULL,
  transaction_count           INTEGER NOT NULL DEFAULT 0,

  -- MwSt-Splitting (Gastro-Spezialfall)
  ust_19_brutto               NUMERIC(12,2) NOT NULL DEFAULT 0,    -- Speisen vor Ort, Alkohol, Getränke
  ust_19_netto                NUMERIC(12,2) NOT NULL DEFAULT 0,
  ust_19_amount               NUMERIC(12,2) NOT NULL DEFAULT 0,
  ust_7_brutto                NUMERIC(12,2) NOT NULL DEFAULT 0,    -- Speisen außer Haus
  ust_7_netto                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  ust_7_amount                NUMERIC(12,2) NOT NULL DEFAULT 0,
  ust_0_brutto                NUMERIC(12,2) NOT NULL DEFAULT 0,    -- Pfand, durchlaufende Posten

  -- Zahlungsart-Splitting
  payment_method_split        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"cash": 234.50, "card": 1837.00, "other": 12.00}

  -- Rohdaten (für Audit/Forensik)
  raw_data                    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Export-Status
  exported_to_accounting      BOOLEAN NOT NULL DEFAULT false,
  exported_at                 TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotenz: ein Tag × Tenant × POS-System nur einmal.
  CONSTRAINT kasse_transactions_tenant_pos_date_unique UNIQUE (tenant_id, pos_system, business_date)
);

CREATE TRIGGER kasse_transactions_set_updated_at
BEFORE UPDATE ON kasse_transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_kasse_transactions_tenant_date ON kasse_transactions (tenant_id, business_date DESC);
CREATE INDEX idx_kasse_transactions_unexported ON kasse_transactions (tenant_id, business_date)
  WHERE exported_to_accounting = false;

ALTER TABLE kasse_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kasse_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY kasse_transactions_tenant_isolation ON kasse_transactions
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
