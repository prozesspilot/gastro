-- 022_pos_credentials.sql
-- M15 — Kassensystem-Connector: OAuth-Credentials für POS-Systeme
--
-- Speichert verschlüsselte Access- und Refresh-Tokens für Cloud-Kassensysteme
-- (SumUp Lite, SumUp POS Pro, zukünftig orderbird, Lightspeed, ready2order).
--
-- Security:
--   - Tokens werden via pgcrypto (pgp_sym_encrypt/AES) verschlüsselt gespeichert
--   - RLS deaktiviert / keine Policy — App-Code nutzt expliziten WHERE tenant_id-Filter.
--     RLS-Härtung mit GUC-Pattern folgt in M14-Multi-Tenant-Story T020.
--   - UNIQUE (tenant_id, pos_system) — ein POS-System pro Tenant
--
-- Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md §3.1

CREATE TABLE pos_credentials (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant-Referenz (CASCADE: Tenant löschen → Credentials löschen)
  tenant_id                 UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Welches POS-System
  pos_system                VARCHAR(30)   NOT NULL
                            CHECK (pos_system IN ('sumup_lite', 'sumup_pos_pro')),

  -- Wirts-Account-ID beim POS-Anbieter (SumUp Merchant-Code)
  pos_account_id            VARCHAR(100)  NOT NULL,

  -- OAuth-Tokens verschlüsselt (pgcrypto AES via pgp_sym_encrypt)
  access_token_encrypted    BYTEA         NOT NULL,
  refresh_token_encrypted   BYTEA         NOT NULL,
  token_expires_at          TIMESTAMPTZ   NOT NULL,

  -- Gewährte OAuth-Scopes (z.B. {'transactions.history.read','user.profile_readonly'})
  scopes                    TEXT[],

  -- Status: false = manuell deaktiviert oder Token-Refresh fehlgeschlagen
  active                    BOOLEAN       NOT NULL DEFAULT true,

  -- Grund für Deaktivierung (z.B. 'refresh_failed', 'manual_disconnect', 'token_revoked')
  -- Wird bei Reaktivierung via UPSERT auf NULL zurückgesetzt.
  inactive_reason           TEXT,

  -- Zeitstempel
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_used_at              TIMESTAMPTZ   NULL,

  -- Pro Tenant nur ein POS-System des gleichen Typs
  UNIQUE (tenant_id, pos_system)
);

-- Trigger: updated_at automatisch pflegen
CREATE TRIGGER pos_credentials_set_updated_at
BEFORE UPDATE ON pos_credentials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- DECISION: Kein separater idx_pos_credentials_tenant — der UNIQUE-Index auf
-- (tenant_id, pos_system) deckt alle Tenant-Lookups bereits ab.
-- Ein zusätzlicher Index wäre redundant und würde nur Write-Overhead erzeugen.
