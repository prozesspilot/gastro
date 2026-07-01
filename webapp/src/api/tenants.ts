/**
 * T058/T059 — Mandanten-Liste für den internen Tenant-Selector.
 * T093       — Mandanten-Anlage („Neuer Kunde").
 * Backend: GET/POST /api/v1/tenants (Staff-Cross-Tenant, SECURITY DEFINER).
 */
import { apiRequest, unwrap } from './_client';

export interface TenantListItem {
  id: string;
  slug: string;
  display_name: string;
  package: string;
  deletion_status: string;
  /** Onboarding-FSM: 'pending' | 'wizard_started' | 'wizard_done' | 'activated'. */
  onboarding_status: string;
}

export type TenantPackage = 'solo' | 'standard' | 'pro' | 'filiale';

/** Eingabe für die Mandanten-Anlage. Leere optionale Felder werden weggelassen. */
export interface CreateTenantInput {
  display_name: string;
  legal_name?: string;
  contact_email?: string;
  contact_phone?: string;
  package: TenantPackage;
  /** Optional — leer lassen, dann generiert das Backend den Slug aus dem Namen. */
  slug?: string;
}

export async function getTenants(): Promise<TenantListItem[]> {
  const raw = await apiRequest<unknown>('/tenants');
  return unwrap<TenantListItem[]>(raw);
}

export async function createTenant(input: CreateTenantInput): Promise<TenantListItem> {
  const raw = await apiRequest<unknown>('/tenants', { method: 'POST', body: input });
  return unwrap<TenantListItem>(raw);
}
