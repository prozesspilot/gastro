/**
 * T068 — Gemeinsamer Token-Lookup + Gültigkeits-Check für die öffentlichen
 * Web-Chat-Handler (404/410). Wiederverwendbar von späteren Wirt-Endpoints
 * (Nachrichten T069, Upload T070).
 */
import type { Pool } from 'pg';
import { getChatSessionByToken } from '../services/webchat.repository';
import type { DbChatSession } from '../webchat.types';

export type ResolvedChatSession =
  | { ok: true; session: DbChatSession }
  | { ok: false; status: number; body: { error: string; message: string } };

export async function resolveChatSession(pool: Pool, token: string): Promise<ResolvedChatSession> {
  const session = await getChatSessionByToken(pool, token);
  if (!session) {
    return {
      ok: false,
      status: 404,
      body: { error: 'not_found', message: 'Dieser Chat-Link ist ungültig.' },
    };
  }
  if (session.status === 'revoked' || session.status === 'closed') {
    return {
      ok: false,
      status: 410,
      body: { error: 'revoked', message: 'Dieser Chat-Link ist nicht mehr aktiv.' },
    };
  }
  // expires_at ist NULL bei unbefristeten Kanälen → kein Ablauf. Nur ein gesetztes,
  // in der Vergangenheit liegendes Datum gilt als abgelaufen.
  if (session.expires_at !== null && new Date(session.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      status: 410,
      body: {
        error: 'expired',
        message: 'Dieser Chat-Link ist abgelaufen. Bitte fordere einen neuen an.',
      },
    };
  }
  return { ok: true, session };
}
