/**
 * T043 — Integrationstest: `tenant_exists()` (Migration 130) funktioniert unter der
 * Prod-Rolle `gastro_app` (NOSUPERUSER NOBYPASSRLS), wo der frühere nackte
 * `SELECT 1 FROM tenants …` (ohne Tenant-Kontext) durch die FORCE-RLS-Policy von
 * `tenants` (`is_rls_bypassed() OR current_tenant_id() = id`) IMMER 0 Zeilen lieferte.
 *
 * Der Test beweist BEIDES gegen echtes Postgres unter `SET LOCAL ROLE gastro_app`:
 *   - der ALTE Ansatz (bare query) sieht die Zeile NICHT (0 rows) → belegt den Bug,
 *   - die neue SECURITY-DEFINER-Funktion `tenant_exists()` liefert korrekt true/false.
 *
 * Lauf-Strategie wie der T054-RLS-Test: gegen `DATABASE_URL` (in CI gesetzt +
 * migriert). In CI ist die DB Pflicht; lokal ohne DB sauber übersprungen.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const TENANT = '0a43a43a-0043-4043-8043-000000000a43';
const MISSING = '0a43a43a-0043-4043-8043-0000000ffff0';
const DELETED = '0a43a43a-0043-4043-8043-00000000de1e';

let pool: pg.Pool;
let dbAvailable = false;

async function assertGastroApp(client: pg.PoolClient): Promise<void> {
  const who = await client.query<{ current_user: string }>('SELECT current_user');
  if (who.rows[0]?.current_user !== 'gastro_app') {
    throw new Error(
      `[T043] SET ROLE gastro_app griff nicht (current_user=${who.rows[0]?.current_user}) — der RLS-Test wäre wirkungslos.`,
    );
  }
}

/** Führt `fn` unter gastro_app (NOBYPASSRLS), OHNE app.current_tenant, in einer Rollback-Tx aus. */
async function asGastroApp<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gastro_app');
    await assertGastroApp(client);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) throw new Error(`[T043] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    return;
  }

  // gastro_app + EXECUTE-Grant sicherstellen (in CI durch Migration 130 bereits da;
  // idempotent, deckt eine lokale DB ohne den CI-Setup-Schritt ab).
  await pool.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_app') THEN
         CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
     END $$;`,
  );
  await pool.query('GRANT EXECUTE ON FUNCTION tenant_exists(uuid) TO gastro_app');

  await pool.query('DELETE FROM tenants WHERE id = ANY($1)', [[TENANT, DELETED]]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [TENANT, 't043-exists', 'T043 Exists', 't043@example.com'],
  );
  await pool.query(
    `INSERT INTO tenants (id, slug, display_name, contact_email, deleted_at)
     VALUES ($1, $2, $3, $4, now())`,
    [DELETED, 't043-deleted', 'T043 Deleted', 't043-del@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM tenants WHERE id = ANY($1)', [[TENANT, DELETED]]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T043 — tenant_exists() unter gastro_app (NOBYPASSRLS)', () => {
  it('der ALTE bare query (ohne Tenant-Kontext) sieht die Zeile NICHT — belegt den Bug', async () => {
    if (!dbAvailable) return;
    const rows = await asGastroApp(async (c) => {
      const r = await c.query('SELECT 1 FROM tenants WHERE id = $1 AND deleted_at IS NULL', [
        TENANT,
      ]);
      return r.rows.length;
    });
    // RLS blockt: kein app.current_tenant → current_tenant_id() = NULL → 0 Zeilen.
    expect(rows).toBe(0);
  });

  it('tenant_exists() liefert true für einen existierenden Mandanten (Fix)', async () => {
    if (!dbAvailable) return;
    const exists = await asGastroApp(async (c) => {
      const r = await c.query<{ exists: boolean }>('SELECT tenant_exists($1::uuid) AS exists', [
        TENANT,
      ]);
      return r.rows[0]?.exists;
    });
    expect(exists).toBe(true);
  });

  it('tenant_exists() liefert false für einen unbekannten Mandanten', async () => {
    if (!dbAvailable) return;
    const exists = await asGastroApp(async (c) => {
      const r = await c.query<{ exists: boolean }>('SELECT tenant_exists($1::uuid) AS exists', [
        MISSING,
      ]);
      return r.rows[0]?.exists;
    });
    expect(exists).toBe(false);
  });

  it('tenant_exists() liefert false für einen soft-deleted Mandanten', async () => {
    if (!dbAvailable) return;
    const exists = await asGastroApp(async (c) => {
      const r = await c.query<{ exists: boolean }>('SELECT tenant_exists($1::uuid) AS exists', [
        DELETED,
      ]);
      return r.rows[0]?.exists;
    });
    expect(exists).toBe(false);
  });

  it('der Aufrufer (gastro_app) bleibt nach tenant_exists() RLS-blockiert (keine Eskalation)', async () => {
    if (!dbAvailable) return;
    // Sicherheits-Eigenschaft: Der Aufrufer kann tenants weiterhin NICHT cross-tenant
    // lesen. (Hinweis: Das beweist NICHT allein die GUC-Transaktions-Lokalität — selbst
    // bei einem GUC-Leak bliebe gastro_app blockiert, weil is_rls_bypassed() zuerst die
    // Rolle prüft [002_helpers.sql] und gastro_app weder Owner noch Superuser ist. Die
    // Lokalität garantieren set_config(..., true)=LOCAL + der explizite Reset in der Fn.)
    const rowsAfter = await asGastroApp(async (c) => {
      await c.query('SELECT tenant_exists($1::uuid)', [TENANT]);
      const r = await c.query('SELECT 1 FROM tenants WHERE id = $1 AND deleted_at IS NULL', [
        TENANT,
      ]);
      return r.rows.length;
    });
    expect(rowsAfter).toBe(0);
  });
});
