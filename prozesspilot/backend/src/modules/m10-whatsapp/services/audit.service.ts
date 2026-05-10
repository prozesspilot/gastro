/**
 * M10 — Audit-Service-Stub
 *
 * Schreibt einen Eintrag in die `audit_log`-Tabelle (Foundation D2).
 * Best-effort: Fehler beim Audit-Insert dürfen die Hauptoperation nicht stoppen.
 *
 * Sobald der zentrale `auditService` aus D10/Phase 2 verfügbar ist, sollte
 * dieser Wrapper durch ihn ersetzt werden.
 *
 * Spec-Referenz:
 *   M10 §16 ("Audit-Log enthält Entry `received` mit Trace-ID")
 *   01_Datenmodell_Events.md §6 (audit_log Tabelle)
 *   00_Architektur_Hauptdokument.md §7.2
 */

import type { Pool } from 'pg';
import { logger } from '../../../core/logger';

export interface AuditEntry {
  customerId: string;
  receiptId?: string;
  eventType: string; // z. B. 'received', 'media.duplicate', 'sender.rejected'
  actor?: { type: string; id: string }; // Default: { type:'system', id:'M10' }
  payload?: Record<string, unknown>;
  traceId?: string;
}

/**
 * Schreibt einen Audit-Log-Eintrag. Failed-Insert wird nur geloggt, nicht geworfen.
 *
 * Mapping auf das bestehende audit_log-Schema (001_initial_schema.sql):
 *   - tenant_id   → Sentinel-UUID (M10-Customers haben noch keinen Tenant-Bezug)
 *   - actor       → 'system' | 'n8n' | 'M10' (TEXT)
 *   - action      → eventType ('whatsapp.media.received', ...)
 *   - resource    → 'customer:<cust_id>[/receipt:<receipt_id>]'
 *   - payload     → entry.payload + trace_id + actor-Details
 */
const SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export async function writeAudit(db: Pool, entry: AuditEntry): Promise<void> {
  const actor = entry.actor ?? { type: 'system', id: 'M10' };
  const resource = entry.receiptId
    ? `customer:${entry.customerId}/receipt:${entry.receiptId}`
    : `customer:${entry.customerId}`;
  const payload = {
    ...(entry.payload ?? {}),
    actor,
    ...(entry.traceId ? { trace_id: entry.traceId } : {}),
  };

  try {
    await db.query(
      `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [SENTINEL_TENANT_ID, actor.id, entry.eventType, resource, JSON.stringify(payload)],
    );
  } catch (err) {
    logger.warn({ err, entry }, 'Audit-Log-Insert fehlgeschlagen');
  }
}
