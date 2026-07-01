/**
 * T058/A3 — Repository für das Staff-Tenant-Listing.
 *
 * Liest die Mandanten cross-tenant über die SECURITY-DEFINER-Funktion
 * `list_tenants_for_staff()` (Migration 121, erweitert um onboarding_status in 123)
 * — NICHT direkt aus `tenants` (FORCE RLS blockt das für gastro_app).
 */

import type { Pool } from 'pg';

export interface TenantListItem {
  id: string;
  slug: string;
  display_name: string;
  package: string;
  deletion_status: string;
  /** Onboarding-FSM: 'pending' | 'wizard_started' | 'wizard_done' | 'activated' (Migration 122/123). */
  onboarding_status: string;
}

export async function listTenantsForStaff(pool: Pool): Promise<TenantListItem[]> {
  const { rows } = await pool.query<TenantListItem>(
    'SELECT id, slug, display_name, package, deletion_status, onboarding_status FROM list_tenants_for_staff()',
  );
  return rows;
}

export type TenantPackage = 'solo' | 'standard' | 'pro' | 'filiale';

export interface CreateTenantInput {
  slug: string;
  displayName: string;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  package: TenantPackage;
}

/**
 * T093 — Legt einen neuen Mandanten an (Staff-Tool „Neuer Kunde").
 *
 * Schreibt cross-tenant über die SECURITY-DEFINER-Funktion
 * `create_tenant_for_staff()` (Migration 131) — NICHT per direktem INSERT, weil
 * `tenants` FORCE RLS hat und `gastro_app` (NOBYPASSRLS) sonst blockiert würde
 * (siehe listTenantsForStaff / tenant_exists, gleiche Landmine).
 *
 * Wirft bei Slug-Kollision den nativen pg-Fehler mit `.code === '23505'` durch
 * (UNIQUE-Verletzung auf `tenants.slug`) — der Route-Handler bildet das auf 409 ab.
 */
export async function createTenant(pool: Pool, input: CreateTenantInput): Promise<TenantListItem> {
  const { rows } = await pool.query<TenantListItem>(
    `SELECT id, slug, display_name, package, deletion_status, onboarding_status
       FROM create_tenant_for_staff($1, $2, $3, $4, $5, $6)`,
    [
      input.slug,
      input.displayName,
      input.legalName ?? '',
      input.contactEmail ?? '',
      input.contactPhone ?? '',
      input.package,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('create_tenant_for_staff lieferte keine Zeile zurück.');
  }
  return row;
}
