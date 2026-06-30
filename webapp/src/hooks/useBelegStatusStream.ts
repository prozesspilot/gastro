/**
 * T074 — useBelegStatusStream
 *
 * Öffnet einen Server-Sent-Events-Stream auf `/api/v1/events?tenant=<id>` und
 * ruft `onStatus` bei jedem `beleg.status`-Event auf. Damit aktualisiert sich
 * der Beleg-Status in der Mitarbeiter-Webapp live, ohne Polling/Neuladen.
 *
 * - Tenant kommt als Query-Param (EventSource kann KEINE Custom-Header setzen).
 * - Auth läuft über das `pp_auth`-Cookie, das EventSource same-origin automatisch
 *   mitsendet (Backend: routes/sse.ts → resolveSseSubscription).
 * - Robust: kein `EventSource` (jsdom/Tests) → no-op; kein aktiver Tenant → no-op;
 *   fehlerhaftes Event → ignoriert.
 *
 * `onStatus` MUSS stabil sein (z. B. via useCallback), sonst wird der Stream bei
 * jedem Render neu auf-/abgebaut.
 *
 * Muster gespiegelt aus web-chat-widget/src/components/ChatWindow.tsx.
 */

import { useEffect } from 'react';
import { getActiveTenantId } from '../api';

export interface BelegStatusEvent {
  beleg_id: string;
  status: string;
}

/** Baut die SSE-URL für den Beleg-Status-Stream eines Mandanten. */
export function belegEventsUrl(tenantId: string): string {
  return `/api/v1/events?tenant=${encodeURIComponent(tenantId)}`;
}

export function useBelegStatusStream(onStatus: (event: BelegStatusEvent) => void): void {
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const tenantId = getActiveTenantId();
    if (!tenantId) return;

    const es = new EventSource(belegEventsUrl(tenantId), { withCredentials: true });
    const handler = (ev: MessageEvent): void => {
      try {
        const data = JSON.parse(ev.data) as Partial<BelegStatusEvent>;
        if (data && typeof data.beleg_id === 'string' && typeof data.status === 'string') {
          onStatus({ beleg_id: data.beleg_id, status: data.status });
        }
      } catch {
        /* fehlerhaftes Event ignorieren */
      }
    };
    es.addEventListener('beleg.status', handler as EventListener);

    return () => {
      es.removeEventListener('beleg.status', handler as EventListener);
      es.close();
    };
  }, [onStatus]);
}
