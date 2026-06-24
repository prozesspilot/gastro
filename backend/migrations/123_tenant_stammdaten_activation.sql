-- 123_tenant_stammdaten_activation.sql
-- T066/Build-out Phase B — Tenant-Aktivierung bei Stammdaten-Eingabe (Wizard Schritt 1).
--
-- Zweck:
--   1. Stammdaten (Wizard Schritt 1, Spec Onboarding_Wizard.md §2.2) vollständig in
--      echte tenants-Spalten promoten — statt sie nur in onboarding_sessions.step_data
--      als JSON liegen zu lassen. Erst dadurch ist der Mandant ein vollständiger
--      Stammdaten-Record (Adresse/USt-ID/Steuernummer/Branche/… als Spalten).
--   2. list_tenants_for_staff() (Migration 121) um onboarding_status erweitern, damit
--      die Mitarbeiter-Webapp den Aktiv-Status in der Mandanten-Liste anzeigen kann.
--
-- onboarding_status selbst (inkl. 'activated') existiert bereits aus Migration 122 —
-- hier wird NUR die Liste der Stammdaten-Spalten + die Listing-Funktion geändert.
--
-- Rückwärts-kompatibel: alle Spalten ADD COLUMN IF NOT EXISTS + nullable (kein Default
-- nötig, Bestandsdaten bleiben gültig). Rollback in 123_..._rollback.sql.
--
-- Naming: DB-Spalten English snake_case (Konvention §6.2); Enum-WERTE bleiben deutsch
-- (Wire-JSON, z. B. legal_form='einzelunternehmen'). Keine DB-CHECK auf legal_form/
-- industry — SSoT der Enums ist das Zod-Schema in wizard.types.ts (vermeidet eine
-- zweite, driftende Wahrheit, vgl. SKR-Divergenz-Lesson).

-- ---------------------------------------------------------------------------
-- tenants: Stammdaten-Spalten (Wizard Schritt 1)
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_form             VARCHAR(20);   -- rechtsform: 'einzelunternehmen' / 'gbr' / 'ug' / 'gmbh' / 'gmbh_co_kg' / 'sonstige'
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_name             VARCHAR(200);  -- inhaber / Geschäftsführer
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address_street         VARCHAR(200);  -- strasse + Hausnummer
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address_postal_code    VARCHAR(10);   -- plz (validiert 5 Ziffern DE)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address_city           VARCHAR(120);  -- stadt
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vat_id                 VARCHAR(20);   -- ust_id (USt-IdNr., z. B. DE123456789)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_number             VARCHAR(30);   -- steuernummer (Format je Bundesland)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS industry               VARCHAR(20);   -- branche: 'restaurant' / 'cafe' / 'bar' / 'imbiss' / 'foodtruck' / 'catering' / 'sonstige_gastro'
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS employee_count         SMALLINT;      -- mitarbeiter_anzahl (1–50)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS monthly_receipt_volume INTEGER;       -- belegvolumen_monat (0–800, Schätzung)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS advisor_cost_monthly   NUMERIC(10,2); -- steuerberater_kosten_monat (optional)

-- contact_phone weiten: Zod `telefon` erlaubt bis zu 40 Zeichen, Spalte war VARCHAR(30).
-- Weiten ist rückwärts-kompatibel (keine Bestandsdaten betroffen).
ALTER TABLE tenants ALTER COLUMN contact_phone TYPE VARCHAR(40);

-- ---------------------------------------------------------------------------
-- list_tenants_for_staff(): + onboarding_status
--
-- Eine geänderte RETURNS TABLE lässt sich NICHT per CREATE OR REPLACE ändern
-- ("cannot change return type of existing function") → erst DROP, dann CREATE.
-- Sicherheits-Modell unverändert gegenüber Migration 121 (SECURITY DEFINER,
-- LOCAL bypass, fixes search_path, nur nicht-sensible Spalten, REVOKE/GRANT).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS list_tenants_for_staff();

CREATE FUNCTION list_tenants_for_staff()
RETURNS TABLE (
  id                uuid,
  slug              text,
  display_name      text,
  package           text,
  deletion_status   text,
  onboarding_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Aktiviert is_rls_bypassed() nur in dieser DEFINER-Funktion (Owner-Rolle +
  -- app.bypass_rls=on). LOCAL → automatischer Reset am TRANSAKTIONSende.
  PERFORM set_config('app.bypass_rls', 'on', true);

  RETURN QUERY
    SELECT t.id,
           t.slug::text,
           t.display_name::text,
           t.package::text,
           t.deletion_status::text,
           t.onboarding_status::text
      FROM tenants t
     WHERE t.deleted_at IS NULL
     ORDER BY t.display_name;

  -- Defense-in-Depth: Bypass am Funktionsende explizit zurücknehmen.
  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION list_tenants_for_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_tenants_for_staff() TO gastro_app;
