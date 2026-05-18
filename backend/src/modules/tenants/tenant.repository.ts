/**
 * Tenant-Repository
 *
 * Datenbankzugriff für Mandanten.
 * Tenants sind nicht RLS-geschützt — sie laufen direkt über den Pool.
 *
 * Öffentliche API:
 *   createTenant(pool, input)       → TenantResponse
 *   listTenants(pool, query)        → { data, pagination }
 *   findTenantById(pool, id)        → TenantResponse | null
 *   updateTenant(pool, id, input)   → TenantResponse | null
 */

import type { Pool } from 'pg';
import { type PaginationMeta, buildPaginationMeta } from '../../core/schemas/common';
import type {
  CreateTenantInput,
  TenantResponse,
  UpdateTenantInput,
} from '../../core/schemas/tenant';

// ── Hilfsfunktion ─────────────────────────────────────────────────────────────

function rowToResponse(row: Record<string, unknown>): TenantResponse {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    active: row.active as boolean,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

// ── Repository-Funktionen ─────────────────────────────────────────────────────

/** Neuen Mandanten anlegen. */
export async function createTenant(pool: Pool, input: CreateTenantInput): Promise<TenantResponse> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO tenants (slug, name)
     VALUES ($1, $2)
     RETURNING id, slug, name, active, created_at, updated_at`,
    [input.slug, input.name],
  );
  return rowToResponse(rows[0]);
}

/** Alle Mandanten paginiert auflisten. */
export async function listTenants(
  pool: Pool,
  query: { page: number; limit: number; active?: boolean },
): Promise<{ data: TenantResponse[]; pagination: PaginationMeta }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.active !== undefined) {
    params.push(query.active);
    conditions.push(`active = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.limit;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tenants ${where}`,
    params,
  );
  const total = Number.parseInt(countResult.rows[0].count, 10);

  const dataParams = [...params, query.limit, offset];
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, slug, name, active, created_at, updated_at
     FROM tenants
     ${where}
     ORDER BY created_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );

  return {
    data: rows.map(rowToResponse),
    pagination: buildPaginationMeta(query.page, query.limit, total),
  };
}

/** Einzelnen Mandanten per ID laden. */
export async function findTenantById(pool: Pool, id: string): Promise<TenantResponse | null> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, slug, name, active, created_at, updated_at
     FROM tenants WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToResponse(rows[0]) : null;
}

/**
 * Prüft ob ein Tenant mit der gegebenen ID existiert und nicht gelöscht ist.
 *
 * M11-Fix: Repository-Funktion statt direktem SQL im Handler.
 * Tenants haben kein RLS — direktes pool.query ist korrekt.
 */
export async function tenantExists(pool: Pool, tenantId: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    'SELECT 1 FROM tenants WHERE id = $1 AND deleted_at IS NULL',
    [tenantId],
  );
  return result.rows.length > 0;
}

/** Mandanten-Felder aktualisieren (Partial Update). */
export async function updateTenant(
  pool: Pool,
  id: string,
  input: UpdateTenantInput,
): Promise<TenantResponse | null> {
  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [id]; // $1 = id

  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  if (input.active !== undefined) {
    params.push(input.active);
    sets.push(`active = $${params.length}`);
  }

  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE tenants
     SET ${sets.join(', ')}
     WHERE id = $1
     RETURNING id, slug, name, active, created_at, updated_at`,
    params,
  );
  return rows[0] ? rowToResponse(rows[0]) : null;
}
