// ── Receipt-Lifecycle ────────────────────────────────────────────────────────

export type ReceiptStatus =
  | 'received'
  | 'extracting'
  | 'extracted'
  | 'categorizing'
  | 'categorized'
  | 'archiving'
  | 'archived'
  | 'exporting'
  | 'exported'
  | 'completed'
  | 'requires_review'
  | 'error'
  // Legacy-Werte (Backend-Kompatibilität)
  | 'pending'
  | 'processing'
  | 'done';

export type ReceiptFileType = 'pdf' | 'jpg' | 'jpeg' | 'png' | 'heic';

// ── Extracted Data (M03) ─────────────────────────────────────────────────────

export interface ExtractedLineItem {
  description: string;
  amount: number;
  quantity?: number;
}

export interface ExtractedData {
  vendor_name?: string;
  vendor_address?: string;
  invoice_date?: string;
  invoice_number?: string;
  total_amount?: number;
  tax_amount?: number;
  tax_rate?: number;
  line_items?: ExtractedLineItem[];
  payment_method?: string;
  currency?: string;
  confidence: number; // 0.0 bis 1.0
  raw_text?: string;
}

// ── Categorization (M04) ─────────────────────────────────────────────────────

export type CategorizationMethod = 'override' | 'master_data' | 'ai';

export interface CategorizationResult {
  category_id: string;
  category_name: string;
  skr03_konto?: string;
  skr04_konto?: string;
  confidence: number;
  method: CategorizationMethod;
  ai_reasoning?: string;
}

// ── Export-Marker ────────────────────────────────────────────────────────────

export interface LexofficeExport {
  voucher_id: string;
  exported_at: string;
  status: string;
}

export interface DatevExport {
  file_path: string;
  exported_at: string;
}

// ── Receipt ──────────────────────────────────────────────────────────────────

export interface Receipt {
  id: string;
  tenant_id: string;
  customer_id: string;
  status: ReceiptStatus;
  file_name: string;
  file_type: ReceiptFileType;
  file_size: number;
  original_path: string;
  archive_path?: string;
  extracted_data?: ExtractedData;
  categorization?: CategorizationResult;
  lexoffice_export?: LexofficeExport;
  datev_export?: DatevExport;
  requires_review_reason?: string;
  processing_started_at?: string;
  processing_completed_at?: string;
  created_at: string;
  updated_at: string;
}

// ── Customer Profile ─────────────────────────────────────────────────────────

export interface EnabledModules {
  m01_ingestion: boolean;
  m02_archiving: boolean;
  m03_extraction: boolean;
  m04_categorization: boolean;
  m05_lexoffice: boolean;
  m06_portal: boolean;
  m07_notifications: boolean;
  m08_reporting: boolean;
  m09_supplier_comm: boolean;
}

export type SkrType = 'SKR03' | 'SKR04';
export type NotificationLanguage = 'de' | 'en';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  folder: string;
}

export type OcrProvider = 'mindee' | 'google_vision' | 'openai';

export interface CustomerProfile {
  id: string;
  tenant_id: string;
  display_name: string;
  legal_name?: string;
  tax_id?: string;
  whatsapp_number?: string;
  email?: string;
  enabled_modules: EnabledModules;
  lexoffice_api_key?: string;
  imap?: ImapConfig;
  skr_type?: SkrType;
  notification_language?: NotificationLanguage;
  whatsapp_confirmation?: boolean;
  whatsapp_monthly_report?: boolean;
  // OCR-Konfiguration (M03)
  ocr_provider?: OcrProvider;
  ocr_api_key?: string;
  // DATEV-Konfiguration (M04)
  datev_berater_nr?: string;
  datev_mandanten_nr?: string;
  datev_export_email?: string;
  // sevDesk-Konfiguration (M06)
  sevdesk_api_token?: string;
  // Steuerberater-E-Mail (Ziel des DATEV-Exports)
  tax_advisor_email?: string;
  created_at: string;
  updated_at: string;
}

// ── Category ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  skr03_konto?: string;
  skr04_konto?: string;
  description?: string;
  is_system: boolean;
}

// ── Tenant & Customer ────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  display_name: string;
  created_at: string;
}

// ── API ──────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: { total?: number; page?: number; pageSize?: number };
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// ── Module-Metadata für UI ───────────────────────────────────────────────────

export type ModuleKey = keyof EnabledModules;

export const MODULE_META: Record<ModuleKey, {
  id: string;
  label: string;
  description: string;
  requires?: ModuleKey[];
}> = {
  m01_ingestion:      { id: 'M01', label: 'Belegempfang',           description: 'Empfängt Belege per WhatsApp/Upload, legt sie an' },
  m02_archiving:      { id: 'M02', label: 'Archivierung',           description: 'Speichert Original-Belege im Archiv (S3/MinIO)' },
  m03_extraction:     { id: 'M03', label: 'OCR & Extraktion',       description: 'Liest Beleg-Felder per Google Vision' },
  m04_categorization: { id: 'M04', label: 'KI-Kategorisierung',     description: 'Schlägt SKR-Konto via Claude/Stammdaten/Override vor', requires: ['m03_extraction'] },
  m05_lexoffice:      { id: 'M05', label: 'Lexoffice-Export',       description: 'Pusht Belege als Voucher an Lexoffice', requires: ['m04_categorization'] },
  m06_portal:         { id: 'M06', label: 'Steuerberater-Portal',   description: 'Multi-Tenant-Portal für Steuerberater' },
  m07_notifications:  { id: 'M07', label: 'WhatsApp-Bestätigung',   description: 'Sendet Status-Updates per WhatsApp zurück' },
  m08_reporting:      { id: 'M08', label: 'Monatsreporting',        description: 'Erstellt monatliche PDF-Berichte', requires: ['m07_notifications'] },
  m09_supplier_comm:  { id: 'M09', label: 'Lieferanten-Komm.',      description: 'Fragt fehlende Belege bei Lieferanten an' },
};
