/**
 * Gemeinsamer Fetch-Client für alle API-Module.
 *
 * - Basis-URL: /api/v1 (Vite-Proxy → Backend)
 * - Tenant-Header: x-pp-tenant-id (für non-Auth-Endpoints)
 * - M14: Authorization: Bearer <access_token>
 * - M14: Auto-Refresh bei 401 → genau ein Retry mit neuem Token
 */

const BASE = '/api/v1';
const TENANT_KEY = 'pp_tenant_id';

export function getActiveTenantId(): string | null {
  try {
    return localStorage.getItem(TENANT_KEY);
  } catch {
    // localStorage nicht verfügbar (z. B. in JSDOM-Tests ohne --localstorage-file)
    return null;
  }
}

export function setActiveTenantId(id: string): void {
  try {
    localStorage.setItem(TENANT_KEY, id);
  } catch {
    // localStorage nicht verfügbar — ignorieren
  }
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

// ── M14: Access-Token-Provider + Refresh-Hook ─────────────────────────────────
// AuthContext setzt diese Hooks. Vor dem Setzen liefern getAccessToken() → null
// und triggerRefresh() → null (kein Retry).

type AccessTokenProvider = () => string | null;
type RefreshTrigger = () => Promise<string | null>;
type UnauthorizedHandler = () => void;

let accessTokenProvider: AccessTokenProvider = () => null;
let refreshTrigger: RefreshTrigger = async () => null;
let unauthorizedHandler: UnauthorizedHandler = () => undefined;

export function setAuthHooks(opts: {
  getAccessToken: AccessTokenProvider;
  refresh: RefreshTrigger;
  onUnauthorized: UnauthorizedHandler;
}): void {
  accessTokenProvider = opts.getAccessToken;
  refreshTrigger = opts.refresh;
  unauthorizedHandler = opts.onUnauthorized;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  tenantId?: string | null;
  /** Wenn true, wird bei 404 statt eines Fehlers `undefined` zurückgegeben. */
  optional?: boolean;
  /** Internes Flag, um Endlos-Refresh-Schleifen zu verhindern. */
  _retry?: boolean;
  /** Wenn true, kein Bearer-Header anhängen (z. B. für Health-Endpoint). */
  skipAuth?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown;
  try { body = await res.json(); } catch { /* nothing */ }
  const obj = body as { error?: { message?: string; code?: string; details?: unknown } } | undefined;
  const msg = obj?.error?.message ?? res.statusText ?? `HTTP ${res.status}`;
  return new ApiError(res.status, msg, obj?.error?.code, obj?.error?.details);
}

function buildHeaders(opts: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const tenantId = opts.tenantId !== undefined ? opts.tenantId : getActiveTenantId();
  if (tenantId) headers['x-pp-tenant-id'] = tenantId;
  if (!opts.skipAuth) {
    const token = accessTokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = buildHeaders(opts);

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else if (opts.body instanceof Blob) {
      body = opts.body;
      if (!headers['Content-Type']) {
        headers['Content-Type'] = opts.body.type || 'application/octet-stream';
      }
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers,
    body,
  });

  if (res.status === 401 && !opts._retry && !opts.skipAuth) {
    // M14: Versuche genau einen Refresh und retry mit neuem Token.
    const newToken = await refreshTrigger();
    if (newToken) {
      return apiRequest<T>(path, { ...opts, _retry: true });
    }
    // Refresh fehlgeschlagen → User muss neu einloggen.
    unauthorizedHandler();
    throw await parseError(res);
  }

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
  const headers = buildHeaders(opts);
  delete headers.Accept;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers,
    body: undefined,
  });
  if (res.status === 401 && !opts._retry && !opts.skipAuth) {
    const newToken = await refreshTrigger();
    if (newToken) return apiBlob(path, { ...opts, _retry: true });
    unauthorizedHandler();
    throw await parseError(res);
  }
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
