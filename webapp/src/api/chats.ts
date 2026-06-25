/**
 * T073 — API-Modul für die Staff-Chat-Ansicht (Web-Chat-Support).
 *
 * Nutzt die Staff-Endpoints aus T069 (m-webchat): Bearer + x-pp-tenant-id via
 * apiRequest. Backend-Shapes: { chats } / { messages } / { message }.
 */
import { apiRequest } from './_client';

export type ChatSessionStatus = 'active' | 'revoked' | 'closed';
export type ChatSenderType = 'customer' | 'staff' | 'system';

export interface StaffChatListItem {
  id: string;
  status: ChatSessionStatus;
  created_at: string;
  last_activity_at: string;
  last_message_at: string | null;
  unread_count: number;
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

/** Liste der Chat-Sessions des aktiven Mandanten (mit unread/last_message). */
export async function listChats(): Promise<StaffChatListItem[]> {
  const res = await apiRequest<{ chats: StaffChatListItem[] }>('/chat/sessions');
  return res.chats;
}

/** Nachrichtenverlauf einer Session (markiert Customer-Nachrichten als gelesen). */
export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await apiRequest<{ messages: ChatMessage[] }>(
    `/chat/sessions/${sessionId}/messages`,
  );
  return res.messages;
}

/** Staff antwortet im Thread. */
export async function sendStaffReply(sessionId: string, text: string): Promise<ChatMessage> {
  const res = await apiRequest<{ message: ChatMessage }>(`/chat/sessions/${sessionId}/reply`, {
    method: 'POST',
    body: { text },
  });
  return res.message;
}
