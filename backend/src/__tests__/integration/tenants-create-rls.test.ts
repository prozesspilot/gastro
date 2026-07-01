/**
 * T093 — Beweis, dass `create_tenant_for_staff()` (Migration 131) einen neuen
 * Mandanten anlegt, obwohl `tenants` FORCE RLS hat, und dass der Bypass NICHT
 * generell greift — gegen echtes Postgres unter der Prod-Rolle `gastro_app`
 * (NOBYPASSRLS).
 *
 *   1. Unter gastro_app legt die SECURITY-DEFINER-Funktion einen Tenant an und
 *      gibt ihn zurück (cross-tenant Write, trotz FORCE RLS).
 *   2. Ein DIREKTES `INSERT INTO tenants` unter gastro_app (ohne Bypass) wird von
 *      der Policy `tenants_write_bypass` (WITH CHECK is_rls_bypassed()) abgelehnt.
 *
 * Lauf-Strategie wie tenants-list-rls (T058): gegen `DATABASE_URL` (in CI gesetzt +
 * migriert). In CI ist die DB Pflicht; lokal ohne DB sauber übersprungen.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';

const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

/** Alle Test-Slugs bekommen dieses Präfix → gezieltes Cleanup ohne Fremd-Daten. */
const SLUG_PREFIX = 't093-create-';

let pool: pg.Pool;
let dbAvailable = false;

async function assertRunningAsGastroApp(client: pg.PoolClient): Promise<void> {
  const who = await client.query<{ current_user: string }>('SELECT current_user');
  if (who.rows[0]?.current_user !== 'gastro_app') {
    throw new Error(
      `[T093] SET ROLE gastro_app griff nicht (current_user=${who.rows[0]?.current_user}) — Test wäre wirkungslos.`,
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
        `[T093] DB unter DATABASE_URL nicht erreichbar — in CI Pflicht. ${String(err)}`,
      );
    }
    return;
  }

  // gastro_app (Caller) + gastro_owner (Funktions-Owner) — beide NOSUPERUSER,
  // damit der Test den ECHTEN Prod-Bypass-Pfad ausübt (is_rls_bypassed über die
  // Owner-ROLLE gastro_owner, nicht über den Superuser-Kurzschluss).
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
  // gastro_app braucht INSERT-Recht, damit der Negativtest an RLS scheitert
  // (nicht an fehlender Tabellen-Berechtigung). Die DEFINER-Funktion läuft als
  // gastro_owner → der braucht ebenfalls INSERT.
  await pool.query('GRANT SELECT, INSERT ON tenants TO gastro_app, gastro_owner');
  await pool.query(
    'ALTER FUNCTION create_tenant_for_staff(text, text, text, text, text, text) OWNER TO gastro_owner',
  );

  await pool.query('DELETE FROM tenants WHERE slug LIKE $1', [`${SLUG_PREFIX}%`]);
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM tenants WHERE slug LIKE $1', [`${SLUG_PREFIX}%`]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T093 — create_tenant_for_staff() unter gastro_app (NOBYPASSRLS)', () => {
  it('legt einen neuen Mandanten an und gibt ihn zurück', async () => {
    if (!dbAvailable) return;
    const slug = `${SLUG_PREFIX}ok`;
    const row = await asGastroApp(async (c) => {
      const res = await c.query<{
        id: string;
        slug: string;
        display_name: string;
        package: string;
        deletion_status: string;
        onboarding_status: string;
      }>('SELECT * FROM create_tenant_for_staff($1, $2, $3, $4, $5, $6)', [
        slug,
        'T093 Neuer Wirt',
        'T093 Neuer Wirt GmbH',
        'wirt@example.test',
        '+49 170 0000000',
        'pro',
      ]);
      return res.rows[0];
    });
    expect(row?.slug).toBe(slug);
    expect(row?.display_name).toBe('T093 Neuer Wirt');
    expect(row?.package).toBe('pro');
    // Defaults greifen:
    expect(row?.deletion_status).toBe('active');
    expect(row?.onboarding_status).toBe('pending');
  });

  it('der neue Mandant taucht danach in list_tenants_for_staff() auf', async () => {
    if (!dbAvailable) return;
    const slug = `${SLUG_PREFIX}listed`;
    // Anlage in eigener (committeter) Verbindung als Superuser-Seed wäre möglich,
    // aber wir prüfen den End-to-End-Pfad: Anlage + Listing in DERSELBEN Transaktion.
    const found = await asGastroApp(async (c) => {
      await c.query('SELECT * FROM create_tenant_for_staff($1, $2, $3, $4, $5, $6)', [
        slug,
        'T093 Listed',
        '',
        '',
        '',
        'standard',
      ]);
      const res = await c.query('SELECT slug FROM list_tenants_for_staff() WHERE slug = $1', [
        slug,
      ]);
      return res.rowCount;
    });
    expect(found).toBe(1);
  });

  it('DIREKTES INSERT INTO tenants unter gastro_app (ohne Bypass) → von RLS abgelehnt', async () => {
    if (!dbAvailable) return;
    await expect(
      asGastroApp(async (c) => {
        await c.query('INSERT INTO tenants (slug, display_name) VALUES ($1, $2)', [
          `${SLUG_PREFIX}direct`,
          'T093 Direct',
        ]);
      }),
    ).rejects.toThrow(/row-level security|new row violates/i);
  });

  it('Bypass leakt nicht: nach dem Funktionsaufruf schlägt ein direktes INSERT weiter fehl', async () => {
    if (!dbAvailable) return;
    await expect(
      asGastroApp(async (c) => {
        await c.query('SELECT * FROM create_tenant_for_staff($1, $2, $3, $4, $5, $6)', [
          `${SLUG_PREFIX}leak-a`,
          'T093 Leak A',
          '',
          '',
          '',
          'standard',
        ]);
        // Bypass war LOCAL in der Funktion → hier NICHT mehr aktiv.
        await c.query('INSERT INTO tenants (slug, display_name) VALUES ($1, $2)', [
          `${SLUG_PREFIX}leak-b`,
          'T093 Leak B',
        ]);
      }),
    ).rejects.toThrow(/row-level security|new row violates/i);
  });
});
