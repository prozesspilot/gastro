-- 002_helpers.sql
-- Cross-cutting Helper-Funktionen für alle Tabellen:
--
-- 1. set_updated_at()         : Trigger, der updated_at auf now() setzt vor jedem UPDATE
-- 2. current_tenant_id()      : liest app.current_tenant als UUID
-- 3. current_user_id()        : liest app.current_user_id als UUID (Mitarbeiter-Session)
-- 4. is_rls_bypassed()        : RLS-Bypass — NUR für Superuser oder Rolle 'gastro_owner'
-- 5. is_audit_maintenance()   : audit_log-Mutation — NUR für Superuser oder Rolle 'gastro_owner'
--
-- Sicherheits-Härtung: is_rls_bypassed und is_audit_maintenance prüfen die
-- aktuelle Rolle, nicht nur GUC-Settings. So kann eine kompromittierte
-- App-Session weder RLS umgehen noch den audit_log mutieren — auch wenn
-- der Angreifer beliebige SET-Befehle absetzen kann.
--
-- Wichtig: das Pattern für GUC-basierte Tenant-Isolation lautet IMMER
-- `set_config('app.current_tenant', '<uuid>', true)` (3. Arg = LOCAL=true)
-- innerhalb einer expliziten Transaktion — NIE plain `SET ...`, sonst leakt
-- der Tenant-Context zwischen Requests im Connection-Pool.

-- ---------------------------------------------------------------------------
-- 1. updated_at-Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. current_tenant_id()
--    Liest die GUC-Variable `app.current_tenant`, die das Backend per
--    `SET LOCAL app.current_tenant = '<uuid>'` setzt, sobald der Request-
--    Context bekannt ist. Gibt NULL zurück, wenn nichts gesetzt ist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_setting text;
BEGIN
  v_setting := current_setting('app.current_tenant', true);
  IF v_setting IS NULL OR v_setting = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_setting::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. current_user_id()
--    Liest die GUC-Variable `app.current_user_id`, die das Backend per
--    `SET LOCAL app.current_user_id = '<uuid>'` setzt, sobald ein eingeloggter
--    Mitarbeiter den Request macht. Gibt NULL zurück, wenn nichts gesetzt ist
--    (z. B. bei Service-to-Service-Calls).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_setting text;
BEGIN
  v_setting := current_setting('app.current_user_id', true);
  IF v_setting IS NULL OR v_setting = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_setting::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. is_rls_bypassed()
--    Gibt NUR DANN true zurück, wenn:
--      (a) die aktuelle Session Superuser ist  ODER
--      (b) die Rolle exakt 'gastro_owner' ist (Migrations-/DBA-Account)
--    UND zusätzlich `app.bypass_rls = 'on'` gesetzt ist.
--
--    Wirkung: Eine kompromittierte App-Session (Rolle 'gastro_app' o. ä.)
--    kann zwar `SET app.bypass_rls = 'on'` ausführen, der Funktionsaufruf
--    liefert aber trotzdem false → RLS-Policies bleiben wirksam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_rls_bypassed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_is_superuser boolean;
  v_is_owner     boolean;
BEGIN
  -- Schritt 1: Rolle prüfen
  v_is_superuser := coalesce(current_setting('is_superuser', true), 'off') = 'on';
  v_is_owner     := current_user = 'gastro_owner';
  IF NOT (v_is_superuser OR v_is_owner) THEN
    RETURN false;
  END IF;
  -- Schritt 2: GUC muss gesetzt sein
  RETURN coalesce(current_setting('app.bypass_rls', true), 'off') = 'on';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. is_audit_maintenance()
--    Eigene Funktion für audit_log-Mutation (UPDATE/DELETE), separat von
--    is_rls_bypassed, damit ein versehentlicher RLS-Bypass nicht automatisch
--    die GoBD-Append-Only-Garantie aushebelt. Vorbedingung:
--      (a) Rolle ist Superuser oder 'gastro_owner'
--      (b) `app.audit_maintenance = 'on'` ist explizit gesetzt
--
--    Damit muss ein DBA für eine audit-Modifikation aktiv ZWEI getrennte
--    GUCs setzen, statt nur einen versehentlich aus einer Bypass-Routine
--    übernommenen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_audit_maintenance()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_is_superuser boolean;
  v_is_owner     boolean;
BEGIN
  v_is_superuser := coalesce(current_setting('is_superuser', true), 'off') = 'on';
  v_is_owner     := current_user = 'gastro_owner';
  IF NOT (v_is_superuser OR v_is_owner) THEN
    RETURN false;
  END IF;
  RETURN coalesce(current_setting('app.audit_maintenance', true), 'off') = 'on';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. valid_module_ids(jsonb)
--    Validiert, dass das JSONB ein Array von bekannten Modul-IDs (M01..M15)
--    ist. Wird vom CHECK-Constraint auf tenant_settings.modules_enabled
--    referenziert. Subqueries in CHECK-Expressions sind in Postgres verboten,
--    deshalb der Umweg über eine IMMUTABLE Function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION valid_module_ids(modules jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'M01','M02','M03','M04','M05','M06','M07',
    'M08','M09','M10','M11','M12','M13','M14','M15'
  ];
  v_elem text;
BEGIN
  IF modules IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(modules) <> 'array' THEN
    RETURN false;
  END IF;
  FOR v_elem IN SELECT jsonb_array_elements_text(modules)
  LOOP
    IF NOT (v_elem = ANY (v_allowed)) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
