-- 121_pos_cron_security_definer_fns.sql
-- T022 — SECURITY DEFINER Hilfsfunktionen fuer POS-Cron-Queries.
--
-- Hintergrund:
--   Zwei Cron-Pfade in M15 greifen cross-tenant auf pos_credentials zu:
--     1. listActiveSumUpTenants  (Daily-Sync, kasse-transactions.repository.ts)
--     2. purgeInactivePosCredentials (DSGVO-Cleanup, pos.repository.ts)
--
--   Aktuell funktionieren beide NUR, weil pos_credentials (Migration 022) noch
--   keine RLS-Policy hat. Sobald T020/T026 RLS auf pos_credentials aktiviert,
--   liefern beide Crons als gastro_app ein SILENT-EMPTY-Result.
--
--   set_config('app.bypass_rls', 'on') ist fuer gastro_app wirkungslos:
--   is_rls_bypassed() prueft zusaetzlich current_user = 'gastro_owner'.
--
-- Loesung (Option B — SECURITY DEFINER, analog 061_auth_audit_log_insert_fn.sql):
--   Die Funktionen laufen mit den Rechten des Definers (gastro_owner). Da
--   is_rls_bypassed() dann current_user = 'gastro_owner' sieht UND wir
--   app.bypass_rls = 'on' setzen, greift der Bypass korrekt.
--
-- Sicherheits-Modell:
--   - Nur gastro_app darf EXECUTE aufrufen (kein PUBLIC-Grant).
--   - search_path ist explizit gesetzt (verhindert Search-Path-Injection).
--   - Alle Parameter sind typisiert — keine dynamische SQL.
--   - Funktionen liefern nur die Minimalmenge an Daten (tenant_id + account_id
--     fuer die Sync-Funktion; id + tenant_id + Metadaten fuer die Delete-Funktion).
--
-- WICHTIG — Rollback:
--   DROP FUNCTION IF EXISTS get_active_sumup_tenants();
--   DROP FUNCTION IF EXISTS delete_inactive_pos_credentials(int);

-- ---------------------------------------------------------------------------
-- 1. get_active_sumup_tenants()
--    Gibt alle aktiven pos_credentials-Rows fuer pos_system = 'sumup_lite'
--    zurueck. Wird von listActiveSumUpTenants (Daily-Cron) aufgerufen.
--    Laeuft als gastro_owner → umgeht RLS auf pos_credentials (sobald aktiv).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_active_sumup_tenants()
RETURNS TABLE(tenant_id uuid, pos_account_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass-Flag setzen (gastro_owner-Rolle + GUC = is_rls_bypassed() = true)
  PERFORM set_config('app.bypass_rls', 'on', true);

  RETURN QUERY
    SELECT pc.tenant_id, pc.pos_account_id::text
      FROM pos_credentials pc
     WHERE pc.active = true
       AND pc.pos_system = 'sumup_lite';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. delete_inactive_pos_credentials(p_retention_days int)
--    Loescht alle inaktiven pos_credentials, die seit mindestens p_retention_days
--    Tagen nicht mehr aktualisiert wurden. Gibt die geloeschten Rows zurueck
--    (fuer Audit-Logging im App-Layer).
--    Laeuft als gastro_owner → umgeht RLS auf pos_credentials (sobald aktiv).
--
--    DECISION (T022, 2026-06-01):
--    Das Audit-Logging (audit_log-INSERT) verbleibt im App-Layer (TypeScript),
--    weil logAuditEvent() dort bereits korrekt mit Tenant-Context + Transaktion
--    arbeitet. Diese Funktion liefert nur die DELETE-RETURNING-Rows. Der App-
--    Code schreibt anschliessend den Audit-Log in derselben Transaktion.
--    Vorteil: keine SQL-zu-JSON-Serialisierung fuer actor/payload in PL/pgSQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_inactive_pos_credentials(p_retention_days int)
RETURNS TABLE(
  id              uuid,
  tenant_id       uuid,
  pos_system      text,
  pos_account_id  text,
  inactive_reason text,
  updated_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass-Flag setzen (gastro_owner-Rolle + GUC = is_rls_bypassed() = true)
  PERFORM set_config('app.bypass_rls', 'on', true);

  RETURN QUERY
    DELETE FROM pos_credentials
     WHERE active = false
       AND updated_at < now() - (p_retention_days::int * INTERVAL '1 day')
    RETURNING
      pos_credentials.id,
      pos_credentials.tenant_id,
      pos_credentials.pos_system::text,
      pos_credentials.pos_account_id::text,
      pos_credentials.inactive_reason::text,
      pos_credentials.updated_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- Berechtigungen: nur gastro_app darf aufrufen, kein PUBLIC-Grant.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION get_active_sumup_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_active_sumup_tenants() TO gastro_app;

REVOKE ALL ON FUNCTION delete_inactive_pos_credentials(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_inactive_pos_credentials(int) TO gastro_app;
