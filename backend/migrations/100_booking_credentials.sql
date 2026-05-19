-- 100_booking_credentials.sql
-- T009/M05 — Pro-Tenant Buchhaltungs-API-Tokens (Lexware Office, sevDesk, ...).
--
-- Pattern wie 022_pos_credentials.sql: pgcrypto-verschluesselte Tokens,
-- UNIQUE(tenant_id, provider) damit pro Tenant pro Provider nur ein
-- Token gleichzeitig aktiv ist.
--
-- Security:
--   * Token wird via pgp_sym_encrypt(token, PP_PGCRYPTO_KEY) verschluesselt.
--   * RLS aktiv: Mitarbeiter sehen nur Tenants in deren aktivem Context.
--   * Token wird NIE im Klartext geloggt oder ueber das Frontend ausgegeben —
--     nur intern fuer den Lexoffice-Call entschluesselt.

CREATE TABLE booking_credentials (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Welches Buchhaltungs-System
  provider                 VARCHAR(30)  NOT NULL
                           CHECK (provider IN ('lexware_office', 'sevdesk', 'datev_online')),

  -- API-Token verschluesselt (pgcrypto AES via pgp_sym_encrypt). Lexware Office
  -- nutzt einen langlebigen API-Key (kein OAuth), daher keine refresh-Logik.
  api_token_encrypted      BYTEA        NOT NULL,

  -- Optional: konfigurierbarer Display-Name (z.B. "Almaz Steuerberaterin
  -- Kanzlei Mustermann"), nur Anzeige in der Webapp.
  display_name             VARCHAR(200),

  -- Auto-Push aktiv? false = Mitarbeiter triggert manuell via UI-Button.
  -- Wenn true: nach Beleg-Status='extracted' (+ category) wird automatisch
  -- ein Export-Job in die Queue gelegt (T009-Phase-2, aktuell nur Single+Batch).
  auto_push                BOOLEAN      NOT NULL DEFAULT false,

  -- Status: false = deaktiviert (Token zurueckgezogen, Steuerberater-Wechsel, ...).
  active                   BOOLEAN      NOT NULL DEFAULT true,
  deactivation_reason      VARCHAR(80),

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used_at             TIMESTAMPTZ,

  -- Idempotenz auf (tenant, provider). Bei Token-Rotation: UPDATE statt INSERT.
  CONSTRAINT booking_credentials_tenant_provider_unique UNIQUE (tenant_id, provider)
);

CREATE INDEX idx_booking_credentials_tenant_active
  ON booking_credentials (tenant_id)
  WHERE active = true;

CREATE TRIGGER booking_credentials_set_updated_at
BEFORE UPDATE ON booking_credentials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE booking_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_credentials_tenant_isolation ON booking_credentials
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
