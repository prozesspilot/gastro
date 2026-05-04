import type { Customer, CustomerProfile, EnabledModules } from '../types';
import { apiRequest, unwrap } from './_client';

interface RawCustomer {
  id: string;
  tenant_id: string;
  name?: string;
  display_name?: string;
  created_at: string;
}

function mapCustomer(raw: RawCustomer): Customer {
  return {
    id:           raw.id,
    tenant_id:    raw.tenant_id,
    display_name: raw.display_name ?? raw.name ?? 'Unbenannt',
    created_at:   raw.created_at,
  };
}

export async function getCustomers(tenantId: string): Promise<Customer[]> {
  const raw = await apiRequest<unknown>('/customers?page=1&limit=100', { tenantId });
  const list = unwrap<RawCustomer[]>(raw);
  return list.map(mapCustomer);
}

export async function getCustomer(tenantId: string, customerId: string): Promise<Customer> {
  const raw = await apiRequest<unknown>(`/customers/${customerId}`, { tenantId });
  return mapCustomer(unwrap<RawCustomer>(raw));
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
}

export async function createCustomer(tenantId: string, input: CreateCustomerInput): Promise<Customer> {
  const raw = await apiRequest<unknown>('/customers', {
    method: 'POST',
    body: input,
    tenantId,
  });
  return mapCustomer(unwrap<RawCustomer>(raw));
}

export async function deleteCustomer(tenantId: string, customerId: string): Promise<void> {
  await apiRequest<void>(`/customers/${customerId}`, { method: 'DELETE', tenantId });
}

// ── Profile ──────────────────────────────────────────────────────────────────

interface RawProfile {
  id?: string;
  customer_id?: string;
  tenant_id?: string;
  display_name?: string;
  legal_name?: string;
  tax_id?: string;
  whatsapp_number?: string;
  email?: string;
  enabled_modules?: Partial<EnabledModules> | string[];
  modules_enabled?: string[];
  lexoffice_api_key?: string;
  skr_type?: 'SKR03' | 'SKR04';
  skr_chart?: 'SKR03' | 'SKR04';
  notification_language?: 'de' | 'en';
  whatsapp_confirmation?: boolean;
  whatsapp_monthly_report?: boolean;
  routing?: { skr_chart?: 'SKR03' | 'SKR04' };
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_MODULES: EnabledModules = {
  m01_ingestion: true,
  m02_archiving: true,
  m03_extraction: false,
  m04_categorization: false,
  m05_lexoffice: false,
  m06_portal: false,
  m07_notifications: false,
  m08_reporting: false,
  m09_supplier_comm: false,
};

function modulesFromArray(arr: string[]): EnabledModules {
  // Konzept hatte Codes wie "M01", "M03" — Mapping:
  const m = { ...DEFAULT_MODULES, m01_ingestion: false, m02_archiving: false };
  for (const code of arr) {
    switch (code) {
      case 'M01': m.m01_ingestion = true; break;
      case 'M02': m.m02_archiving = true; break;
      case 'M03': m.m03_extraction = true; break;
      case 'M04': m.m04_categorization = true; break;
      case 'M05': m.m05_lexoffice = true; break;
      case 'M06': m.m06_portal = true; break;
      case 'M07': m.m07_notifications = true; break;
      case 'M08': m.m08_reporting = true; break;
      case 'M09': m.m09_supplier_comm = true; break;
    }
  }
  return m;
}

function mapProfile(raw: RawProfile, customerId: string): CustomerProfile {
  const modulesObj: EnabledModules = (() => {
    if (Array.isArray(raw.enabled_modules)) return modulesFromArray(raw.enabled_modules);
    if (raw.modules_enabled) return modulesFromArray(raw.modules_enabled);
    if (raw.enabled_modules && typeof raw.enabled_modules === 'object') {
      return { ...DEFAULT_MODULES, ...(raw.enabled_modules as EnabledModules) };
    }
    return { ...DEFAULT_MODULES };
  })();

  return {
    id:           raw.id ?? customerId,
    tenant_id:    raw.tenant_id ?? '',
    display_name: raw.display_name ?? '',
    legal_name:   raw.legal_name,
    tax_id:       raw.tax_id,
    whatsapp_number: raw.whatsapp_number,
    email:        raw.email,
    enabled_modules: modulesObj,
    lexoffice_api_key: raw.lexoffice_api_key,
    skr_type:     raw.skr_type ?? raw.skr_chart ?? raw.routing?.skr_chart ?? 'SKR03',
    notification_language: raw.notification_language ?? 'de',
    whatsapp_confirmation: raw.whatsapp_confirmation ?? false,
    whatsapp_monthly_report: raw.whatsapp_monthly_report ?? false,
    created_at: raw.created_at ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? new Date().toISOString(),
  };
}

export async function getCustomerProfile(customerId: string, tenantId?: string): Promise<CustomerProfile> {
  const raw = await apiRequest<unknown>(`/customers/${customerId}/profile`, {
    tenantId,
    optional: true,
  });
  if (raw === undefined) {
    return mapProfile({}, customerId);
  }
  return mapProfile(unwrap<RawProfile>(raw), customerId);
}

export async function updateCustomerProfile(
  customerId: string,
  data: Partial<CustomerProfile>,
  tenantId?: string,
): Promise<CustomerProfile> {
  const raw = await apiRequest<unknown>(`/customers/${customerId}/profile`, {
    method: 'PUT',
    body: data,
    tenantId,
  });
  return mapProfile(unwrap<RawProfile>(raw), customerId);
}

// ── Profile History (Phase 3) ────────────────────────────────────────────────

export interface ProfileHistoryEntry {
  history_id:      string;
  profile_version: number;
  snapshot:        Record<string, unknown>;
  changed_by:      string | null;
  changed_at:      string;
  change_summary:  string | null;
}

export async function getCustomerProfileHistory(
  customerId: string,
  tenantId?: string,
  limit = 20,
): Promise<ProfileHistoryEntry[]> {
  const raw = await apiRequest<unknown>(
    `/customers/${customerId}/profile/history?limit=${limit}`,
    { tenantId },
  );
  const data = unwrap<{ entries?: ProfileHistoryEntry[] }>(raw);
  return data.entries ?? [];
}

export async function testLexofficeConnection(
  customerId: string,
  apiKey: string,
  tenantId?: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const raw = await apiRequest<unknown>('/integrations/lexoffice/test', {
      method: 'POST',
      body: { customer_id: customerId, api_key: apiKey },
      tenantId,
    });
    const result = unwrap<{ ok?: boolean; message?: string }>(raw);
    return { ok: result?.ok ?? true, message: result?.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Verbindung fehlgeschlagen' };
  }
}
