/**
 * Hook-Repository (Welt A, TEXT customer_id).
 *
 * Liest und schreibt zwei Tabellen:
 *   - customer_hooks    (Migration 018) — Hook-Definitionen
 *   - hook_executions   (Migration 022) — Ausführungs-Log pro Aufruf
 *
 * Backwards-Compat-Hinweis: Der bestehende hook-runner.ts nutzte vorher
 * Inline-SQL in `loadHooks()`. Diese Repository-API kapselt diese Queries und
 * stellt CRUD bereit, das hook.routes.ts exposed.
 */

import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

import type {
  CustomerHook,
  HookConfig,
  HookImplementation,
  HookPoint,
} from './hook.types';

// ── Typen ────────────────────────────────────────────────────────────────────

export interface HookExecutionRow {
  execution_id: string;
  hook_id: string;
  customer_id: string;
  receipt_id: string | null;
  hook_point: string;
  status: 'success' | 'failure' | 'timeout' | 'skipped';
  request_payload: unknown | null;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  error_message: string | null;
  trace_id: string | null;
  created_at: string;
}

export interface CreateHookInput {
  customer_id: string;
  hook_point: HookPoint;
  implementation: HookImplementation;
  config: HookConfig;
  enabled?: boolean;
  priority?: number;
}

export interface UpdateHookInput {
  hook_point?: HookPoint;
  implementation?: HookImplementation;
  config?: HookConfig;
  enabled?: boolean;
  priority?: number;
}

export interface LogExecutionInput {
  hook_id: string;
  customer_id: string;
  receipt_id?: string | null;
  hook_point: HookPoint | string;
  status: 'success' | 'failure' | 'timeout' | 'skipped';
  request_payload?: unknown;
  response_status?: number | null;
  response_body?: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
  trace_id?: string | null;
}

// ── Lookup für Runner ────────────────────────────────────────────────────────

interface DbHookRow {
  hook_id: string;
  customer_id: string;
  hook_point: string;
  implementation: string;
  config: unknown;
  enabled: boolean;
  priority: number;
}

function rowToHook(r: DbHookRow): CustomerHook {
  return {
    hook_id: r.hook_id,
    customer_id: r.customer_id,
    hook_point: r.hook_point as HookPoint,
    implementation: r.implementation as HookImplementation,
    config: (r.config ?? {}) as HookConfig,
    enabled: r.enabled,
    priority: r.priority,
  };
}

/** Wird vom Hook-Runner für die Pipeline verwendet. */
export async function getActiveHooks(
  pool: Pool | PoolClient,
  customerId: string,
  hookPoint: HookPoint,
): Promise<CustomerHook[]> {
  const { rows } = await pool.query<DbHookRow>(
    `SELECT hook_id, customer_id, hook_point, implementation, config, enabled, priority
       FROM customer_hooks
      WHERE customer_id = $1 AND hook_point = $2 AND enabled = true
      ORDER BY priority ASC, hook_id ASC`,
    [customerId, hookPoint],
  );
  return rows.map(rowToHook);
}

// ── CRUD für API ────────────────────────────────────────────────────────────

export async function listHooks(pool: Pool, customerId: string): Promise<CustomerHook[]> {
  const { rows } = await pool.query<DbHookRow>(
    `SELECT hook_id, customer_id, hook_point, implementation, config, enabled, priority
       FROM customer_hooks
      WHERE customer_id = $1
      ORDER BY priority ASC, hook_id ASC`,
    [customerId],
  );
  return rows.map(rowToHook);
}

export async function findHookById(
  pool: Pool,
  customerId: string,
  hookId: string,
): Promise<CustomerHook | null> {
  const { rows } = await pool.query<DbHookRow>(
    `SELECT hook_id, customer_id, hook_point, implementation, config, enabled, priority
       FROM customer_hooks
      WHERE customer_id = $1 AND hook_id = $2
      LIMIT 1`,
    [customerId, hookId],
  );
  return rows[0] ? rowToHook(rows[0]) : null;
}

export async function createHook(pool: Pool, input: CreateHookInput): Promise<CustomerHook> {
  const hookId = `hk_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const { rows } = await pool.query<DbHookRow>(
    `INSERT INTO customer_hooks (hook_id, customer_id, hook_point, implementation, config, enabled, priority)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING hook_id, customer_id, hook_point, implementation, config, enabled, priority`,
    [
      hookId,
      input.customer_id,
      input.hook_point,
      input.implementation,
      JSON.stringify(input.config ?? {}),
      input.enabled ?? true,
      input.priority ?? 100,
    ],
  );
  return rowToHook(rows[0]);
}

export async function updateHook(
  pool: Pool,
  customerId: string,
  hookId: string,
  patch: UpdateHookInput,
): Promise<CustomerHook | null> {
  // Nur die Felder updaten, die im Patch enthalten sind.
  const sets: string[] = [];
  const params: unknown[] = [customerId, hookId];
  let p = 3;
  if (patch.hook_point !== undefined) { sets.push(`hook_point = $${p++}`); params.push(patch.hook_point); }
  if (patch.implementation !== undefined) { sets.push(`implementation = $${p++}`); params.push(patch.implementation); }
  if (patch.config !== undefined) { sets.push(`config = $${p++}::jsonb`); params.push(JSON.stringify(patch.config)); }
  if (patch.enabled !== undefined) { sets.push(`enabled = $${p++}`); params.push(patch.enabled); }
  if (patch.priority !== undefined) { sets.push(`priority = $${p++}`); params.push(patch.priority); }
  if (sets.length === 0) {
    return findHookById(pool, customerId, hookId);
  }
  sets.push('updated_at = now()');
  const sql = `UPDATE customer_hooks SET ${sets.join(', ')}
                 WHERE customer_id = $1 AND hook_id = $2
              RETURNING hook_id, customer_id, hook_point, implementation, config, enabled, priority`;
  const { rows } = await pool.query<DbHookRow>(sql, params);
  return rows[0] ? rowToHook(rows[0]) : null;
}

export async function deleteHook(
  pool: Pool,
  customerId: string,
  hookId: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM customer_hooks WHERE customer_id = $1 AND hook_id = $2`,
    [customerId, hookId],
  );
  return (rowCount ?? 0) > 0;
}

// ── Execution-Log ───────────────────────────────────────────────────────────

export async function logExecution(
  pool: Pool | PoolClient,
  input: LogExecutionInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO hook_executions (
        hook_id, customer_id, receipt_id, hook_point, status,
        request_payload, response_status, response_body, duration_ms,
        error_message, trace_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6::jsonb, $7, $8, $9,
        $10, $11
      )`,
    [
      input.hook_id,
      input.customer_id,
      input.receipt_id ?? null,
      input.hook_point,
      input.status,
      input.request_payload === undefined ? null : JSON.stringify(input.request_payload),
      input.response_status ?? null,
      input.response_body ?? null,
      input.duration_ms ?? null,
      input.error_message ?? null,
      input.trace_id ?? null,
    ],
  );
}

export async function listExecutions(
  pool: Pool,
  customerId: string,
  hookId: string,
  limit = 50,
): Promise<HookExecutionRow[]> {
  const { rows } = await pool.query<{
    execution_id: string;
    hook_id: string;
    customer_id: string;
    receipt_id: string | null;
    hook_point: string;
    status: 'success' | 'failure' | 'timeout' | 'skipped';
    request_payload: unknown;
    response_status: number | null;
    response_body: string | null;
    duration_ms: number | null;
    error_message: string | null;
    trace_id: string | null;
    created_at: Date;
  }>(
    `SELECT execution_id, hook_id, customer_id, receipt_id, hook_point, status,
            request_payload, response_status, response_body, duration_ms,
            error_message, trace_id, created_at
       FROM hook_executions
      WHERE customer_id = $1 AND hook_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [customerId, hookId, limit],
  );
  return rows.map((r) => ({
    ...r,
    request_payload: r.request_payload ?? null,
    created_at: r.created_at.toISOString(),
  }));
}
