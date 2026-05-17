/**
 * Error-Log-Repository (Welt A, TEXT customer_id).
 *
 * Wird vom POST /api/v1/errors-Endpoint und vom WF-ERROR-HANDLER
 * indirekt befüllt. Indizes (Migration 022) sorgen dafür, dass
 * "unresolved errors für customer X" effizient läuft.
 */

import type { Pool } from 'pg';

export interface ErrorLogInput {
  customer_id: string;
  receipt_id?: string | null;
  stage?: string | null;
  error_type?: string | null;
  error_message: string;
  stack_trace?: string | null;
  trace_id?: string | null;
}

export interface ErrorLogRow extends ErrorLogInput {
  error_id: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export async function insertError(pool: Pool, input: ErrorLogInput): Promise<ErrorLogRow> {
  const { rows } = await pool.query<{
    error_id: string;
    customer_id: string;
    receipt_id: string | null;
    stage: string | null;
    error_type: string | null;
    error_message: string;
    stack_trace: string | null;
    trace_id: string | null;
    resolved: boolean;
    resolved_at: Date | null;
    resolved_by: string | null;
    created_at: Date;
  }>(
    `INSERT INTO error_log (
        customer_id, receipt_id, stage, error_type, error_message, stack_trace, trace_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING error_id, customer_id, receipt_id, stage, error_type, error_message,
                stack_trace, trace_id, resolved, resolved_at, resolved_by, created_at`,
    [
      input.customer_id,
      input.receipt_id ?? null,
      input.stage ?? null,
      input.error_type ?? null,
      input.error_message,
      input.stack_trace ?? null,
      input.trace_id ?? null,
    ],
  );
  const r = rows[0];
  return {
    error_id: r.error_id,
    customer_id: r.customer_id,
    receipt_id: r.receipt_id,
    stage: r.stage,
    error_type: r.error_type,
    error_message: r.error_message,
    stack_trace: r.stack_trace,
    trace_id: r.trace_id,
    resolved: r.resolved,
    resolved_at: r.resolved_at?.toISOString() ?? null,
    resolved_by: r.resolved_by,
    created_at: r.created_at.toISOString(),
  };
}

export async function listErrors(
  pool: Pool,
  customerId: string,
  opts: { receiptId?: string; resolved?: boolean; limit?: number } = {},
): Promise<ErrorLogRow[]> {
  const conditions = ['customer_id = $1'];
  const params: unknown[] = [customerId];
  let p = 2;
  if (opts.receiptId) {
    conditions.push(`receipt_id = $${p++}`);
    params.push(opts.receiptId);
  }
  if (typeof opts.resolved === 'boolean') {
    conditions.push(`resolved = $${p++}`);
    params.push(opts.resolved);
  }
  params.push(opts.limit ?? 100);
  const sql = `SELECT error_id, customer_id, receipt_id, stage, error_type, error_message,
                      stack_trace, trace_id, resolved, resolved_at, resolved_by, created_at
                 FROM error_log
                WHERE ${conditions.join(' AND ')}
                ORDER BY created_at DESC
                LIMIT $${p}`;
  const { rows } = await pool.query<{
    error_id: string;
    customer_id: string;
    receipt_id: string | null;
    stage: string | null;
    error_type: string | null;
    error_message: string;
    stack_trace: string | null;
    trace_id: string | null;
    resolved: boolean;
    resolved_at: Date | null;
    resolved_by: string | null;
    created_at: Date;
  }>(sql, params);
  return rows.map((r) => ({
    error_id: r.error_id,
    customer_id: r.customer_id,
    receipt_id: r.receipt_id,
    stage: r.stage,
    error_type: r.error_type,
    error_message: r.error_message,
    stack_trace: r.stack_trace,
    trace_id: r.trace_id,
    resolved: r.resolved,
    resolved_at: r.resolved_at?.toISOString() ?? null,
    resolved_by: r.resolved_by,
    created_at: r.created_at.toISOString(),
  }));
}
