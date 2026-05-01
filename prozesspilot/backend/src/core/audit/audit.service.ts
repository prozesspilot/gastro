/**
 * Audit-Service
 *
 * Schreibt strukturierte Einträge in `audit_log`. Die Tabelle wurde in
 * Migration 001 angelegt (Spalten: actor, action, resource, payload) und in
 * Migration 014 um entity_type + entity_id erweitert.
 *
 * Best-effort: Fehler werden geloggt, aber nicht propagiert.
 */

import type { Pool } from 'pg';
import { logger } from '../logger';

export interface AuditPayload {
  [key: string]: unknown;
}

export async function log(
  db: Pool,
  tenantId: string,
  entityType: string,
  entityId: string,
  action: string,
  payload: AuditPayload = {},
  actor: string = 'system',
): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO audit_log (tenant_id, entity_type, entity_id, action, actor, resource, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        entityType,
        entityId,
        action,
        actor,
        `${entityType}:${entityId}`,
        JSON.stringify(payload),
      ],
    );
  } catch (err) {
    logger.error(
      { err, tenantId, entityType, entityId, action },
      'audit.log fehlgeschlagen',
    );
  }
}
