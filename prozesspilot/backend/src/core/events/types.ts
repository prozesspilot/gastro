/**
 * D6 — Event-Bus-Typen
 *
 * Definiert alle Domain-Events, die über Redis Streams veröffentlicht werden.
 * Jeder Event-Typ hat einen Stream-Namen und ein typisiertes Payload-Interface.
 *
 * Konvention:
 *   Stream-Name:  pp:<domain>          (z. B. pp:customers)
 *   Event-Typ:    <domain>.<aktion>    (z. B. customer.created)
 */

// ── Stream-Namen ──────────────────────────────────────────────────────────────

export const STREAMS = {
  customers: 'pp:customers',
  documents: 'pp:documents',   // für D8/D9
  jobs:      'pp:jobs',        // für D9
} as const;

export type StreamName = (typeof STREAMS)[keyof typeof STREAMS];

// ── Basis-Event ───────────────────────────────────────────────────────────────

/**
 * Alle Events tragen diese Felder.
 * In Redis Streams werden sie als flache Key-Value-Strings gespeichert;
 * `payload` wird als JSON-String serialisiert.
 */
export interface BaseEvent {
  /** Redis-Message-ID, z. B. "1718000000000-0" */
  id:        string;
  /** Diskriminierender Typ, z. B. "customer.created" */
  type:      string;
  tenant_id: string;
  /** ISO-8601-Timestamp */
  timestamp: string;
}

// ── Customer-Events ───────────────────────────────────────────────────────────

export type CustomerEventType =
  | 'customer.created'
  | 'customer.updated'
  | 'customer.soft_deleted';

export interface CustomerEventPayload {
  customer_id:  string;
  /** Kurzname für Logging/Tracing — kein PII in der Stream-Nachricht */
  external_id?: string | null;
}

export interface CustomerEvent extends BaseEvent {
  type:    CustomerEventType;
  payload: CustomerEventPayload;
}

// ── Redis-Stream-Message (flat) ───────────────────────────────────────────────

/**
 * So sieht ein Event in Redis Streams aus (alle Werte als Strings).
 */
export interface RawStreamMessage {
  type:      string;
  tenant_id: string;
  timestamp: string;
  payload:   string; // JSON.stringify(EventPayload)
}
