// Barrel-Export für alle API-Module.
// Pages importieren weiter via `from '../api'` — TypeScript löst auf src/api/index.ts auf.

export {
  apiRequest,
  apiBlob,
  ApiError,
  getActiveTenantId,
  setActiveTenantId,
  unwrap,
} from './_client';
export type { RequestOptions } from './_client';

export {
  getReceipts,
  getReceipt,
  uploadReceipt,
  updateReceiptStatus,
  reprocessReceipt,
  downloadReceipt,
  getReceiptStats,
  mapReceipt,
} from './receipts';
export type { ReceiptFilters, ReceiptStats } from './receipts';

export {
  getCustomers,
  getCustomer,
  createCustomer,
  deleteCustomer,
  getCustomerProfile,
  getCustomerProfileHistory,
  updateCustomerProfile,
  testLexofficeConnection,
} from './customers';
export type { CreateCustomerInput, ProfileHistoryEntry } from './customers';

export { getCategories } from './categories';

export { getTenants, createTenant } from './tenants';

export { fetchHealth, fetchReady, pingUrl } from './health';
export type { HealthResponse, ReadyResponse } from './health';

// ── Backwards-Kompat-Aliase für Code der noch unter alten Namen importiert ───
export {
  getReceipts as fetchReceipts,
  getReceipt as fetchReceipt,
  getReceiptStats as fetchReceiptStats,
  uploadReceipt as createReceipt,
} from './receipts';

export {
  getCustomers as fetchCustomers,
  getCustomer as fetchCustomer,
  getCustomerProfile as fetchProfile,
  updateCustomerProfile as saveProfile,
} from './customers';

export {
  getTenants as fetchTenants,
} from './tenants';

// ── M08 Reporting API ─────────────────────────────────────────────────────────
export {
  buildReport,
  deliverReport,
  getReports,
  downloadReport,
  pushToLexoffice,
} from './reports';
export type { Report, ReportTotals, BuildReportInput, DeliverReportInput } from './reports';

// ── Stats API (Block D) ───────────────────────────────────────────────────────
export {
  getCustomerStats,
} from './stats';
export type {
  CustomerStats,
  ReceiptsByMonth,
  CategoryStat,
  SupplierStat,
  ExportRate,
  ProcessingTimes,
} from './stats';
