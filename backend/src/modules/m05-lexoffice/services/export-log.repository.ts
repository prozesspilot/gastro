/**
 * T009 — Repository fuer die existierende export_log-Tabelle (Migration 050).
 *
 * Idempotenz (per Schema):
 *   * UNIQUE-Index idx_export_log_beleg_target_pushed: pro (beleg_id, target)
 *     max. 1 Row mit status='pushed'.
 *   * Wiederholungs-Versuche zaehlen attempt_no hoch und schreiben separate
 *     Rows (status='failed' oder 'pushed').
 *
 * RLS-Pattern wie ueblich: BEGIN/COMMIT + setTenantContext.
 */

import type { Pool, PoolClient } from 'pg';

export type ExportTarget =
  | 'datev'
  | 'lexware_office'
  | 'sevdesk'
  | 'excel'
  | 'google_sheets'
  | 'imap_monthly'
  | 'manual';

export type ExportStatus = 'pushed' | 'failed' | 'skipped' | 'retry_pending';

export interface ExportLogEntry {
  id: string;
  tenant_id: string;
  beleg_id: string | null;
  period_year: number | null;
  period_month: number | null;
  target: ExportTarget;
  status: ExportStatus;
  external_id: string | null;
  external_url: string | null;
  error_code: string | null;
  error_message: string | null;
  payload: Record<string, unknown>;
  attempt_no: number;
  pushed_at: Date;
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  // T041: Key MUSS app.current_tenant sein (von RLS-Policy current_tenant_id() gelesen).
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

/**
 * Hat dieser Beleg schon einen 'pushed'-Eintrag fuer das Target?
 * Wird vom Service als Pre-Check verwendet — wenn ja: Skip + return existing.
 */
export async function findExistingPushedExport(
  pool: Pool,
  tenantId: string,
  belegId: string,
  target: ExportTarget,
): Promise<ExportLogEntry | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<ExportLogEntry>(
      `SELECT * FROM export_log
        WHERE tenant_id = $1 AND beleg_id = $2 AND target = $3 AND status = 'pushed'
        ORDER BY pushed_at DESC
        LIMIT 1`,
      [tenantId, belegId, target],
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
 * Wieviele Push-Versuche gab es schon fuer (beleg, target)? Wird fuer
 * attempt_no des naechsten Versuchs gebraucht.
 */
export async function countAttempts(
  pool: Pool,
  tenantId: string,
  belegId: string,
  target: ExportTarget,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM export_log
        WHERE tenant_id = $1 AND beleg_id = $2 AND target = $3`,
      [tenantId, belegId, target],
    );

    await client.query('COMMIT');
    return Number.parseInt(result.rows[0].count, 10);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface RecordExportInput {
  tenantId: string;
  belegId: string;
  target: ExportTarget;
  status: ExportStatus;
  externalId?: string | null;
  externalUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
  attemptNo: number;
}

/**
 * Schreibt einen Export-Versuch ins Log. Wird bei jedem Push aufgerufen,
 * egal ob Erfolg oder Fehler. UNIQUE-Index auf (beleg_id, target) WHERE
 * status='pushed' verhindert doppelte Erfolgs-Eintraege.
 */
export async function recordExport(pool: Pool, input: RecordExportInput): Promise<ExportLogEntry> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    const result = await client.query<ExportLogEntry>(
      `INSERT INTO export_log
         (tenant_id, beleg_id, target, status, external_id, external_url,
          error_code, error_message, payload, attempt_no)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING *`,
      [
        input.tenantId,
        input.belegId,
        input.target,
        input.status,
        input.externalId ?? null,
        input.externalUrl ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        JSON.stringify(input.payload ?? {}),
        input.attemptNo,
      ],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Listet alle Belege eines Tenants, die noch KEINEN pushed-Eintrag fuer das
 * Target haben (Batch-Push-Vorbereitung).
 *
 * Filter: nur Belege mit status IN ('extracted','categorized','archived')
 * — also OCR fertig und sinnvoll exportierbar.
 */
export async function findBelegIdsPendingExport(
  pool: Pool,
  tenantId: string,
  target: ExportTarget,
  limit = 100,
): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<{ id: string }>(
      `SELECT b.id FROM belege b
        WHERE b.tenant_id = $1
          AND b.status IN ('extracted', 'categorized', 'archived', 'exported')
          AND NOT EXISTS (
            SELECT 1 FROM export_log e
             WHERE e.beleg_id = b.id AND e.target = $2 AND e.status = 'pushed'
          )
        ORDER BY b.received_at ASC
        LIMIT $3`,
      [tenantId, target, limit],
    );

    await client.query('COMMIT');
    return result.rows.map((r) => r.id);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
