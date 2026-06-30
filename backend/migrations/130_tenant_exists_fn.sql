-- 130_tenant_exists_fn.sql
-- T043 — SECURITY DEFINER: Existenz-Check eines Mandanten für die App-Rolle.
--
-- Hintergrund:
--   tenants hat FORCE ROW LEVEL SECURITY (010_tenants.sql); die SELECT-Policy ist
--   `is_rls_bypassed() OR current_tenant_id() = id` OHNE NULL-Fallback. Die
--   App-Rolle gastro_app (NOBYPASSRLS) sieht eine tenants-Zeile daher NUR, wenn
--   `app.current_tenant` auf genau diese id gesetzt ist. `tenant.repository.ts::
--   tenantExists` machte aber ein nacktes `pool.query` OHNE Tenant-Kontext →
--   current_tenant_id() = NULL → 0 Zeilen → tenantExists lieferte unter gastro_app
--   IMMER false. Folge (latenter Prod-Bug, in Dev/CI unsichtbar, da pp=Superuser
--   RLS umgeht): der M01-Upload-Handler (`upload.handler.ts` → tenantExists) hätte
--   in Production JEDEN Upload mit „tenant not found" abgelehnt.
--
-- Lösung (Muster wie 061/121): eine SECURITY-DEFINER-Funktion, die den Bypass
--   transaktions-lokal aktiviert und einen reinen booleschen Existenz-Check macht.
--
-- Sicherheits-Modell:
--   - SECURITY DEFINER; Owner = Migrations-Rolle (gastro_owner in Prod).
--   - SET search_path = pg_catalog, public (gegen Search-Path-Hijack).
--   - Genau ein typisierter uuid-Parameter, kein dynamisches SQL → keine Injection.
--   - Gibt NUR einen boolean zurück (kein Datenleck cross-tenant).
--   - set_config('app.bypass_rls','on', true): LOCAL → nur innerhalb dieser
--     Funktion/Transaktion; gastro_app bleibt außerhalb NOBYPASSRLS.
--   - REVOKE ALL FROM PUBLIC + GRANT EXECUTE nur an gastro_app.

CREATE OR REPLACE FUNCTION tenant_exists(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Aktiviert is_rls_bypassed() nur in dieser DEFINER-Funktion (Owner-Rolle +
  -- app.bypass_rls=on). LOCAL → automatischer Reset am Transaktionsende.
  PERFORM set_config('app.bypass_rls', 'on', true);

  SELECT EXISTS (
    SELECT 1 FROM tenants WHERE id = p_tenant_id AND deleted_at IS NULL
  ) INTO v_exists;

  -- Defense-in-Depth: Bypass am Funktionsende explizit zurücknehmen, falls ein
  -- künftiger Caller die Funktion innerhalb eines expliziten BEGIN…COMMIT vor
  -- weiteren Statements aufruft.
  PERFORM set_config('app.bypass_rls', 'off', true);
  RETURN v_exists;
END;
$$;

REVOKE ALL ON FUNCTION tenant_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_exists(uuid) TO gastro_app;
