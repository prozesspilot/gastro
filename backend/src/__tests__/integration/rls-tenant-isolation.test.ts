/**
 * T041 — RLS Tenant-Isolation gegen echte DB unter der Prod-Rolle gastro_app.
 *
 * Beweist, dass die Tenant-Isolation via Row-Level-Security unter der
 * Production-Rolle `gastro_app` (NOSUPERUSER NOBYPASSRLS) tatsächlich greift
 * und der GUC-Key `app.current_tenant` korrekt verdrahtet ist.
 *
 * Hintergrund (T041): Die Repositories setzten früher den falschen GUC-Key
 * (`app.tenant_id` / `app.current_tenant_id`). Die RLS-Policy-Funktion
 * `current_tenant_id()` (migrations/002_helpers.sql) liest aber ausschließlich
 * `app.current_tenant`. Unter `gastro_app` (kein RLS-Bypass) ergab der falsche
 * Key `current_tenant_id() = NULL` → die Policy blockt alle Zeilen
 * (Prod-Totalausfall bzw., falls fälschlich als Owner gefahren, fehlende
 * Isolation). Lokal/CI lief die App als Superuser `pp` (RLS-Bypass), wodurch
 * der Bug bislang unsichtbar blieb und alle Mock-Tests grün waren.
 *
 * Dieser Test stellt per `SET LOCAL ROLE gastro_app` die echte Prod-RLS-
 * Semantik her — auch wenn die Verbindung als Superuser `pp` aufgebaut wird.
 *
 * Lauf-Strategie: gegen `DATABASE_URL` (in CI gesetzt + migriert). In CI ist
 * eine DB PFLICHT — ist keine erreichbar, schlägt der Test FEHL statt still zu
 * skippen (das war der Kern-Mangel der bisherigen Integrationstests, die an
 * das in CI ungesetzte `TEST_DATABASE_URL` gebunden waren). Lokal ohne DB wird
 * sauber übersprungen.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listBelege } from '../../modules/m01-receipt-intake/services/beleg.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';

// In CI (GitHub Actions setzt CI=true) ist eine DB Pflicht — kein stilles Skip.
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

// Feste, eindeutige Test-UUIDs (T041-Präfix) für gezieltes Seeding + Cleanup.
const TENANT_A = '0a0a0a0a-0041-4041-8041-0000000000a1';
const TENANT_B = '0b0b0b0b-0041-4041-8041-0000000000b2';
const TENANT_IDS = [TENANT_A, TENANT_B];

let pool: pg.Pool;
let dbAvailable = false;

/**
 * Führt ein SELECT auf `belege` unter der Rolle `gastro_app` (NOBYPASSRLS) aus,
 * mit dem übergebenen GUC-Key als Tenant-Kontext. Gibt die sichtbaren tenant_ids
 * zurück. Per BEGIN/SET LOCAL ROLE/ROLLBACK vollständig isoliert.
 */
async function visibleTenantsAs(gucKey: string, tenantId: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gastro_app');
    await client.query('SELECT set_config($1, $2, true)', [gucKey, tenantId]);
    const res = await client.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM belege WHERE tenant_id = ANY($1::uuid[]) ORDER BY tenant_id',
      [TENANT_IDS],
    );
    await client.query('ROLLBACK');
    return res.rows.map((r) => r.tenant_id);
  } finally {
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
        `[T041] DB unter DATABASE_URL nicht erreichbar — in CI ist sie Pflicht. ${String(err)}`,
      );
    }
    return; // lokal ohne DB: sauber überspringen
  }

  // gastro_app-Rolle idempotent sicherstellen (in CI bereits via Bootstrap-Step
  // angelegt; lokal evtl. nicht). NOBYPASSRLS ist entscheidend.
  await pool.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_app') THEN
         CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
     END $$;`,
  );
  await pool.query('GRANT SELECT, INSERT ON belege TO gastro_app');

  // Frischer Start + Seed (als verbundener Superuser pp → RLS-Bypass beim Seeding).
  await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [TENANT_IDS]);
  for (const [id, slug] of [
    [TENANT_A, 't041-a'],
    [TENANT_B, 't041-b'],
  ] as const) {
    await pool.query('INSERT INTO tenants (id, slug, display_name) VALUES ($1, $2, $3)', [
      id,
      slug,
      `T041 ${slug}`,
    ]);
    await pool.query(
      `INSERT INTO belege
         (tenant_id, source_channel, file_object_key, file_mime_type, file_size_bytes, file_sha256)
       VALUES ($1, 'manual_upload', $2, 'image/jpeg', 1234, $3)`,
      [id, `s3://test/${slug}.jpg`, slug.replace(/-/g, '').padEnd(64, '0').slice(0, 64)],
    );
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await pool
      .query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [TENANT_IDS])
      .catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T041 — RLS Tenant-Isolation unter gastro_app (NOBYPASSRLS)', () => {
  it('korrekter GUC app.current_tenant → gastro_app sieht NUR den eigenen Tenant', async () => {
    if (!dbAvailable) return; // in CI garantiert true (sonst hätte beforeAll geworfen)

    expect(await visibleTenantsAs('app.current_tenant', TENANT_A)).toEqual([TENANT_A]);
    expect(await visibleTenantsAs('app.current_tenant', TENANT_B)).toEqual([TENANT_B]);
  });

  it('REGRESSION: falscher GUC app.tenant_id → current_tenant_id()=NULL → 0 Zeilen', async () => {
    if (!dbAvailable) return;

    // Das ist der alte Bug: mit dem falschen Key sieht gastro_app NICHTS.
    // Schlägt dieser Test fehl (Zeilen sichtbar), läuft die App unbeabsichtigt
    // mit RLS-Bypass — ebenfalls ein Isolations-Defekt.
    expect(await visibleTenantsAs('app.tenant_id', TENANT_A)).toEqual([]);
    expect(await visibleTenantsAs('app.current_tenant_id', TENANT_A)).toEqual([]);
  });

  it('E2E: listBelege() (echter Repository-Code) unter gastro_app sieht nur den eigenen Tenant', async () => {
    if (!dbAvailable) return;

    // Dedizierter Pool, dessen Connections als gastro_app (NOBYPASSRLS) agieren.
    // Damit läuft der echte Repository-Code (inkl. setTenantContext) unter
    // Prod-RLS-Semantik. Drehte jemand den GUC-Key im Repository zurück auf
    // app.tenant_id, sähe listBelege 0 Zeilen → dieser Test schlägt fehl.
    const gaPool = new pg.Pool({ connectionString: DB_URL, max: 2 });
    gaPool.on('connect', (client) => {
      void client.query('SET ROLE gastro_app');
    });
    try {
      const resA = await listBelege(gaPool, TENANT_A, { limit: 10, offset: 0 });
      expect(resA.total).toBe(1);
      expect(resA.belege.every((b) => b.tenant_id === TENANT_A)).toBe(true);

      const resB = await listBelege(gaPool, TENANT_B, { limit: 10, offset: 0 });
      expect(resB.total).toBe(1);
      expect(resB.belege.every((b) => b.tenant_id === TENANT_B)).toBe(true);
    } finally {
      await gaPool.end().catch(() => {});
    }
  });

  it('WITH CHECK: INSERT mit fremder tenant_id wird durch RLS geblockt', async () => {
    if (!dbAvailable) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE gastro_app');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant', TENANT_A]);
      // Kontext = Tenant A, aber INSERT für Tenant B → WITH CHECK-Verletzung.
      await expect(
        client.query(
          `INSERT INTO belege
             (tenant_id, source_channel, file_object_key, file_mime_type, file_size_bytes, file_sha256)
           VALUES ($1, 'manual_upload', 's3://test/evil.jpg', 'image/jpeg', 1, $2)`,
          [TENANT_B, 'e'.repeat(64)],
        ),
      ).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
