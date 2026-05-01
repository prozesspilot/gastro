/**
 * D9 — Routing-Repository
 *
 * Datenbankzugriff für routing_jobs. Alle Queries laufen über withTenant()
 * (außer claimNextJob, das systemweit läuft und einen Pool-Client braucht).
 *
 * Öffentliche API:
 *   createJob(pool, tenantId, input)
 *   findJobById(pool, tenantId, id)
 *   listJobs(pool, tenantId, query)
 *   updateJobStatus(pool, tenantId, id, status, result?)
 *   failJob(pool, tenantId, id, errorMessage)
 */

import type { Pool } from 'pg';
import { withTenant } from '../../core/db/tenant';
import { buildPaginationMeta, type PaginationMeta } from '../../core/schemas/common';

// ── Typen ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'dead';

export interface CreateJobInput {
  document_id?: string | null;
  payload:      Record<string, unknown>;
  max_attempts?: number;
  run_at?:      Date;
}

export interface JobResponse {
  id:            string;
  tenant_id:     string;
  document_id:   string | null;
  status:        JobStatus;
  attempts:      number;
  max_attempts:  number;
  error_message: string | null;
  payload:       Record<string, unknown>;
  result:        Record<string, unknown> | null;
  run_at:        string;
  created_at:    string;
  updated_at:    string;
}

export interface ListJobsQuery {
  page:    number;
  limit:   number;
  status?: JobStatus;
}

// ── Hilfsfunktion: Row → Response ─────────────────────────────────────────────

function rowToResponse(row: Record<string, unknown>): JobResponse {
  return {
    id:            row.id as string,
    tenant_id:     row.tenant_id as string,
    document_id:   (row.document_id as string | null) ?? null,
    status:        row.status as JobStatus,
    attempts:      Number(row.attempts),
    max_attempts:  Number(row.max_attempts),
    error_message: (row.error_message as string | null) ?? null,
    payload:       (row.payload as Record<string, unknown>) ?? {},
    result:        (row.result as Record<string, unknown> | null) ?? null,
    run_at:        (row.run_at as Date).toISOString(),
    created_at:    (row.created_at as Date).toISOString(),
    updated_at:    (row.updated_at as Date).toISOString(),
  };
}

// ── Repository-Funktionen ─────────────────────────────────────────────────────

/** Neuen Job anlegen. */
export async function createJob(
  pool: Pool,
  tenantId: string,
  input: CreateJobInput,
): Promise<JobResponse> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `
      INSERT INTO routing_jobs (tenant_id, document_id, payload, max_attempts, run_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        tenantId,
        input.document_id ?? null,
        JSON.stringify(input.payload),
        input.max_attempts ?? 3,
        input.run_at ?? new Date(),
      ],
    );
    return rowToResponse(rows[0]);
  });
}

/** Job per ID laden. */
export async function findJobById(
  pool: Pool,
  tenantId: string,
  id: string,
): Promise<JobResponse | null> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT * FROM routing_jobs WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}

/** Paginierte Job-Liste mit optionalem Status-Filter. */
export async function listJobs(
  pool: Pool,
  tenantId: string,
  query: ListJobsQuery,
): Promise<{ data: JobResponse[]; pagination: PaginationMeta }> {
  const offset = (query.page - 1) * query.limit;

  return withTenant(pool, tenantId, async (client) => {
    const conditionParams: unknown[] = [];
    const conditions:  string[]  = [];

    if (query.status) {
      conditionParams.push(query.status);
      conditions.push(`status = $${conditionParams.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM routing_jobs ${where}`,
      conditionParams,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataParams = [...conditionParams, query.limit, offset];
    const limitIdx  = dataParams.length - 1;
    const offsetIdx = dataParams.length;

    const { rows } = await client.query<Record<string, unknown>>(
      `
      SELECT * FROM routing_jobs
      ${where}
      ORDER BY run_at ASC, created_at ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      dataParams,
    );

    return {
      data:       rows.map(rowToResponse),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  });
}

/** Job-Status aktualisieren (z. B. nach Verarbeitung). */
export async function updateJobStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  status: JobStatus,
  result?: Record<string, unknown> | null,
): Promise<JobResponse | null> {
  return withTenant(pool, tenantId, async (client) => {
    const sets:   string[]  = ['status = $2', 'updated_at = now()'];
    const params: unknown[] = [id, status];

    if (result !== undefined) {
      params.push(JSON.stringify(result));
      sets.push(`result = $${params.length}`);
    }

    const { rows } = await client.query<Record<string, unknown>>(
      `UPDATE routing_jobs SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}

/**
 * Job als fehlgeschlagen markieren, attempts erhöhen.
 * Wenn attempts >= max_attempts → Status "dead".
 */
export async function failJob(
  pool: Pool,
  tenantId: string,
  id: string,
  errorMessage: string,
): Promise<JobResponse | null> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `
      UPDATE routing_jobs
      SET
        attempts      = attempts + 1,
        error_message = $2,
        status        = CASE
                          WHEN attempts + 1 >= max_attempts THEN 'dead'
                          ELSE 'failed'
                        END,
        updated_at    = now()
      WHERE id = $1
      RETURNING *
      `,
      [id, errorMessage],
    );
    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}

/**
 * Job für Retry zurücksetzen: status → queued, attempts → 0, run_at → runAt, result → null.
 * Nur für failed/dead Jobs. Gibt null zurück wenn Job nicht found oder Status passt nicht.
 */
export async function resetJobForRetry(
  pool: Pool,
  tenantId: string,
  id: string,
  runAt: Date,
): Promise<JobResponse | null> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `
      UPDATE routing_jobs
      SET
        status     = 'queued',
        attempts   = 0,
        result     = NULL,
        run_at     = $2,
        updated_at = now()
      WHERE id = $1
        AND status IN ('failed', 'dead')
      RETURNING *
      `,
      [id, runAt],
    );
    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}

/**
 * Nächsten fälligen Job atomar reservieren (FOR UPDATE SKIP LOCKED).
 * Läuft als System-Query ohne Tenant-Kontext — der Tenant wird aus der Row gelesen.
 *
 * @returns Job-Row oder null wenn keine Jobs bereit
 */
export async function claimNextJob(pool: Pool): Promise<JobResponse | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<Record<string, unknown>>(
      `
      UPDATE routing_jobs
      SET status = 'running', attempts = attempts + 1, updated_at = now()
      WHERE id = (
        SELECT id FROM routing_jobs
        WHERE status IN ('queued', 'failed')
          AND run_at <= now()
          AND attempts < max_attempts
        ORDER BY run_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
      `,
    );
    await client.query('COMMIT');
    return rows[0] ? rowToResponse(rows[0]) : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
