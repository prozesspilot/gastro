/**
 * M03 — Audit-Wrapper.
 *
 * Schreibt einen Eintrag in `audit_log` (best-effort). Sobald der zentrale
 * auditService aus Phase 2 verfügbar ist, sollte dieser Wrapper durch
 * dessen API ersetzt werden.
 */

import type { Pool } from 'pg';
import { logger } from '../../../core/logger';

const SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export interface AuditEntry {
  customerId: string;
  receiptId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  traceId?: string;
  actor?: { type: string; id: string };
}

export async function writeAudit(db: Pool, entry: AuditEntry): Promise<void> {
  const actor = entry.actor ?? { type: 'system', id: 'M03' };
  const resource = `customer:${entry.customerId}/receipt:${entry.receiptId}`;
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
    logger.warn({ err, entry }, 'M03 Audit-Insert fehlgeschlagen');
  }
}
