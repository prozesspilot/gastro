-- 131_create_tenant_fn.sql
-- T093 — Mitarbeiter-Tool „Neuer Kunde": SECURITY-DEFINER-Anlage eines neuen Tenants.
--
-- Warum eine DEFINER-Funktion (und kein direkter INSERT im Backend):
--   `tenants` hat FORCE ROW LEVEL SECURITY mit der Policy `tenants_write_bypass`
--   (FOR ALL USING/WITH CHECK is_rls_bypassed(), Migration 010). Ein INSERT unter
--   der Prod-Rolle `gastro_app` (NOBYPASSRLS) schlägt daran IMMER fehl (in Dev/CI
--   unsichtbar, da `pp` = Superuser RLS umgeht — dieselbe Landmine wie bei
--   tenant_exists()/T043). Die Anlage läuft deshalb — analog zu
--   list_tenants_for_staff() (121/123) — über diese Funktion, die den Bypass
--   transaktions-lokal (LOCAL → Auto-Reset am Transaktionsende) aktiviert.
--
-- Rückgabe: dieselbe Spaltenform wie list_tenants_for_staff(), damit die Webapp
-- den neuen Mandanten ohne zweiten Roundtrip direkt in die Liste einreihen kann.
--
-- Rückwärts-kompatibel: nur eine neue Funktion, kein Schema-Change an Bestandsdaten.
-- `onboarding_status` bleibt auf dem Tabellen-Default 'pending' (Migration 122),
-- `deletion_status` auf 'active' (010). Rollback in 131_create_tenant_fn_rollback.sql.

CREATE FUNCTION create_tenant_for_staff(
  p_slug          text,
  p_display_name  text,
  p_legal_name    text,
  p_contact_email text,
  p_contact_phone text,
  p_package       text
)
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
  -- Bypass NUR in dieser DEFINER-Funktion aktivieren (Owner-Rolle + app.bypass_rls=on).
  PERFORM set_config('app.bypass_rls', 'on', true);

  RETURN QUERY
    WITH inserted AS (
      INSERT INTO tenants (slug, display_name, legal_name, contact_email, contact_phone, package)
      VALUES (
        p_slug,
        p_display_name,
        NULLIF(p_legal_name, ''),
        NULLIF(p_contact_email, '')::citext,
        NULLIF(p_contact_phone, ''),
        p_package
      )
      RETURNING
        tenants.id,
        tenants.slug,
        tenants.display_name,
        tenants.package,
        tenants.deletion_status,
        tenants.onboarding_status
    )
    SELECT
      inserted.id,
      inserted.slug::text,
      inserted.display_name::text,
      inserted.package::text,
      inserted.deletion_status::text,
      inserted.onboarding_status::text
    FROM inserted;

  -- Defense-in-Depth: Bypass am Funktionsende explizit zurücknehmen.
  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION create_tenant_for_staff(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_for_staff(text, text, text, text, text, text) TO gastro_app;
