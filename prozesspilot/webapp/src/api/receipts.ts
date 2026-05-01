import type {
  CategorizationMethod,
  CategorizationResult,
  ExtractedData,
  ExtractedLineItem,
  Receipt,
  ReceiptFileType,
  ReceiptStatus,
} from '../types';
import { apiBlob, apiRequest, unwrap } from './_client';

// ── Backend-Mapper ────────────────────────────────────────────────────────────
// Das Backend speichert Belege im Konzept-Schema (extraction.fields, etc.).
// Hier mappen wir auf das schlankere User-Schema, das die Webapp nutzt.

interface RawTaxLine { rate?: number; amount?: number; }
interface RawLineItem { description?: string; total?: number; qty?: number; quantity?: number; amount?: number; }

interface RawExtractionFields {
  supplier_name?: string;
  supplier_address?: string;
  document_number?: string;
  document_date?: string;
  total_gross?: number;
  total_net?: number;
  tax_lines?: RawTaxLine[];
  line_items?: RawLineItem[];
  payment_method?: string;
  currency?: string;
}

interface RawExtraction {
  confidence?: number;
  raw_text?: string;
  fields?: RawExtractionFields;
}

interface RawCategorization {
  category?: string;
  category_label?: string;
  confidence?: number;
  engine?: string;
  rationale?: string;
  skr_account?: string;
  skr03_konto?: string;
  skr04_konto?: string;
}

interface RawArchive { path?: string; }

interface RawExport {
  target?: string;
  status?: string;
  external_id?: string;
  pushed_at?: string;
}

interface RawReceipt {
  id?: string;
  receipt_id?: string;
  tenant_id?: string;
  customer_id: string;
  status: string;
  file_name?: string;
  original_name?: string;
  file_type?: string;
  mime_type?: string;
  file_size?: number;
  file_size_bytes?: number;
  original_path?: string;
  storage_key?: string;
  archive_path?: string;
  extracted_data?: ExtractedData;
  extraction?: RawExtraction;
  categorization?: CategorizationResult | RawCategorization;
  archive?: RawArchive;
  exports?: RawExport[];
  lexoffice_export?: Receipt['lexoffice_export'];
  datev_export?: Receipt['datev_export'];
  requires_review_reason?: string;
  processing_started_at?: string;
  processing_completed_at?: string;
  metadata?: { extraction?: RawExtraction; categorization?: RawCategorization };
  created_at: string;
  updated_at: string;
}

const FILE_TYPES: ReceiptFileType[] = ['pdf', 'jpg', 'jpeg', 'png', 'heic'];

function mimeToFileType(mime: string | undefined, fallbackName?: string): ReceiptFileType {
  if (mime) {
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('heic') || mime.includes('heif')) return 'heic';
  }
  if (fallbackName) {
    const ext = fallbackName.split('.').pop()?.toLowerCase();
    if (ext && (FILE_TYPES as string[]).includes(ext)) return ext as ReceiptFileType;
  }
  return 'pdf';
}

function mapExtraction(raw: RawExtraction | undefined): ExtractedData | undefined {
  if (!raw) return undefined;
  const f = raw.fields ?? {};
  const lineItems: ExtractedLineItem[] | undefined = f.line_items?.map((li) => ({
    description: li.description ?? '',
    amount: li.total ?? li.amount ?? 0,
    quantity: li.qty ?? li.quantity,
  }));
  const taxLine = f.tax_lines?.[0];
  return {
    vendor_name:     f.supplier_name,
    vendor_address:  f.supplier_address,
    invoice_date:    f.document_date,
    invoice_number:  f.document_number,
    total_amount:    f.total_gross,
    tax_amount:      taxLine?.amount,
    tax_rate:        taxLine?.rate,
    line_items:      lineItems,
    payment_method:  f.payment_method,
    currency:        f.currency,
    confidence:      raw.confidence ?? 0,
    raw_text:        raw.raw_text,
  };
}

function mapCategorization(
  raw: CategorizationResult | RawCategorization | undefined,
): CategorizationResult | undefined {
  if (!raw) return undefined;

  if ('category_id' in raw && raw.category_id) {
    return raw as CategorizationResult;
  }

  const r = raw as RawCategorization;
  let method: CategorizationMethod = 'ai';
  if (r.engine === 'override') method = 'override';
  else if (r.engine === 'master_data') method = 'master_data';

  return {
    category_id:   r.category ?? '',
    category_name: r.category_label ?? r.category ?? '',
    skr03_konto:   r.skr03_konto ?? r.skr_account,
    skr04_konto:   r.skr04_konto,
    confidence:    r.confidence ?? 0,
    method,
    ai_reasoning:  r.rationale,
  };
}

function mapLexofficeExport(rawList: RawExport[] | undefined): Receipt['lexoffice_export'] {
  const lex = rawList?.find((e) => e.target === 'lexoffice' && e.status === 'pushed');
  if (!lex) return undefined;
  return {
    voucher_id:  lex.external_id ?? '',
    exported_at: lex.pushed_at ?? '',
    status:      lex.status ?? 'pushed',
  };
}

export function mapReceipt(raw: RawReceipt): Receipt {
  const extracted = raw.extracted_data
    ?? mapExtraction(raw.extraction ?? raw.metadata?.extraction);
  const categorization = mapCategorization(raw.categorization ?? raw.metadata?.categorization);
  return {
    id:            raw.id ?? raw.receipt_id ?? '',
    tenant_id:     raw.tenant_id ?? '',
    customer_id:   raw.customer_id,
    status:        raw.status as ReceiptStatus,
    file_name:     raw.file_name ?? raw.original_name ?? 'unbenannt',
    file_type:     (raw.file_type as ReceiptFileType) ?? mimeToFileType(raw.mime_type, raw.original_name),
    file_size:     raw.file_size ?? raw.file_size_bytes ?? 0,
    original_path: raw.original_path ?? raw.storage_key ?? '',
    archive_path:  raw.archive_path ?? raw.archive?.path,
    extracted_data: extracted,
    categorization,
    lexoffice_export: raw.lexoffice_export ?? mapLexofficeExport(raw.exports),
    datev_export:     raw.datev_export,
    requires_review_reason:   raw.requires_review_reason,
    processing_started_at:    raw.processing_started_at,
    processing_completed_at:  raw.processing_completed_at,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ReceiptFilters {
  status?: ReceiptStatus | 'all';
  customerId?: string;
  search?: string;
}

export async function getReceipts(
  customerId: string | undefined,
  filters: ReceiptFilters = {},
): Promise<Receipt[]> {
  const params = new URLSearchParams();
  if (customerId) params.append('customer_id', customerId);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);

  const path = params.toString() ? `/receipts?${params.toString()}` : '/receipts';
  const raw = await apiRequest<unknown>(path);
  const data = unwrap<{ receipts?: RawReceipt[] } | RawReceipt[]>(raw);

  const list: RawReceipt[] = Array.isArray(data)
    ? data
    : (data?.receipts ?? []);

  return list.map(mapReceipt);
}

export async function getReceipt(receiptId: string): Promise<Receipt> {
  const raw = await apiRequest<unknown>(`/receipts/${receiptId}`);
  return mapReceipt(unwrap<RawReceipt>(raw));
}

export async function uploadReceipt(customerId: string, file: File): Promise<Receipt> {
  // Backend hat (noch) keinen Multipart-Upload — wir legen den Datensatz an, der
  // die Datei-Metadaten kennt. Tatsächlicher Datei-Upload läuft separat (M01).
  const raw = await apiRequest<unknown>('/receipts', {
    method: 'POST',
    body: {
      customer_id:   customerId,
      original_name: file.name,
      mime_type:     file.type,
      source:        'manual',
    },
  });
  return mapReceipt(unwrap<RawReceipt>(raw));
}

export async function updateReceiptStatus(receiptId: string, status: ReceiptStatus): Promise<Receipt> {
  const raw = await apiRequest<unknown>(`/receipts/${receiptId}/status`, {
    method: 'PUT',
    body: { status },
  });
  return mapReceipt(unwrap<RawReceipt>(raw));
}

export async function reprocessReceipt(receiptId: string): Promise<Receipt> {
  const raw = await apiRequest<unknown>(`/receipts/${receiptId}/reprocess`, {
    method: 'POST',
    body: {},
  });
  return mapReceipt(unwrap<RawReceipt>(raw));
}

export async function downloadReceipt(receiptId: string): Promise<Blob> {
  return apiBlob(`/receipts/${receiptId}/download`);
}

// ── Stats (ältere Endpoint, weiter genutzt von Stats/Dashboard) ──────────────

export interface ReceiptStats {
  total: number;
  today: number;
  by_status: Record<string, number>;
  by_source?: Record<string, number>;
  this_week_count?: number;
  this_month_count?: number;
}

export async function getReceiptStats(tenantId?: string): Promise<ReceiptStats> {
  const raw = await apiRequest<unknown>('/receipts/stats', { tenantId });
  return unwrap<ReceiptStats>(raw);
}
