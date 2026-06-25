/**
 * T068/Phase C — Web-Chat-Widget: Typen.
 *
 * Konvention: DB-Spalten + Wire-JSON = snake_case; interne TS-Funktionsparameter
 * = camelCase (siehe beleg.repository.ts / wizard.types.ts).
 */

/** Status-FSM der chat_sessions (Migration 124). */
export type ChatSessionStatus = 'active' | 'revoked' | 'closed';

/** Eine Chat-Session, wie sie aus der DB kommt (snake_case). */
export interface DbChatSession {
  id: string;
  tenant_id: string;
  token: string;
  status: ChatSessionStatus;
  trigger_type: string | null;
  trigger_reference_id: string | null;
  created_at: string;
  /** NULL = unbefristet (dauerhafter Kanal). */
  expires_at: string | null;
  revoked_at: string | null;
  last_activity_at: string;
}

/**
 * Öffentliches Session-DTO für den Wirt (Widget). Der `token` wird NICHT
 * zurückgespiegelt — der Client hat ihn bereits aus der URL; nicht erneut über
 * Response-Bodies streuen.
 */
export interface PublicChatSession {
  status: ChatSessionStatus;
  expires_at: string | null;
}

export function toPublicChatSession(s: DbChatSession): PublicChatSession {
  return { status: s.status, expires_at: s.expires_at };
}

// ---------------------------------------------------------------------------
// Chat-Nachrichten (T069, Migration 125)
// ---------------------------------------------------------------------------

export type ChatSenderType = 'customer' | 'staff' | 'system';

/** Eine Chat-Nachricht, wie sie aus der DB kommt (snake_case). */
export interface DbChatMessage {
  id: string;
  tenant_id: string;
  session_id: string;
  sender_type: ChatSenderType;
  /** Nur bei sender_type='staff' gesetzt. */
  sender_user_id: string | null;
  body: string | null;
  /** Verknüpfter Beleg (Foto-Upload), gesetzt in T070. */
  beleg_id: string | null;
  created_at: string;
  read_at: string | null;
}

/**
 * Öffentliches Nachrichten-DTO (Wirt-Widget + Staff-Thread + SSE-Payload).
 * `session_id` bleibt drin, damit der tenant-gescopte SSE-Kanal (mehrere Sessions
 * möglich) clientseitig gefiltert werden kann. Interne Felder (tenant_id, read_at)
 * werden nicht nach außen gespiegelt.
 */
export interface PublicChatMessage {
  id: string;
  session_id: string;
  sender_type: ChatSenderType;
  body: string | null;
  beleg_id: string | null;
  created_at: string;
}

export function toPublicChatMessage(m: DbChatMessage): PublicChatMessage {
  return {
    id: m.id,
    session_id: m.session_id,
    sender_type: m.sender_type,
    body: m.body,
    beleg_id: m.beleg_id,
    created_at: m.created_at,
  };
}

/** Staff-Übersicht: eine Chat-Session mit Zähler-Metadaten. */
export interface StaffChatListItem {
  id: string;
  status: ChatSessionStatus;
  created_at: string;
  last_activity_at: string;
  last_message_at: string | null;
  unread_count: number;
}
