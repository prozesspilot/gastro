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
  documents: 'pp:documents', // für D8/D9
  jobs: 'pp:jobs', // für D9
  // T021: M01-OCR → M03-Bewirtungs-Detector Entkoppelung
  receipts: 'gastro:receipts',
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
  id: string;
  /** Diskriminierender Typ, z. B. "customer.created" */
  type: string;
  tenant_id: string;
  /** ISO-8601-Timestamp */
  timestamp: string;
}

// ── Receipt-Events (T021) ─────────────────────────────────────────────────────

/**
 * Event-Typ fuer den gastro:receipts-Stream.
 * Wird von M01-OCR nach erfolgreicher Extraction gepublisht.
 * M03-Bewirtungs-Detector-Worker konsumiert ihn (wenn ENABLE_EVENT_DRIVEN_M03=1).
 */
export type ReceiptEventType =
  | 'gastro.receipt.extracted' // OCR fertig, Felder extrahiert
  | 'gastro.receipt.bewirtung_detected'; // M03-Detector fertig

export interface ReceiptExtractedPayload {
  beleg_id: string;
  tenant_id: string;
  /** OCR-Volltext — wird fuer Bewirtungs-Detection benoetigt */
  raw_text: string;
  /** Erkannter Lieferant (null wenn nicht extrahiert) */
  supplier_name: string | null;
}

// ── Customer-Events ───────────────────────────────────────────────────────────

export type CustomerEventType = 'customer.created' | 'customer.updated' | 'customer.soft_deleted';

export interface CustomerEventPayload {
  customer_id: string;
  /** Kurzname für Logging/Tracing — kein PII in der Stream-Nachricht */
  external_id?: string | null;
}

export interface CustomerEvent extends BaseEvent {
  type: CustomerEventType;
  payload: CustomerEventPayload;
}

// ── Redis-Stream-Message (flat) ───────────────────────────────────────────────

/**
 * So sieht ein Event in Redis Streams aus (alle Werte als Strings).
 */
export interface RawStreamMessage {
  type: string;
  tenant_id: string;
  timestamp: string;
  payload: string; // JSON.stringify(EventPayload)
}
