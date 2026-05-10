/**
 * D2 — Tenant-Context-Helper
 *
 * Setzt die Postgres-Session-Variable `app.current_tenant_id` vor jeder Query,
 * damit die RLS-Policies greifen können.
 *
 * Verwendung:
 *   import { withTenant } from './core/db/tenant';
 *
 *   const result = await withTenant(app.db, tenantId, async (client) => {
 *     return client.query('SELECT * FROM customers');
 *   });
 */

import type { Pool, PoolClient, QueryResult } from 'pg';

type TenantCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Führt `fn` in einer DB-Transaktion mit gesetztem Tenant-Kontext aus.
 *
 * Die Session-Variable `app.current_tenant_id` gilt nur für diese Transaktion
 * (SET LOCAL), sodass kein Kontext in andere parallele Verbindungen leckt.
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: TenantCallback<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL gilt nur für die aktuelle Transaktion — kein Kontext-Leak
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    // Fehler direkt auf stderr schreiben (wird von vitest nicht abgefangen)
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    process.stderr.write(`\n[withTenant ERROR] ${msg}\n`);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Führt eine einzelne Query mit gesetztem Tenant-Kontext aus (kein explizites
 * BEGIN/COMMIT — nützlich für einfache Lesezugriffe).
 */
export async function queryAsTenant(
  pool: Pool,
  tenantId: string,
  text: string,
  values?: unknown[],
): Promise<QueryResult> {
  const client = await pool.connect();
  try {
    // SET LOCAL braucht eine offene Transaktion
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const result = await client.query(text, values);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
