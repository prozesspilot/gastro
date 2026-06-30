/**
 * Tenant-Repository (Rest nach T043).
 *
 * Hinweis: Das frühere CRUD (createTenant/listTenants/findTenantById/updateTenant)
 * war Legacy aus der `customer`-Welt, schrieb/las gegen nicht-existente Spalten
 * (`name`/`active` statt `display_name`/`deletion_status`) und war seit dem
 * A3-Webapp-Reboot (T058) tote, nicht registrierte Hülle — die Live-`/tenants`-
 * Route läuft über `routes/tenants.routes.ts` + die SECURITY-DEFINER-Funktion
 * `list_tenants_for_staff()` (Migration 121). Diese Funktionen wurden in T043
 * entfernt; übrig bleibt nur der eine live genutzte Existenz-Check.
 */

import type { Pool } from 'pg';

/**
 * Prüft, ob ein Mandant mit der gegebenen ID existiert und nicht gelöscht ist.
 *
 * T043: Läuft über die SECURITY-DEFINER-Funktion `tenant_exists()` (Migration 130).
 * Grund: `tenants` hat FORCE RLS mit der Policy `is_rls_bypassed() OR
 * current_tenant_id() = id` (010). Ein nacktes `pool.query` ohne Tenant-Kontext
 * (wie zuvor hier) liefert unter der Prod-Rolle `gastro_app` (NOBYPASSRLS)
 * `current_tenant_id() = NULL` → 0 Zeilen → der Check schlug in Prod IMMER fehl
 * (in Dev/CI unsichtbar, da pp = Superuser RLS umgeht). Die DEFINER-Funktion
 * umgeht RLS transaktions-lokal für genau diesen booleschen Check.
 */
export async function tenantExists(pool: Pool, tenantId: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>('SELECT tenant_exists($1::uuid) AS exists', [
    tenantId,
  ]);
  return result.rows[0]?.exists ?? false;
}
