/**
 * T073 — API-Modul für die Staff-Chat-Ansicht (Web-Chat-Support).
 *
 * Nutzt die Staff-Endpoints aus T069 (m-webchat): Bearer + x-pp-tenant-id via
 * apiRequest. Backend-Shapes: { chats } / { messages } / { message }.
 */
import { apiRequest } from './_client';

export type ChatSessionStatus = 'active' | 'revoked' | 'closed';
export type ChatSenderType = 'customer' | 'staff' | 'system';

export type ChatClosedBy = 'customer' | 'staff' | 'system';

export interface StaffChatListItem {
  id: string;
  status: ChatSessionStatus;
  created_at: string;
  last_activity_at: string;
  last_message_at: string | null;
  unread_count: number;
  /** Kundenseitige Bewertung 1–5 (null = noch nicht bewertet). T075 */
  rating: number | null;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  sender_type: ChatSenderType;
  body: string | null;
  /** Gesetzt, wenn die Nachricht einen hochgeladenen Beleg trägt. */
  beleg_id: string | null;
  created_at: string;
}

/** Session-Meta der Thread-Ansicht: Status + Bewertung + Abschluss-Info (T075). */
export interface StaffChatThreadMeta {
  id: string;
  status: ChatSessionStatus;
  closed_at: string | null;
  closed_by: ChatClosedBy | null;
  rating: number | null;
  rating_comment: string | null;
  rated_at: string | null;
}

export interface StaffChatThread {
  session: StaffChatThreadMeta;
  messages: ChatMessage[];
}

/** Liste der Chat-Sessions des aktiven Mandanten (mit unread/last_message/rating). */
export async function listChats(): Promise<StaffChatListItem[]> {
  const res = await apiRequest<{ chats: StaffChatListItem[] }>('/chat/sessions');
  return res.chats;
}

/**
 * Nachrichtenverlauf + Session-Meta einer Session (markiert Customer-Nachrichten
 * als gelesen). Fällt defensiv auf eine aktive Default-Meta zurück, falls das
 * Backend (ältere Version) noch kein `session`-Feld mitliefert.
 */
export async function getChatThread(sessionId: string): Promise<StaffChatThread> {
  const res = await apiRequest<{ session?: StaffChatThreadMeta; messages: ChatMessage[] }>(
    `/chat/sessions/${sessionId}/messages`,
  );
  const session: StaffChatThreadMeta = res.session ?? {
    id: sessionId,
    status: 'active',
    closed_at: null,
    closed_by: null,
    rating: null,
    rating_comment: null,
    rated_at: null,
  };
  return { session, messages: res.messages };
}

/** Staff antwortet im Thread. */
export async function sendStaffReply(sessionId: string, text: string): Promise<ChatMessage> {
  const res = await apiRequest<{ message: ChatMessage }>(`/chat/sessions/${sessionId}/reply`, {
    method: 'POST',
    body: { text },
  });
  return res.message;
}

/** Staff beendet die Chat-Session (status → 'closed'). T075 */
export async function closeChatSession(sessionId: string): Promise<StaffChatThreadMeta> {
  const res = await apiRequest<{ session: StaffChatThreadMeta }>(
    `/chat/sessions/${sessionId}/close`,
    { method: 'POST' },
  );
  return res.session;
}
