/**
 * T071 — Lädt die Chat-Session anhand des Magic-Link-Tokens und hält sie im State.
 * Muster wie useWizardSession (T016).
 */
import { useCallback, useEffect, useState } from 'react';
import { ChatApiError, getSession, type PublicChatSession } from '../lib/api';

export type ChatSessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: PublicChatSession }
  | { status: 'error'; httpStatus: number; message: string };

export function useChatSession(token: string | null) {
  const [state, setState] = useState<ChatSessionState>(
    token
      ? { status: 'loading' }
      : { status: 'error', httpStatus: 0, message: 'Kein Chat-Link.' },
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    setState({ status: 'loading' });
    getSession(token)
      .then((session) => {
        if (active) setState({ status: 'ready', session });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const httpStatus = err instanceof ChatApiError ? err.status : 0;
        const message =
          err instanceof ChatApiError ? err.message : 'Verbindung zum Server fehlgeschlagen.';
        setState({ status: 'error', httpStatus, message });
      });
    return () => {
      active = false;
    };
  }, [token]);

  /**
   * Setzt die Session direkt (nach „Chat beenden" / „Bewertung senden"), ohne
   * neu zu laden — die jeweiligen Endpoints liefern die aktualisierte Session
   * bereits zurück.
   */
  const applySession = useCallback((session: PublicChatSession) => {
    setState({ status: 'ready', session });
  }, []);

  return { state, applySession };
}
