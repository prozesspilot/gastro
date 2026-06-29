/**
 * T016 — Wizard-API-Client (öffentlich, Token = Credential).
 *
 * Anders als die Mitarbeiter-Webapp: KEIN Bearer-Token, KEIN x-pp-tenant-id —
 * der Magic-Link-Token in der URL identifiziert die Session. Basis-URL /api/v1/wizard
 * (Vite-Proxy → Backend). Backend antwortet mit { session: PublicSession }.
 */
const BASE = '/api/v1/wizard';

export type WizardStatus = 'started' | 'completed' | 'abandoned' | 'premium_handoff';

export interface PublicSession {
  status: WizardStatus;
  current_step: number;
  step_data: Record<string, unknown>;
  premium_setup_requested: boolean;
  expires_at: string;
}

export class WizardApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'WizardApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body });
  if (!res.ok) {
    let payload: { error?: string; message?: string } | undefined;
    try {
      payload = await res.json();
    } catch {
      /* kein JSON-Body */
    }
    throw new WizardApiError(
      res.status,
      payload?.message ?? res.statusText ?? `HTTP ${res.status}`,
      payload?.error,
    );
  }
  const json = (await res.json()) as { session: T };
  return json.session;
}

/** Token in der URL ist roh; für den Pfad enkodieren (Base64URL ist pfad-safe, defensiv trotzdem). */
function enc(token: string): string {
  return encodeURIComponent(token);
}

export function getSession(token: string): Promise<PublicSession> {
  return request<PublicSession>(`/${enc(token)}`);
}

export function saveStep(
  token: string,
  step: number,
  data: Record<string, unknown>,
): Promise<PublicSession> {
  return request<PublicSession>(`/${enc(token)}/step/${step}`, { method: 'POST', body: data });
}

export function completeWizard(token: string): Promise<PublicSession> {
  return request<PublicSession>(`/${enc(token)}/complete`, { method: 'POST' });
}

export function requestPremium(token: string): Promise<PublicSession> {
  return request<PublicSession>(`/${enc(token)}/premium`, { method: 'POST' });
}

/**
 * T067 — Startet den SumUp-OAuth-Flow für den Session-Tenant. Antwort ist KEIN
 * `{ session }` (anders als die übrigen Endpoints), sondern `{ redirect_url }` —
 * das Frontend setzt `window.location` darauf, weil ein Fetch keinem 302 folgt.
 */
export async function startSumupConnect(token: string): Promise<{ redirect_url: string }> {
  const res = await fetch(`${BASE}/${enc(token)}/oauth/sumup/start`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    let payload: { error?: string; message?: string } | undefined;
    try {
      payload = await res.json();
    } catch {
      /* kein JSON-Body */
    }
    throw new WizardApiError(
      res.status,
      payload?.message ?? res.statusText ?? `HTTP ${res.status}`,
      payload?.error,
    );
  }
  return (await res.json()) as { redirect_url: string };
}

/**
 * T084 — Hinterlegt den Lexware-Office-API-Schlüssel (Wizard-Schritt 3). Lexware
 * hat KEIN OAuth → direkter API-Key-Eintrag. Antwort ist KEIN `{ session }`,
 * sondern `{ ok, company_name }` (Backend live-validiert den Key vor dem Speichern).
 * Wirft WizardApiError bei abgelehntem Token (422) oder nicht erreichbarer API (502).
 */
export async function connectLexware(
  token: string,
  apiToken: string,
  displayName?: string,
): Promise<{ ok: boolean; company_name: string | null }> {
  const res = await fetch(`${BASE}/${enc(token)}/connect/lexware`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_token: apiToken, display_name: displayName }),
  });
  if (!res.ok) {
    let payload: { error?: string; message?: string } | undefined;
    try {
      payload = await res.json();
    } catch {
      /* kein JSON-Body */
    }
    throw new WizardApiError(
      res.status,
      payload?.message ?? res.statusText ?? `HTTP ${res.status}`,
      payload?.error,
    );
  }
  return (await res.json()) as { ok: boolean; company_name: string | null };
}

/** Gemeinsame Props aller Schritt-Komponenten. Navigation (Zurück/Skip) liegt im WizardFlow. */
export interface StepProps {
  token: string;
  initialData?: Record<string, unknown>;
  /** Schritt gespeichert → Flow rückt vor (bei Abschluss: Session=completed). */
  onSaved: (session: PublicSession) => void;
}
