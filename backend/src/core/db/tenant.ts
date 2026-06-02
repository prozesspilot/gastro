/**
 * D2 — Tenant-Context-Helper
 *
 * Setzt die Postgres-Session-Variable `app.current_tenant` vor jeder Query,
 * damit die RLS-Policies greifen können.
 *
 * WICHTIG (T041): Der GUC-Key MUSS exakt `app.current_tenant` heißen — das ist
 * der einzige Key, den die RLS-Policy-Funktion `current_tenant_id()`
 * (migrations/002_helpers.sql) liest. Frühere Stellen setzten fälschlich
 * `app.tenant_id` bzw. `app.current_tenant_id`; unter der Prod-Rolle
 * `gastro_app` (NOBYPASSRLS) ergab das `current_tenant_id() = NULL` →
 * RLS blockt alle Zeilen. Immer die exportierte Konstante TENANT_GUC nutzen,
 * nie den String-Literal duplizieren.
 *
 * Verwendung:
 *   import { withTenant } from './core/db/tenant';
 *
 *   const result = await withTenant(app.db, tenantId, async (client) => {
 *     return client.query('SELECT * FROM customers');
 *   });
 */

import type { Pool, PoolClient, QueryResult } from 'pg';

/**
 * Kanonischer Name der Postgres-Session-Variable für den Tenant-Kontext.
 * Single Source of Truth — von `current_tenant_id()` in 002_helpers.sql gelesen.
 */
export const TENANT_GUC = 'app.current_tenant' as const;

type TenantCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Führt `fn` in einer DB-Transaktion mit gesetztem Tenant-Kontext aus.
 *
 * Die Session-Variable `app.current_tenant` gilt nur für diese Transaktion
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
    await client.query('SELECT set_config($1, $2, true)', [TENANT_GUC, tenantId]);
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
    await client.query('SELECT set_config($1, $2, true)', [TENANT_GUC, tenantId]);
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
