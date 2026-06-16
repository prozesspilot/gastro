// Barrel-Export für die lebenden API-Module (belege-Welt, A3-Reboot T059).
// Alte Kunden-/Beleg-Welt-Module wurden im Reboot entfernt.

export {
  apiRequest,
  apiBlob,
  ApiError,
  getActiveTenantId,
  setActiveTenantId,
  unwrap,
} from './_client';
export type { RequestOptions } from './_client';

export { getCategories } from './categories';

export { getTenants } from './tenants';
export type { TenantListItem } from './tenants';

export { fetchHealth, fetchReady, pingUrl } from './health';
export type { HealthResponse, ReadyResponse } from './health';
