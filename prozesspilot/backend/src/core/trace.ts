/**
 * D10 — Trace-Kontext
 *
 * AsyncLocalStorage-basierter Trace-Kontext, der pro HTTP-Request befüllt wird.
 * Alle Log-Statements können darüber auf traceId, tenantId und requestId zugreifen.
 *
 * Öffentliche API:
 *   traceStorage          — AsyncLocalStorage<TraceContext>
 *   getTraceContext()     — aktuelle Werte (oder Fallback)
 *   newTraceId()          — neue kurze Trace-ID
 *   runWithTraceContext() — Hilfsfunktion für Tests und Background-Jobs
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContext {
  /** Eindeutige ID für einen einzelnen HTTP-Request oder Job-Lauf */
  traceId: string;
  /** Tenant-ID aus x-pp-tenant-id Header (falls vorhanden) */
  tenantId?: string;
  /** HTTP-Request-Methode */
  method?: string;
  /** HTTP-Request-Pfad */
  path?: string;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

/** Gibt den aktuellen TraceContext zurück, oder einen sinnvollen Fallback. */
export function getTraceContext(): TraceContext {
  return traceStorage.getStore() ?? { traceId: 'no-context' };
}

/** Erzeugt eine neue kurze Trace-ID (trc_<16 Hex-Zeichen>). */
export function newTraceId(): string {
  return `trc_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Führt eine Funktion mit einem frischen TraceContext aus.
 * Nützlich in Tests und Background-Jobs.
 */
export function runWithTraceContext<T>(
  ctx: Partial<TraceContext>,
  fn: () => Promise<T>,
): Promise<T> {
  const fullCtx: TraceContext = {
    traceId: newTraceId(),
    ...ctx,
  };
  return traceStorage.run(fullCtx, fn);
}
