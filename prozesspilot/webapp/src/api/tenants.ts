import type { Tenant } from '../types';
import { apiRequest, unwrap } from './_client';

interface RawTenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export async function getTenants(): Promise<Tenant[]> {
  const raw = await apiRequest<unknown>('/tenants?page=1&limit=50');
  const list = unwrap<RawTenant[]>(raw);
  return list.map((t) => ({
    id:         t.id,
    name:       t.name,
    slug:       t.slug,
    created_at: t.created_at,
  }));
}

export async function createTenant(input: { slug: string; name: string }): Promise<Tenant> {
  const raw = await apiRequest<unknown>('/tenants', {
    method: 'POST',
    body: input,
  });
  return unwrap<Tenant>(raw);
}
