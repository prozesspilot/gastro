/**
 * T023 — Integrationstest für `purgeInactivePosCredentials` (M15) gegen echtes
 * Postgres. Die bestehende `pos-cleanup.test.ts` mockt den Pool und prüft nur die
 * SQL-/Tx-Reihenfolge — die echten Lösch-KRITERIEN (active-Gate, Retention-Grenze)
 * und die tenant-isolierten audit_log-Inserts liefen nie gegen die DB.
 *
 * Lösch-Bedingung (pos.repository): `active = false AND updated_at < now() - retention`.
 * Retention im Test = 30 Tage (= 720 h). Boundary wird race-frei mit Stunden-Margin
 * geprüft (718 h innen, 722 h außen) statt exakt `now()`.
 *
 * `updated_at` wird beim INSERT explizit gesetzt — der `set_updated_at`-Trigger ist
 * BEFORE UPDATE (nicht INSERT), überschreibt den Seed also nicht.
 *
 * In CI ist die DB Pflicht (REQUIRE_DB); lokal ohne DB wird sauber übersprungen.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeInactivePosCredentials } from '../../modules/m15-pos-connector/pos.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T = '0a23a23a-0023-4023-8023-0000000015a1'; // Haupt-Tenant
const T2 = '0a23a23a-0023-4023-8023-0000000015b2'; // 2. Tenant (Isolations-Nachweis)
const RETENTION_DAYS = 30; // Grenze = 720 h

let pool: pg.Pool;
let dbAvailable = false;

/**
 * Legt eine pos_credentials-Zeile mit explizitem Alter (Stunden) an.
 * `posSystem` muss je Tenant eindeutig sein — UNIQUE(tenant_id, pos_system),
 * und der CHECK lässt nur 'sumup_lite' | 'sumup_pos_pro' zu (max. 2 pro Tenant).
 */
async function seedCred(
  tenant: string,
  posSystem: 'sumup_lite' | 'sumup_pos_pro',
  active: boolean,
  ageHours: number,
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO pos_credentials
       (tenant_id, pos_system, pos_account_id, access_token_encrypted, refresh_token_encrypted,
        token_expires_at, scopes, active, inactive_reason, updated_at)
     VALUES ($1, $2, $3, ''::bytea, ''::bytea,
        now() + interval '1 day', '{}'::text[], $4, $5, now() - ($6 || ' hours')::interval)
     RETURNING id`,
    [
      tenant,
      posSystem,
      `acc-${posSystem}-${ageHours}`,
      active,
      active ? null : 'manual_disconnect',
      String(ageHours),
    ],
  );
  return res.rows[0].id;
}

async function purgeAuditLog(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    await client.query("SET LOCAL app.audit_maintenance = 'on'");
    await client.query('DELETE FROM audit_log WHERE tenant_id = ANY($1)', [[T, T2]]);
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    client.release();
  }
}

async function cleanup(): Promise<void> {
  // pos_credentials hängt per ON DELETE CASCADE an tenants — Reihenfolge unkritisch,
  // aber explizit für Klarheit.
  await pool
    .query('DELETE FROM pos_credentials WHERE tenant_id = ANY($1)', [[T, T2]])
    .catch(() => {});
  await purgeAuditLog();
  await pool.query('DELETE FROM tenants WHERE id = ANY($1)', [[T, T2]]).catch(() => {});
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) throw new Error(`[T023] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    return;
  }
  await cleanup();
  for (const [id, slug] of [
    [T, 't023-pos-a'],
    [T2, 't023-pos-b'],
  ] as const) {
    await pool.query(
      'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
      [id, slug, `T023 POS ${slug}`, `${slug}@example.com`],
    );
  }
});

afterAll(async () => {
  if (dbAvailable) await cleanup();
  await pool?.end().catch(() => {});
});

describe('T023 — purgeInactivePosCredentials Lösch-Kriterien (echte DB)', () => {
  it('löscht nur inaktive Credentials jenseits der Retention; isoliert audit pro Tenant', async () => {
    if (!dbAvailable) return;

    // Fixtures (Retention 720 h). UNIQUE(tenant_id, pos_system) → max. 2 Creds/Tenant,
    // daher über zwei Tenants verteilt. Jede der 4 Lösch-Bedingungen ist abgedeckt:
    const tLiteActive = await seedCred(T, 'sumup_lite', true, 960); // aktiv, 40 d        → bleibt
    const tProOld = await seedCred(T, 'sumup_pos_pro', false, 744); // inaktiv, 31 d       → gelöscht
    const t2LiteInside = await seedCred(T2, 'sumup_lite', false, 718); // inaktiv, 718 h   → bleibt (knapp innen)
    const t2ProOutside = await seedCred(T2, 'sumup_pos_pro', false, 722); // inaktiv, 722h → gelöscht (knapp außen)

    const purged = await purgeInactivePosCredentials(pool, RETENTION_DAYS);
    const purgedIds = purged.map((p) => p.id).sort();

    // Exakt „inaktiv + jenseits Retention" — die aktive und die knapp-innen bleiben.
    expect(purgedIds).toEqual([tProOld, t2ProOutside].sort());

    const remaining = await pool.query<{ id: string }>(
      'SELECT id FROM pos_credentials WHERE tenant_id = ANY($1) ORDER BY id',
      [[T, T2]],
    );
    expect(remaining.rows.map((r) => r.id).sort()).toEqual([tLiteActive, t2LiteInside].sort());

    // audit_log tenant-isoliert: jeder gelöschte Credential erzeugt ein purge-Event
    // unter SEINEM Tenant (Beweis für den per-Row set_config('app.current_tenant')).
    const auditT = await pool.query<{ entity_id: string }>(
      "SELECT entity_id FROM audit_log WHERE tenant_id = $1 AND event_type = 'pos_credentials.purged'",
      [T],
    );
    expect(auditT.rows.map((r) => r.entity_id)).toEqual([tProOld]);

    const auditT2 = await pool.query<{ entity_id: string }>(
      "SELECT entity_id FROM audit_log WHERE tenant_id = $1 AND event_type = 'pos_credentials.purged'",
      [T2],
    );
    expect(auditT2.rows.map((r) => r.entity_id)).toEqual([t2ProOutside]);
  });
});
