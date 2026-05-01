/**
 * SSE-Manager — verwaltet pro Tenant offene Server-Sent-Event-Verbindungen.
 *
 * Schreibt Events im SSE-Format:
 *   event: <name>\ndata: <json>\n\n
 *
 * Tests injizieren ein Sink-Objekt mit einer write()-Funktion.
 */

export interface SseSink {
  write(chunk: string): boolean | void;
}

export class SseManager {
  private subscribers = new Map<string, Set<SseSink>>();

  subscribe(tenantId: string, sink: SseSink): void {
    let set = this.subscribers.get(tenantId);
    if (!set) {
      set = new Set();
      this.subscribers.set(tenantId, set);
    }
    set.add(sink);
  }

  unsubscribe(tenantId: string, sink: SseSink): void {
    const set = this.subscribers.get(tenantId);
    if (!set) return;
    set.delete(sink);
    if (set.size === 0) {
      this.subscribers.delete(tenantId);
    }
  }

  emit(tenantId: string, event: string, data: object): void {
    const set = this.subscribers.get(tenantId);
    if (!set || set.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const sink of set) {
      try {
        sink.write(payload);
      } catch {
        // Tote Verbindung — beim nächsten close-Hook wird sie entfernt
      }
    }
  }

  /** Anzahl Subscriber für Tests/Diagnose */
  count(tenantId: string): number {
    return this.subscribers.get(tenantId)?.size ?? 0;
  }
}

export const sseManager = new SseManager();
