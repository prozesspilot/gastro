/**
 * API-Client für M01 Beleg-Upload (neue /belege-Endpoints).
 *
 * Unterscheidet sich von receipts.ts (alte API) — NICHT vermischen.
 * Backend-Spec: POST /api/v1/belege/upload, GET /api/v1/belege, GET /api/v1/belege/:id
 */

import { apiRequest } from './_client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BelegStatus =
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
  | 'error';

export type BelegSourceChannel =
  | 'manual_upload'
  | 'whatsapp'
  | 'email'
  | 'web_chat'
  | 'api'
  | 'sumup';

/**
 * T015: payload-Schema (vom Backend nach OCR befuellt). Felder unsicher —
 * nicht alle Belege haben extraction+validation (z. B. nach Upload ohne OCR).
 */
export interface BelegPayload {
  extraction?: {
    engine?: string;
    engine_version?: string;
    confidence?: number;
    raw_text?: string;
    fields?: {
      supplier_name?: string;
      document_date?: string;
      total_gross?: number;
      currency?: string;
      tax_rate?: number;
      ocr_confidence?: number;
      bewirtung_anlass?: string;
      bewirtung_teilnehmer?: string;
      /** Pro-Feld-Konfidenz vom OCR-Service (T007). */
      fields_confidence?: {
        supplier_name?: number;
        document_date?: number;
        total_gross?: number;
      };
    };
  };
  validation?: {
    is_valid?: boolean;
    issues?: Array<{ code: string; field?: string; message: string }>;
  };
  ocr_error?: {
    message: string;
    attempts: number;
    failed_at: string;
  };
}

export interface Beleg {
  id: string;
  status: BelegStatus;
  source_channel: BelegSourceChannel;
  received_at: string;
  file_object_key: string;
  file_mime_type: string;
  file_size_bytes: number;
  supplier_name: string | null;
  document_date: string | null;
  total_gross: number | null;
  currency: string;
  category: string | null;
  /** T015: vollständiges payload — nur im Detail-Response gesetzt, in der Liste optional. */
  payload?: BelegPayload;
}

export interface BelegListResponse {
  belege: Beleg[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface UploadResponse {
  beleg_id: string;
  storage_key: string;
  status: string;
  isDuplicate?: boolean;
}

export interface BelegDetailResponse {
  beleg: Beleg;
  download_url: string;
  download_expires_at: string;
}

// ── Upload mit Progress-Callback ─────────────────────────────────────────────

/**
 * Lädt eine Datei per fetch hoch. Progress-Callback wird nach erfolgreichem Upload
 * einmalig auf 100 % gesetzt (echtes Byte-Progress via fetch ReadableStream ist
 * in den meisten Browsern für Upload-Bodies nicht verfügbar; XHR wäre nötig — aber
 * XHR-Events sind in JSDOM/Vitest nicht zuverlässig simulierbar).
 *
 * DECISION: fetch statt XHR, damit MSW in Tests greift und kein Upload-Progress-Hack
 * nötig ist. Für echten Progress-Support in Zukunft: XHR hinter Feature-Flag.
 */
export async function uploadBeleg(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResponse> {
  // Indeterminierter Progress vor dem Upload
  onProgress?.(10);

  const formData = new FormData();
  formData.append('file', file);

  const result = await apiRequest<UploadResponse>('/belege/upload', {
    method: 'POST',
    body: formData,
  });

  // 100 % nach erfolgreichem Upload
  onProgress?.(100);
  return result;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listBelege(opts: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<BelegListResponse> {
  const params = new URLSearchParams();
  if (opts.page !== undefined) params.set('page', String(opts.page));
  if (opts.pageSize !== undefined) params.set('page_size', String(opts.pageSize));
  if (opts.status && opts.status !== 'all') params.set('status', opts.status);

  const qs = params.toString();
  const path = qs ? `/belege?${qs}` : '/belege';
  return apiRequest<BelegListResponse>(path);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getBeleg(id: string): Promise<BelegDetailResponse> {
  return apiRequest<BelegDetailResponse>(`/belege/${id}`);
}

// ── T015: Update / Reprocess / Delete ────────────────────────────────────

/**
 * Korrekturen, die ein Mitarbeiter im Detail-View schicken kann.
 * Backend-Schema: keys exact (snake_case).
 */
export interface BelegUpdatePatch {
  supplier_name?: string | null;
  document_date?: string | null; // ISO YYYY-MM-DD
  total_gross?: number | null;
  currency?: string | null;
  category?: string | null;
  tax_rate?: number | null;
  bewirtung_anlass?: string | null;
  bewirtung_teilnehmer?: string | null;
}

export async function updateBeleg(
  id: string,
  patch: BelegUpdatePatch,
): Promise<{ beleg: Beleg }> {
  return apiRequest<{ beleg: Beleg }>(`/belege/${id}`, {
    method: 'PATCH',
    // apiRequest JSON.stringify'd das Object automatisch + setzt Content-Type.
    body: patch,
  });
}

export async function reprocessBeleg(
  id: string,
): Promise<{ beleg_id: string; status: string; queued: boolean }> {
  return apiRequest<{ beleg_id: string; status: string; queued: boolean }>(
    `/belege/${id}/reprocess`,
    { method: 'POST' },
  );
}

export async function deleteBeleg(
  id: string,
  reason?: string,
): Promise<{ beleg_id: string; deleted_at: string }> {
  return apiRequest<{ beleg_id: string; deleted_at: string }>(`/belege/${id}`, {
    method: 'DELETE',
    body: reason ? { reason } : undefined,
  });
}
