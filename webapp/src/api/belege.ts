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
