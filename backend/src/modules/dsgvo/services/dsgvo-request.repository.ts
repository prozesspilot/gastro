/**
 * T010/M12 — Repository fuer die dsgvo_requests-Tabelle (Migration 080).
 *
 * Pattern uebernommen aus modules/m01-receipt-intake/services/beleg.repository.ts:
 *   * Explizites BEGIN/COMMIT (B2-Fix — set_config LOCAL braucht Tx).
 *   * setTenantContext(client, tenantId) pro Tx.
 *   * Audit-Log-Schreiben in derselben Tx wie Insert (GoBD-Atomicity).
 */

import type { Pool, PoolClient } from 'pg';
import { logAuditEvent } from '../../../core/audit/audit-log';

export type DsgvoRequestType = 'auskunft' | 'loeschung';

export type DsgvoRequestStatus =
  | 'pending'
  | 'confirming'
  | 'processing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface DsgvoRequest {
  id: string;
  tenant_id: string;
  type: DsgvoRequestType;
  status: DsgvoRequestStatus;
  subject_email: string;
  subject_description: string | null;
  requested_by_user_id: string;
  export_object_key: string | null;
  export_password_hash: string | null;
  soft_deleted_count: number;
  hard_deleted_count: number;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
}

export interface CreateDsgvoRequestInput {
  tenantId: string;
  type: DsgvoRequestType;
  subjectEmail: string;
  subjectDescription?: string;
  requestedByUserId: string;
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

/**
 * Legt eine neue DSGVO-Anfrage an (status='pending'). Audit-Log in derselben Tx.
 */
export async function createDsgvoRequest(
  pool: Pool,
  input: CreateDsgvoRequestInput,
): Promise<DsgvoRequest> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    const insertResult = await client.query<DsgvoRequest>(
      `INSERT INTO dsgvo_requests
         (tenant_id, type, subject_email, subject_description, requested_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.tenantId,
        input.type,
        input.subjectEmail,
        input.subjectDescription ?? null,
        input.requestedByUserId,
      ],
    );
    const request = insertResult.rows[0];

    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'dsgvo_request',
      entityId: request.id,
      eventType:
        input.type === 'auskunft'
          ? 'dsgvo.access_request.created'
          : 'dsgvo.erasure_request.created',
      actor: { type: 'staff', id: input.requestedByUserId },
      payloadAfter: {
        type: input.type,
        subject_email_hash: hashEmail(input.subjectEmail),
        subject_description: input.subjectDescription ?? null,
      },
    });

    await client.query('COMMIT');
    return request;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** SHA256-Hash der Email fuer Audit-Log — PII darf nicht im Klartext im Log stehen. */
function hashEmail(email: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export async function getDsgvoRequestById(
  pool: Pool,
  tenantId: string,
  id: string,
): Promise<DsgvoRequest | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<DsgvoRequest>(
      'SELECT * FROM dsgvo_requests WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Setzt einen neuen Status + optionale Felder. Schreibt Audit-Log in derselben Tx.
 *
 * Akzeptierte Folge-Stati sind frei — der Service prüft FSM-Regeln vor dem Call.
 */
export async function updateDsgvoRequestStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<{
    status: DsgvoRequestStatus;
    export_object_key: string | null;
    export_password_hash: string | null;
    soft_deleted_count: number;
    hard_deleted_count: number;
    error_message: string | null;
    completed_at: Date | null;
    expires_at: Date | null;
  }>,
): Promise<DsgvoRequest | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const current = await client.query<{ status: DsgvoRequestStatus; type: DsgvoRequestType }>(
      'SELECT status, type FROM dsgvo_requests WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (current.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const oldStatus = current.rows[0].status;
    const requestType = current.rows[0].type;

    // Dynamische Update-Klausel — nur die Spalten setzen, die im patch enthalten sind.
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;
    for (const [col, val] of Object.entries(patch)) {
      sets.push(`${col} = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }
    if (sets.length === 0) {
      await client.query('COMMIT');
      return current.rows[0] as unknown as DsgvoRequest;
    }
    values.push(id, tenantId);
    const updateResult = await client.query<DsgvoRequest>(
      `UPDATE dsgvo_requests
         SET ${sets.join(', ')}
       WHERE id = $${paramIdx} AND tenant_id = $${paramIdx + 1}
       RETURNING *`,
      values,
    );

    if (patch.status && patch.status !== oldStatus) {
      await logAuditEvent(client, {
        tenantId,
        entityType: 'dsgvo_request',
        entityId: id,
        eventType: `dsgvo.${requestType}.status_changed`,
        actor: { type: 'system', id: 'module:M12-DSGVO' },
        payloadBefore: { status: oldStatus },
        payloadAfter: {
          status: patch.status,
          error: patch.error_message ?? null,
          soft_deleted: patch.soft_deleted_count ?? null,
          hard_deleted: patch.hard_deleted_count ?? null,
        },
      });
    }

    await client.query('COMMIT');
    return updateResult.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Zaehlt aktive DSGVO-Anfragen eines Tenants in den letzten 24h.
 * Rate-Limit-Check: max DSGVO_REQUESTS_PER_DAY_LIMIT.
 *
 * 'cancelled' und 'failed' zaehlen NICHT mit (sonst koennte ein
 * Validierungs-Fehler dauerhaft den Tenant blocken).
 */
export async function countRecentDsgvoRequests(pool: Pool, tenantId: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM dsgvo_requests
        WHERE tenant_id = $1
          AND created_at > now() - INTERVAL '24 hours'
          AND status NOT IN ('cancelled', 'failed')`,
      [tenantId],
    );

    await client.query('COMMIT');
    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
