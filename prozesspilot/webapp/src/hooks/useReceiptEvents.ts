import { useEffect, useRef } from 'react';

/**
 * SSE-Stream gegen /api/v1/events.
 *
 * Da der native EventSource keine Custom-Header unterstützt (x-pp-tenant-id),
 * wird der Stream via fetch + ReadableStream eingelesen.
 *
 * Reconnect: Bei Verbindungsabbruch wird nach 3s erneut verbunden, solange
 * die Komponente noch montiert ist.
 */
export function useReceiptEvents(
  tenantId: string | null,
  onEvent: (event: string, data: unknown) => void,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;
    let abortController: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (cancelled) return;

      abortController = new AbortController();

      try {
        const res = await fetch('/api/v1/events', {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            'x-pp-tenant-id': tenantId!,
          },
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          scheduleReconnect();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            dispatch(raw);
          }
        }

        if (!cancelled) scheduleReconnect();
      } catch {
        if (!cancelled) scheduleReconnect();
      }
    }

    function dispatch(raw: string) {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      const dataStr = dataLines.join('\n');
      let data: unknown = dataStr;
      if (dataStr) {
        try { data = JSON.parse(dataStr); } catch { /* keep string */ }
      }
      onEventRef.current(event, data);
    }

    function scheduleReconnect() {
      if (cancelled) return;
      reconnectTimer = setTimeout(connect, 3000);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (abortController) abortController.abort();
    };
  }, [tenantId]);
}
