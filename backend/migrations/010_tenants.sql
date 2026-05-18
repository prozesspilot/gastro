-- 010_tenants.sql
-- Tenant = ein zahlender Endkunde von ProzessPilot (Gastronomie-Wirt).
--
-- Tenants sind die Wurzel aller Customer-Daten. Jede andere Tabelle mit
-- tenant_id verweist hierauf und ist via RLS isoliert.
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md
--                + modules/M14, M15 (tenant_id UUID).

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identität
  slug                    VARCHAR(60) UNIQUE NOT NULL,         -- z. B. "pizzeria-bella-italia"
  display_name            VARCHAR(120) NOT NULL,               -- Gastronomie-Name (sichtbar in Webapp)
  legal_name              VARCHAR(200),                        -- Firmenname laut Handelsregister / Gewerbeschein
  contact_email           CITEXT,                              -- primärer Wirts-Kontakt
  contact_phone           VARCHAR(30),

  -- Vertragsdaten
  package                 VARCHAR(20) NOT NULL DEFAULT 'standard'
                          CHECK (package IN ('solo','standard','pro','filiale')),
  pos_system              VARCHAR(30),                         -- 'sumup_lite' / 'sumup_pos_pro' / 'orderbird' / ...
  contract_started_at     TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  deletion_scheduled_at   TIMESTAMPTZ,
  deleted_at              TIMESTAMPTZ,
  deletion_status         VARCHAR(20) NOT NULL DEFAULT 'active'
                          CHECK (deletion_status IN ('active','cancelled','export_pending','deletion_pending','deleted')),

  -- Zeitstempel
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tenants_set_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Aktive Tenants schnell finden:
CREATE INDEX idx_tenants_deletion_status ON tenants (deletion_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_package ON tenants (package);

-- RLS: tenants selbst wird von Mitarbeiter-Webapp gelesen (cross-tenant).
-- Wir machen es Row-Level-Security-fähig, lassen die Policy aber permissiv für
-- Bypass-Sessions. Tenant-bezogene Tabellen unten erzwingen Isolation.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;     -- erzwingt RLS auch für den Owner
CREATE POLICY tenants_select_all ON tenants
  FOR SELECT
  USING (is_rls_bypassed() OR current_tenant_id() = id OR current_tenant_id() IS NULL);
CREATE POLICY tenants_write_bypass ON tenants
  FOR ALL
  USING (is_rls_bypassed())
  WITH CHECK (is_rls_bypassed());

-- ---------------------------------------------------------------------------
-- tenant_settings — pro Tenant ein einzelner Eintrag mit Module-/Routing-Config
-- ---------------------------------------------------------------------------
CREATE TABLE tenant_settings (
  tenant_id        UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Module-Flags
  modules_enabled  JSONB NOT NULL DEFAULT '[]'::jsonb,         -- ["M01","M02","M03",...]

  -- Integrations-Config
  integrations     JSONB NOT NULL DEFAULT '{}'::jsonb,         -- credential-Refs + Adapter-Auswahl
  routing          JSONB NOT NULL DEFAULT '{}'::jsonb,         -- ki_kategorisierung, min_amount_review, ...
  notification     JSONB NOT NULL DEFAULT '{}'::jsonb,         -- Discord-Channel-IDs, Wirts-Kommunikations-Kanäle
  custom           JSONB NOT NULL DEFAULT '{}'::jsonb,         -- Plugin- / Pro-Custom-Werte

  profile_version  INTEGER NOT NULL DEFAULT 1,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tenant_settings_set_updated_at
BEFORE UPDATE ON tenant_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_settings_isolation ON tenant_settings
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
