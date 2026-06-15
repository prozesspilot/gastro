/**
 * T054 — RLS-Tenant-Isolation für `lexoffice_category_map` gegen echte DB unter
 * der Prod-Rolle `gastro_app` (NOSUPERUSER NOBYPASSRLS).
 *
 * Beweist die in `120_lexoffice_category_map.sql` definierte Policy:
 *   - Ein Tenant sieht seine eigenen Zeilen UND globale `'default'`-Zeilen,
 *     aber NICHT die eines anderen Tenants (kein Cross-Tenant-Leak).
 *   - Ein Tenant kann globale `'default'`-Zeilen NICHT ändern/löschen.
 *   - Ein Tenant kann KEINE Zeile mit fremder customer_id schreiben (WITH CHECK).
 *
 * Lauf-Strategie wie der T041-RLS-Test: gegen `DATABASE_URL` (in CI gesetzt +
 * migriert, Postgres-Service). In CI ist die DB Pflicht — fehlt sie, schlägt der
 * Test FEHL statt still zu skippen. Lokal ohne DB: sauber übersprungen.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';

const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

// Feste Test-Werte (T054-Präfix). customer_id ist TEXT (Tenant-UUID oder 'default').
const TENANT_A = '0a0a0a0a-0054-4054-8054-0000000000a1';
const TENANT_B = '0b0b0b0b-0054-4054-8054-0000000000b2';
const ALL_CUSTOMERS = [TENANT_A, TENANT_B, 'default'];
const SKR = '4650'; // bewirtung
const UUID_A = '00000000-0000-4000-8000-0000000000a1';
const UUID_B = '00000000-0000-4000-8000-0000000000b2';
const UUID_DEFAULT = '00000000-0000-4000-8000-00000000def0';

let pool: pg.Pool;
let dbAvailable = false;

async function assertRunningAsGastroApp(client: pg.PoolClient): Promise<void> {
  const who = await client.query<{ current_user: string }>('SELECT current_user');
  if (who.rows[0]?.current_user !== 'gastro_app') {
    throw new Error(
      `[T054] SET ROLE gastro_app griff nicht (current_user=${who.rows[0]?.current_user}) — der RLS-Test wäre wirkungslos.`,
    );
  }
}

/** Führt `fn` unter gastro_app + gesetztem Tenant-GUC in einer Roll-back-Transaktion aus. */
async function asTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gastro_app');
    await assertRunningAsGastroApp(client);
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantId]);
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
        `[T054] DB unter DATABASE_URL nicht erreichbar — in CI ist sie Pflicht. ${String(err)}`,
      );
    }
    return;
  }

  await pool.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_app') THEN
         CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
     END $$;`,
  );
  await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON lexoffice_category_map TO gastro_app');

  // Seed als verbundener Superuser pp (RLS-Bypass): je eine Zeile A, B, default.
  await pool.query('DELETE FROM lexoffice_category_map WHERE customer_id = ANY($1)', [
    ALL_CUSTOMERS,
  ]);
  for (const [cid, uuid] of [
    [TENANT_A, UUID_A],
    [TENANT_B, UUID_B],
    ['default', UUID_DEFAULT],
  ] as const) {
    await pool.query(
      `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, source)
       VALUES ($1, $2, $3, 'manual')`,
      [cid, SKR, uuid],
    );
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await pool
      .query('DELETE FROM lexoffice_category_map WHERE customer_id = ANY($1)', [ALL_CUSTOMERS])
      .catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T054 — lexoffice_category_map RLS unter gastro_app (NOBYPASSRLS)', () => {
  it('Tenant A sieht NUR eigene + default-Zeile, NICHT die von Tenant B', async () => {
    if (!dbAvailable) return;
    const visible = await asTenant(TENANT_A, async (c) => {
      const res = await c.query<{ customer_id: string }>(
        'SELECT customer_id FROM lexoffice_category_map WHERE skr_account = $1 ORDER BY customer_id',
        [SKR],
      );
      return res.rows.map((r) => r.customer_id);
    });
    expect(visible.sort()).toEqual([TENANT_A, 'default'].sort());
    expect(visible).not.toContain(TENANT_B);
  });

  it('Tenant A kann die default-Zeile NICHT löschen (0 rows)', async () => {
    if (!dbAvailable) return;
    const rowCount = await asTenant(TENANT_A, async (c) => {
      const res = await c.query("DELETE FROM lexoffice_category_map WHERE customer_id = 'default'");
      return res.rowCount;
    });
    expect(rowCount).toBe(0);
  });

  it('Tenant A kann die default-Zeile NICHT ändern (0 rows)', async () => {
    if (!dbAvailable) return;
    const rowCount = await asTenant(TENANT_A, async (c) => {
      const res = await c.query(
        "UPDATE lexoffice_category_map SET category_name = 'hacked' WHERE customer_id = 'default'",
      );
      return res.rowCount;
    });
    expect(rowCount).toBe(0);
  });

  it('Tenant A kann Tenant B NICHT löschen (0 rows)', async () => {
    if (!dbAvailable) return;
    const rowCount = await asTenant(TENANT_A, async (c) => {
      const res = await c.query('DELETE FROM lexoffice_category_map WHERE customer_id = $1', [
        TENANT_B,
      ]);
      return res.rowCount;
    });
    expect(rowCount).toBe(0);
  });

  it('Tenant A kann KEINE Zeile mit fremder customer_id schreiben (WITH CHECK)', async () => {
    if (!dbAvailable) return;
    await expect(
      asTenant(TENANT_A, async (c) => {
        await c.query(
          `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, source)
           VALUES ($1, '9999', $2, 'manual')`,
          [TENANT_B, UUID_B],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('Tenant A kann eine EIGENE Zeile schreiben', async () => {
    if (!dbAvailable) return;
    const rowCount = await asTenant(TENANT_A, async (c) => {
      const res = await c.query(
        `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, source)
         VALUES ($1, '5100', $2, 'api_lookup')`,
        [TENANT_A, UUID_A],
      );
      return res.rowCount;
    });
    expect(rowCount).toBe(1);
  });
});
