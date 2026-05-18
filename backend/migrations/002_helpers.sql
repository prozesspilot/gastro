-- 002_helpers.sql
-- Cross-cutting Helper-Funktionen für alle Tabellen:
--
-- 1. set_updated_at()       : Trigger, der updated_at auf now() setzt vor jedem UPDATE
-- 2. current_tenant_id()    : liest app.current_tenant (per SET LOCAL gesetzt) als UUID
-- 3. is_rls_bypassed()      : prüft, ob die Session RLS umgehen darf (app.bypass_rls='on')
--
-- Diese Funktionen werden von RLS-Policies und Trigger-Definitionen in den
-- nachfolgenden Migrations referenziert.

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
-- 3. is_rls_bypassed()
--    Erlaubt es Wartungs-Scripten / Bootstrap-Code, RLS gezielt zu umgehen:
--      SET LOCAL app.bypass_rls = 'on';
--    Wird in jeder Policy als ODER-Bedingung mit ausgewertet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_rls_bypassed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN coalesce(current_setting('app.bypass_rls', true), 'off') = 'on';
END;
$$;
