/**
 * T071 — Web-Chat-Widget-API-Client (öffentlich, Token = Credential).
 *
 * Wie der Onboarding-Wizard: KEIN Bearer, KEIN x-pp-tenant-id — der Magic-Link-
 * Token in der URL identifiziert die Session. Basis /api/v1/chat (Vite-Proxy →
 * Backend). Endpoints: Session laden, Verlauf, Nachricht senden, Beleg hochladen,
 * Live-Events (SSE).
 */
const BASE = '/api/v1/chat';

export type ChatStatus = 'active' | 'revoked' | 'closed';
export type ChatSenderType = 'customer' | 'staff' | 'system';

export interface PublicChatSession {
  status: ChatStatus;
  expires_at: string | null;
}

export interface PublicChatMessage {
  id: string;
  session_id: string;
  sender_type: ChatSenderType;
  body: string | null;
  /** Gesetzt, wenn die Nachricht einen hochgeladenen Beleg trägt (kein Text). */
  beleg_id: string | null;
  created_at: string;
}

export class ChatApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseError(res: Response): Promise<ChatApiError> {
  let payload: { error?: string; message?: string } | undefined;
  try {
    payload = await res.json();
  } catch {
    /* kein JSON-Body */
  }
  return new ChatApiError(
    res.status,
    payload?.message ?? res.statusText ?? `HTTP ${res.status}`,
    payload?.error,
  );
}

async function requestJson<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

/** Token aus der URL ist roh; für den Pfad enkodieren (Base64URL ist pfad-safe, defensiv trotzdem). */
function enc(token: string): string {
  return encodeURIComponent(token);
}

export async function getSession(token: string): Promise<PublicChatSession> {
  const json = await requestJson<{ session: PublicChatSession }>(`/${enc(token)}`);
  return json.session;
}

export async function listMessages(token: string): Promise<PublicChatMessage[]> {
  const json = await requestJson<{ messages: PublicChatMessage[] }>(`/${enc(token)}/messages`);
  return json.messages;
}

export async function sendMessage(token: string, text: string): Promise<PublicChatMessage> {
  const json = await requestJson<{ message: PublicChatMessage }>(`/${enc(token)}/messages`, {
    method: 'POST',
    body: { text },
  });
  return json.message;
}

export interface UploadResult {
  beleg_id: string;
  status: string;
  message: PublicChatMessage;
}

export async function uploadBeleg(token: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/${enc(token)}/belege`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as UploadResult;
}

/** URL für den SSE-Stream (EventSource). Liefert `chat.message`-Events. */
export function chatEventsUrl(token: string): string {
  return `${BASE}/${enc(token)}/events`;
}
