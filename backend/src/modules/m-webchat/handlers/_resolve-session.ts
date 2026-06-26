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

export interface ResolveChatSessionOptions {
  /**
   * true → eine `closed` Session wird ebenfalls als `ok` zurückgegeben (statt 410).
   * Nötig für die Bewertungs-Ansicht (T075): nach dem Beenden muss der Wirt seine
   * Session noch laden + bewerten können. `revoked`/`expired` bleiben in jedem Fall
   * 410. Default false (Schreib-Endpoints wie Nachricht/Upload bleiben active-only).
   */
  allowClosed?: boolean;
}

export async function resolveChatSession(
  pool: Pool,
  token: string,
  opts: ResolveChatSessionOptions = {},
): Promise<ResolvedChatSession> {
  const session = await getChatSessionByToken(pool, token);
  if (!session) {
    return {
      ok: false,
      status: 404,
      body: { error: 'not_found', message: 'Dieser Chat-Link ist ungültig.' },
    };
  }
  if (session.status === 'revoked') {
    return {
      ok: false,
      status: 410,
      body: { error: 'revoked', message: 'Dieser Chat-Link ist nicht mehr aktiv.' },
    };
  }
  if (session.status === 'closed') {
    // Für die Bewertungs-Ansicht durchlassen; ansonsten wie revoked behandeln.
    if (opts.allowClosed) {
      return { ok: true, session };
    }
    return {
      ok: false,
      status: 410,
      body: { error: 'revoked', message: 'Dieser Chat-Link ist nicht mehr aktiv.' },
    };
  }
  // active: expires_at ist NULL bei unbefristeten Kanälen → kein Ablauf. Nur ein
  // gesetztes, in der Vergangenheit liegendes Datum gilt als abgelaufen.
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
