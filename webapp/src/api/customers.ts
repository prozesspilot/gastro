import type { Customer, CustomerProfile, EnabledModules, ImapConfig, OcrProvider } from '../types';
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
  // Flache Felder (Legacy / direktes Backend-Format)
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
  // JSONB-Felder (Backend-Format nach PUT)
  integrations?: {
    lexoffice_api_key?: string;
    notification_language?: 'de' | 'en';
    whatsapp_confirmation?: boolean;
    whatsapp_monthly_report?: boolean;
    imap?: ImapConfig;
    // OCR
    ocr_provider?: OcrProvider;
    ocr_api_key?: string;
    // DATEV
    datev_berater_nr?: string;
    datev_mandanten_nr?: string;
    datev_export_email?: string;
    // sevDesk
    sevdesk_api_token?: string;
    // Steuerberater
    tax_advisor_email?: string;
  };
  custom?: {
    display_name?: string;
    legal_name?: string;
    tax_id?: string;
    email?: string;
    whatsapp_number?: string;
  };
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
  const m = { ...DEFAULT_MODULES, m01_ingestion: false, m02_archiving: false };
  for (const code of arr) {
    switch (code) {
      // Legacy-Format (M01, M02, …)
      case 'M01': case 'm01_ingestion':      m.m01_ingestion = true; break;
      case 'M02': case 'm02_archiving':      m.m02_archiving = true; break;
      case 'M03': case 'm03_extraction':     m.m03_extraction = true; break;
      case 'M04': case 'm04_categorization': m.m04_categorization = true; break;
      case 'M05': case 'm05_lexoffice':      m.m05_lexoffice = true; break;
      case 'M06': case 'm06_portal':         m.m06_portal = true; break;
      case 'M07': case 'm07_notifications':  m.m07_notifications = true; break;
      case 'M08': case 'm08_reporting':      m.m08_reporting = true; break;
      case 'M09': case 'm09_supplier_comm':  m.m09_supplier_comm = true; break;
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

  // Lese aus JSONB-Feldern (Backend-Format) oder flachen Feldern (Legacy)
  const intg = raw.integrations ?? {};
  const cust = raw.custom ?? {};

  return {
    id:           raw.id ?? raw.customer_id ?? customerId,
    tenant_id:    raw.tenant_id ?? '',
    display_name: raw.display_name ?? cust.display_name ?? '',
    legal_name:   raw.legal_name   ?? cust.legal_name,
    tax_id:       raw.tax_id       ?? cust.tax_id,
    whatsapp_number: raw.whatsapp_number ?? cust.whatsapp_number,
    email:        raw.email        ?? cust.email,
    enabled_modules: modulesObj,
    lexoffice_api_key: raw.lexoffice_api_key ?? intg.lexoffice_api_key,
    imap:         intg.imap,
    skr_type:     raw.skr_type ?? raw.skr_chart ?? raw.routing?.skr_chart ?? 'SKR03',
    notification_language: raw.notification_language ?? intg.notification_language ?? 'de',
    whatsapp_confirmation:   raw.whatsapp_confirmation   ?? intg.whatsapp_confirmation   ?? false,
    whatsapp_monthly_report: raw.whatsapp_monthly_report ?? intg.whatsapp_monthly_report ?? false,
    // OCR
    ocr_provider: intg.ocr_provider,
    ocr_api_key:  intg.ocr_api_key,
    // DATEV
    datev_berater_nr:   intg.datev_berater_nr,
    datev_mandanten_nr: intg.datev_mandanten_nr,
    datev_export_email: intg.datev_export_email,
    // sevDesk
    sevdesk_api_token: intg.sevdesk_api_token,
    // Steuerberater
    tax_advisor_email: intg.tax_advisor_email,
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
  // Transformiere CustomerProfile → Backend-Format (modules_enabled + JSONB-Felder)
  const modules = data.enabled_modules ?? {};
  const body = {
    modules_enabled: Object.entries(modules)
      .filter(([, on]) => on)
      .map(([key]) => key),
    integrations: {
      lexoffice_api_key:       data.lexoffice_api_key       ?? null,
      notification_language:   data.notification_language   ?? 'de',
      whatsapp_confirmation:   data.whatsapp_confirmation   ?? false,
      whatsapp_monthly_report: data.whatsapp_monthly_report ?? false,
      imap:                    data.imap                    ?? null,
      // OCR
      ocr_provider:            data.ocr_provider            ?? null,
      ocr_api_key:             data.ocr_api_key             ?? null,
      // DATEV
      datev_berater_nr:        data.datev_berater_nr        ?? null,
      datev_mandanten_nr:      data.datev_mandanten_nr      ?? null,
      datev_export_email:      data.datev_export_email      ?? null,
      // sevDesk
      sevdesk_api_token:       data.sevdesk_api_token       ?? null,
      // Steuerberater
      tax_advisor_email:       data.tax_advisor_email       ?? null,
    },
    routing: {
      skr_chart: data.skr_type ?? 'SKR03',
    },
    custom: {
      display_name:    data.display_name    ?? null,
      legal_name:      data.legal_name      ?? null,
      tax_id:          data.tax_id          ?? null,
      email:           data.email           ?? null,
      whatsapp_number: data.whatsapp_number ?? null,
    },
    change_summary: 'Profil über Webapp gespeichert',
  };

  const raw = await apiRequest<unknown>(`/customers/${customerId}/profile`, {
    method: 'PUT',
    body,
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
