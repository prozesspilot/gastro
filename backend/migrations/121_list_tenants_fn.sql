-- 121_list_tenants_fn.sql
-- T058/A3 — SECURITY DEFINER: Cross-Tenant-Listing der Mandanten für die
-- interne Mitarbeiter-Webapp (Tenant-Selector).
--
-- Hintergrund:
--   tenants hat FORCE ROW LEVEL SECURITY (010_tenants.sql) → auch der Tabellen-
--   Owner unterliegt der Policy `is_rls_bypassed() OR current_tenant_id() = id`.
--   Die App-Rolle gastro_app (NOBYPASSRLS) kann tenants daher NICHT cross-tenant
--   lesen. Die Webapp braucht aber genau das: alle Mandanten zur Auswahl.
--
-- Lösung (Muster wie 061_auth_audit_log_insert_fn): SECURITY DEFINER.
--   Die Funktion läuft mit den Rechten des Definers (gastro_owner) und aktiviert
--   is_rls_bypassed() LOKAL (transaktions-lokal) — eng begrenzt auf genau dieses
--   read-only Listing fixer, nicht-sensibler Spalten. Kein genereller Bypass.
--
-- Sicherheits-Modell:
--   - SECURITY DEFINER; Owner = Migrations-Rolle (gastro_owner in Prod).
--   - SET search_path = pg_catalog, public (gegen Search-Path-Hijack).
--   - Keine Parameter → keine Injection-/Filter-Surface, kein dynamisches SQL.
--   - set_config('app.bypass_rls','on', true): LOCAL → nur innerhalb dieser
--     Funktion/Transaktion wirksam; gastro_app bleibt außerhalb NOBYPASSRLS.
--   - Nur fixe, nicht-sensible Spalten (kein contact_email/legal_name etc.).
--   - REVOKE ALL FROM PUBLIC + GRANT EXECUTE nur an gastro_app.

CREATE OR REPLACE FUNCTION list_tenants_for_staff()
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
  -- Aktiviert is_rls_bypassed() nur in dieser DEFINER-Funktion (Owner-Rolle +
  -- app.bypass_rls=on). LOCAL → reset am Statement-/Transaktionsende.
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
END;
$$;

REVOKE ALL ON FUNCTION list_tenants_for_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_tenants_for_staff() TO gastro_app;
