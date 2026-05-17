/**
 * M08 — Audit-Wrapper.
 */

import type { Pool } from 'pg';
import { logger } from '../../../core/logger';

const SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export interface AuditEntry {
  customerId: string;
  reportId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
  traceId?: string;
}

export async function writeReportAudit(db: Pool, entry: AuditEntry): Promise<void> {
  const resource = entry.reportId
    ? `customer:${entry.customerId}/report:${entry.reportId}`
    : `customer:${entry.customerId}`;
  const payload = {
    ...(entry.payload ?? {}),
    actor: { type: 'system', id: 'M08' },
    ...(entry.traceId ? { trace_id: entry.traceId } : {}),
  };
  try {
    await db.query(
      `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [SENTINEL_TENANT_ID, 'M08', entry.eventType, resource, JSON.stringify(payload)],
    );
  } catch (err) {
    logger.warn({ err }, 'M08 Audit-Insert fehlgeschlagen');
  }
}
