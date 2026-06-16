/**
 * T058/A3 — Beweis, dass `list_tenants_for_staff()` (Migration 121) das
 * Cross-Tenant-Listing korrekt UND eng begrenzt löst, gegen echtes Postgres
 * unter der Prod-Rolle `gastro_app` (NOBYPASSRLS).
 *
 *   1. Unter gastro_app liefert die SECURITY-DEFINER-Funktion ALLE aktiven
 *      Mandanten (cross-tenant) — obwohl tenants FORCE RLS hat.
 *   2. Ein DIREKTES `SELECT FROM tenants` unter gastro_app (ohne Tenant-Context)
 *      liefert 0 Zeilen — der Bypass gilt NUR in der Funktion, nicht generell.
 *
 * Lauf-Strategie wie die T041/T054-RLS-Tests: gegen `DATABASE_URL` (in CI gesetzt +
 * migriert). In CI ist die DB Pflicht; lokal ohne DB sauber übersprungen.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';

const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_A = '0a0a0a0a-0058-4058-8058-0000000000a1';
const T_B = '0b0b0b0b-0058-4058-8058-0000000000b2';
const T_DEL = '0d0d0d0d-0058-4058-8058-0000000000d3'; // soft-deleted → darf NICHT erscheinen
const IDS = [T_A, T_B]; // aktive Test-Tenants
const ALL_IDS = [T_A, T_B, T_DEL]; // inkl. gelöschter — für Seed/Cleanup

let pool: pg.Pool;
let dbAvailable = false;

async function assertRunningAsGastroApp(client: pg.PoolClient): Promise<void> {
  const who = await client.query<{ current_user: string }>('SELECT current_user');
  if (who.rows[0]?.current_user !== 'gastro_app') {
    throw new Error(
      `[T058] SET ROLE gastro_app griff nicht (current_user=${who.rows[0]?.current_user}) — Test wäre wirkungslos.`,
    );
  }
}

/** Führt `fn` unter gastro_app (ohne Tenant-Context) in einer Rollback-Transaktion aus. */
async function asGastroApp<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gastro_app');
    await assertRunningAsGastroApp(client);
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
    if (REQUIRE_DB) {
      throw new Error(
        `[T058] DB unter DATABASE_URL nicht erreichbar — in CI Pflicht. ${String(err)}`,
      );
    }
    return;
  }

  // gastro_app (Caller) + gastro_owner (Funktions-Owner) — beide NOSUPERUSER,
  // damit der Integration-Test den ECHTEN Prod-Bypass-Pfad ausübt (is_rls_bypassed
  // über die Owner-ROLLE gastro_owner, NICHT über den Superuser-Kurzschluss).
  await pool.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_app') THEN
         CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_owner') THEN
         CREATE ROLE gastro_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
     END $$;`,
  );
  await pool.query('GRANT SELECT ON tenants TO gastro_app, gastro_owner');
  // Funktion auf den Prod-Owner umstellen → SECURITY DEFINER läuft als
  // gastro_owner (non-superuser), genau wie in Production.
  await pool.query('ALTER FUNCTION list_tenants_for_staff() OWNER TO gastro_owner');

  // Seed als verbundener Superuser pp (RLS-Bypass). T_DEL ist soft-deleted.
  await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ALL_IDS]);
  for (const [id, slug] of [
    [T_A, 't058-a'],
    [T_B, 't058-b'],
  ] as const) {
    await pool.query('INSERT INTO tenants (id, slug, display_name) VALUES ($1, $2, $3)', [
      id,
      slug,
      `T058 ${slug}`,
    ]);
  }
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, deleted_at) VALUES ($1, $2, $3, now())',
    [T_DEL, 't058-del', 'T058 deleted'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ALL_IDS]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T058 — list_tenants_for_staff() unter gastro_app (NOBYPASSRLS)', () => {
  it('liefert cross-tenant ALLE aktiven Mandanten (beide Test-Tenants)', async () => {
    if (!dbAvailable) return;
    const ids = await asGastroApp(async (c) => {
      const res = await c.query<{ id: string }>(
        'SELECT id FROM list_tenants_for_staff() WHERE id = ANY($1::uuid[])',
        [IDS],
      );
      return res.rows.map((r) => r.id).sort();
    });
    expect(ids).toEqual([...IDS].sort());
  });

  it('DIREKTES SELECT auf tenants unter gastro_app (ohne Context) → 0 Zeilen (kein genereller Bypass)', async () => {
    if (!dbAvailable) return;
    const count = await asGastroApp(async (c) => {
      const res = await c.query('SELECT id FROM tenants WHERE id = ANY($1::uuid[])', [IDS]);
      return res.rowCount;
    });
    expect(count).toBe(0);
  });

  it('soft-deleted Mandant (deleted_at) erscheint NICHT in der Liste', async () => {
    if (!dbAvailable) return;
    const found = await asGastroApp(async (c) => {
      const res = await c.query('SELECT id FROM list_tenants_for_staff() WHERE id = $1', [T_DEL]);
      return res.rowCount;
    });
    expect(found).toBe(0);
  });

  it('Bypass leakt nicht: Funktion + danach direktes SELECT in DERSELBEN Transaktion → 0 Zeilen', async () => {
    if (!dbAvailable) return;
    const count = await asGastroApp(async (c) => {
      // Funktion aufrufen (setzt app.bypass_rls lokal) …
      await c.query('SELECT id FROM list_tenants_for_staff()');
      // … danach direkt auf tenants — der Bypass darf hier NICHT mehr greifen.
      const res = await c.query('SELECT id FROM tenants WHERE id = ANY($1::uuid[])', [IDS]);
      return res.rowCount;
    });
    expect(count).toBe(0);
  });
});
