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
