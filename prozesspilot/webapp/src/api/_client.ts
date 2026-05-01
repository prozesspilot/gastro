/**
 * Gemeinsamer Fetch-Client für alle API-Module.
 *
 * - Basis-URL: /api/v1 (Vite-Proxy → Backend)
 * - Tenant-Header: x-pp-tenant-id (vom Backend erwartet — entspricht "X-Tenant-ID")
 * - Authentifizierung: HMAC ist im Dev-Modus deaktiviert (PP_AUTH_DISABLED=1)
 */

const BASE = '/api/v1';
const TENANT_KEY = 'pp_tenant_id';

export function getActiveTenantId(): string | null {
  return localStorage.getItem(TENANT_KEY);
}

export function setActiveTenantId(id: string): void {
  localStorage.setItem(TENANT_KEY, id);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  tenantId?: string | null;
  /** Wenn true, wird bei 404 statt eines Fehlers `undefined` zurückgegeben. */
  optional?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown;
  try { body = await res.json(); } catch { /* nothing */ }
  const obj = body as { error?: { message?: string; code?: string; details?: unknown } } | undefined;
  const msg = obj?.error?.message ?? res.statusText ?? `HTTP ${res.status}`;
  return new ApiError(res.status, msg, obj?.error?.code, obj?.error?.details);
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };

  const tenantId = opts.tenantId !== undefined ? opts.tenantId : getActiveTenantId();
  if (tenantId) headers['x-pp-tenant-id'] = tenantId;

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(`${BASE}${path}`, { ...opts, headers, body });

  if (!res.ok) {
    if (res.status === 404 && opts.optional) {
      return undefined as T;
    }
    throw await parseError(res);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return undefined as T;
}

/** Variante für Binär-Downloads (PDF / Original-Datei). */
export async function apiBlob(path: string, opts: RequestOptions = {}): Promise<Blob> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> | undefined),
  };
  const tenantId = opts.tenantId !== undefined ? opts.tenantId : getActiveTenantId();
  if (tenantId) headers['x-pp-tenant-id'] = tenantId;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers, body: undefined });
  if (!res.ok) throw await parseError(res);
  return res.blob();
}

/** Backend liefert oft `{ ok: true, data: ... }`. Diese Hilfsfunktion entpackt sicher. */
export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
