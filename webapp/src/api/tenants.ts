/**
 * T058/T059 — Mandanten-Liste für den internen Tenant-Selector.
 * Backend: GET /api/v1/tenants (Staff-Cross-Tenant, SECURITY DEFINER).
 */
import { apiRequest, unwrap } from './_client';

export interface TenantListItem {
  id: string;
  slug: string;
  display_name: string;
  package: string;
  deletion_status: string;
}

export async function getTenants(): Promise<TenantListItem[]> {
  const raw = await apiRequest<unknown>('/tenants');
  return unwrap<TenantListItem[]>(raw);
}
