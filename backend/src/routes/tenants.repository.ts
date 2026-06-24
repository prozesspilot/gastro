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
