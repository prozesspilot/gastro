-- 123_tenant_stammdaten_activation_rollback.sql
-- Rollback für 123_tenant_stammdaten_activation.sql.
--
-- Setzt die Stammdaten-Spalten + die list_tenants_for_staff()-Erweiterung zurück
-- auf den Stand nach Migration 121/122.

-- ---------------------------------------------------------------------------
-- list_tenants_for_staff(): zurück auf die 121-Definition (ohne onboarding_status)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS list_tenants_for_staff();

CREATE FUNCTION list_tenants_for_staff()
RETURNS TABLE (
  id               uuid,
  slug             text,
  display_name     text,
  package          text,
  deletion_status  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('app.bypass_rls', 'on', true);

  RETURN QUERY
    SELECT t.id,
           t.slug::text,
           t.display_name::text,
           t.package::text,
           t.deletion_status::text
      FROM tenants t
     WHERE t.deleted_at IS NULL
     ORDER BY t.display_name;

  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION list_tenants_for_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_tenants_for_staff() TO gastro_app;

-- ---------------------------------------------------------------------------
-- tenants: Stammdaten-Spalten entfernen
-- ---------------------------------------------------------------------------
ALTER TABLE tenants DROP COLUMN IF EXISTS legal_form;
ALTER TABLE tenants DROP COLUMN IF EXISTS owner_name;
ALTER TABLE tenants DROP COLUMN IF EXISTS address_street;
ALTER TABLE tenants DROP COLUMN IF EXISTS address_postal_code;
ALTER TABLE tenants DROP COLUMN IF EXISTS address_city;
ALTER TABLE tenants DROP COLUMN IF EXISTS vat_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS tax_number;
ALTER TABLE tenants DROP COLUMN IF EXISTS industry;
ALTER TABLE tenants DROP COLUMN IF EXISTS employee_count;
ALTER TABLE tenants DROP COLUMN IF EXISTS monthly_receipt_volume;
ALTER TABLE tenants DROP COLUMN IF EXISTS advisor_cost_monthly;

-- contact_phone zurück auf VARCHAR(30). Best-effort: schlägt fehl, falls inzwischen
-- Werte > 30 Zeichen existieren (dann zuerst Daten bereinigen). Weiten war ohnehin
-- der unkritische Teil — beim Rollback bewusst eng gehalten, um den Ausgangszustand
-- exakt wiederherzustellen.
ALTER TABLE tenants ALTER COLUMN contact_phone TYPE VARCHAR(30);
