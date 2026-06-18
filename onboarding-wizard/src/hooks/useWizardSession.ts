/**
 * T016 — Lädt die Wizard-Session anhand des Magic-Link-Tokens und hält sie im
 * State. `setSession` erlaubt es den Schritten, nach dem Speichern den lokalen
 * Stand zu aktualisieren, ohne neu zu laden.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSession, type PublicSession, WizardApiError } from '../lib/api';

export type WizardState =
  | { status: 'loading' }
  | { status: 'ready'; session: PublicSession }
  | { status: 'error'; httpStatus: number; message: string };

export function useWizardSession(token: string | null) {
  const [state, setState] = useState<WizardState>(
    token ? { status: 'loading' } : { status: 'error', httpStatus: 0, message: 'Kein Setup-Link.' },
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
        const httpStatus = err instanceof WizardApiError ? err.status : 0;
        const message =
          err instanceof WizardApiError ? err.message : 'Verbindung zum Server fehlgeschlagen.';
        setState({ status: 'error', httpStatus, message });
      });
    return () => {
      active = false;
    };
  }, [token]);

  const setSession = useCallback((session: PublicSession) => {
    setState({ status: 'ready', session });
  }, []);

  return { state, setSession };
}
