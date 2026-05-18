/**
 * Schema-Smoke-Test für T011-Migrations.
 *
 * Verifiziert, dass nach einem frischen `npm run migrate`:
 *   - Alle erwarteten Tabellen existieren
 *   - Row-Level-Security ist auf den Tenant-Tabellen aktiviert UND erzwungen
 *   - audit_log ist append-only (UPDATE/DELETE wird vom Trigger geblockt)
 *
 * Erfordert eine erreichbare Postgres-DB. Tests werden ohne TEST_DATABASE_URL
 * ehrlich übersprungen, damit CI-Runs ohne DB nicht rot werden.
 *
 * Setup pro Test:
 *   - Öffnet eine eigene DB-Connection auf TEST_DATABASE_URL
 *   - Verwendet `app.bypass_rls = 'on'` für Setup-Inserts
 */

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const hasDb = !!TEST_DB_URL;

const EXPECTED_TABLES = [
  'audit_log',
  'auth_audit_log',
  'auth_sessions',
  'belege',
  'export_log',
  'kasse_integrations',
  'kasse_transactions',
  'schema_migrations',
  'tenant_settings',
  'tenants',
  'users',
];

const RLS_FORCED_TABLES = [
  'tenants',
  'tenant_settings',
  'belege',
  'kasse_integrations',
  'kasse_transactions',
  'export_log',
  'audit_log',
  'auth_audit_log',
];

describe.skipIf(!hasDb)('T011 schema smoke test', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('hat alle erwarteten Tabellen', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    const names = rows.map((r) => r.table_name);
    for (const t of EXPECTED_TABLES) {
      expect(names).toContain(t);
    }
  });

  it('aktiviert und erzwingt RLS auf allen Tenant-Tabellen', async () => {
    const { rows } = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE relkind = 'r'
         AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
       ORDER BY relname`,
    );
    const byName = new Map(rows.map((r) => [r.relname, r]));
    for (const t of RLS_FORCED_TABLES) {
      const row = byName.get(t);
      expect(row, `Tabelle ${t} fehlt`).toBeDefined();
      expect(row?.relrowsecurity, `${t}: RLS nicht aktiviert`).toBe(true);
      expect(row?.relforcerowsecurity, `${t}: RLS nicht erzwungen (FORCE)`).toBe(true);
    }
  });

  it('belege hat UNIQUE-Constraint auf (tenant_id, file_sha256) für Idempotenz', async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname='public' AND tablename='belege'`,
    );
    const hasDedup = rows.some(
      (r) =>
        r.indexdef.includes('tenant_id') &&
        r.indexdef.includes('file_sha256') &&
        r.indexdef.toUpperCase().includes('UNIQUE'),
    );
    expect(hasDedup).toBe(true);
  });

  it('audit_log lehnt UPDATE/DELETE ab (append-only)', async () => {
    const client = await pool.connect();
    try {
      // Setup: Tenant + audit-Eintrag mit Bypass — alles in einer Transaktion.
      await client.query('BEGIN');
      await client.query("SET LOCAL app.bypass_rls = 'on'");
      const tenantRes = await client.query<{ id: string }>(
        `INSERT INTO tenants (slug, display_name, package)
         VALUES ('rls-test-' || floor(random()*1000000)::text, 'RLS Test', 'standard')
         RETURNING id`,
      );
      const tenantId = tenantRes.rows[0].id;
      await client.query(
        `INSERT INTO audit_log (tenant_id, entity_type, entity_id, event_type, actor)
         VALUES ($1, 'beleg', 'x', 'test.event', '{"type":"system","id":"test"}'::jsonb)`,
        [tenantId],
      );
      await client.query('COMMIT');

      // Test: ohne audit_maintenance-Flag blockt der Trigger.
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      await expect(
        client.query("UPDATE audit_log SET event_type = 'hacked' WHERE tenant_id = $1", [tenantId]),
      ).rejects.toThrow(/append-only/i);
      await client.query('ROLLBACK');

      // Cleanup mit audit_maintenance + bypass — explizit beides setzen.
      await client.query('BEGIN');
      await client.query("SET LOCAL app.bypass_rls = 'on'");
      await client.query("SET LOCAL app.audit_maintenance = 'on'");
      await client.query('DELETE FROM audit_log WHERE tenant_id = $1', [tenantId]);
      await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('Tenant-Isolation: gastro_app sieht nur eigene Belege', async () => {
    // Stellt sicher, dass eine Non-Superuser-Rolle `gastro_app` existiert und
    // die benötigten GRANTs auf dieser DB hat. Idempotent — kann mehrfach laufen.
    const setupClient = await pool.connect();
    try {
      // Rolle existiert ggf. schon (Tests sind serielle Re-Runs) — DO-Block ist idempotent.
      // GRANTs sind ebenfalls idempotent.
      await setupClient.query(`DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gastro_app') THEN
            CREATE ROLE gastro_app WITH LOGIN PASSWORD 'app_pw' NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$;`);
      await setupClient.query('GRANT USAGE ON SCHEMA public TO gastro_app');
      await setupClient.query(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gastro_app',
      );
      await setupClient.query(
        'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gastro_app',
      );

      // 2 Tenants + je 1 Beleg — SET LOCAL muss INNERHALB der Transaktion stehen.
      await setupClient.query('BEGIN');
      await setupClient.query("SET LOCAL app.bypass_rls = 'on'");
      const t1 = (
        await setupClient.query<{ id: string }>(
          `INSERT INTO tenants (slug, display_name, package) VALUES
         ('iso-test-1-' || floor(random()*1000000)::text, 'Iso 1', 'standard') RETURNING id`,
        )
      ).rows[0].id;
      const t2 = (
        await setupClient.query<{ id: string }>(
          `INSERT INTO tenants (slug, display_name, package) VALUES
         ('iso-test-2-' || floor(random()*1000000)::text, 'Iso 2', 'standard') RETURNING id`,
        )
      ).rows[0].id;
      await setupClient.query(
        `INSERT INTO belege (tenant_id, source_channel, file_object_key, file_mime_type, file_size_bytes, file_sha256)
         VALUES
         ($1, 'manual_upload', 'iso/a', 'application/pdf', 100, repeat('a', 64)),
         ($2, 'manual_upload', 'iso/b', 'application/pdf', 100, repeat('b', 64))`,
        [t1, t2],
      );
      await setupClient.query('COMMIT');

      // Nun via gastro_app-Pool prüfen. Wir verwenden `set_config(..., true)`
      // statt `SET ...`, damit das Setting transaktionslokal bleibt — das ist
      // das Production-Pattern, alles andere leakt Tenant-Context im Pool.
      const appUrl = (TEST_DB_URL as string).replace(/\/\/[^:]+:[^@]+@/, '//gastro_app:app_pw@');
      const appPool = new Pool({ connectionString: appUrl });
      try {
        const appClient = await appPool.connect();
        try {
          await appClient.query('BEGIN');
          await appClient.query("SELECT set_config('app.current_tenant', $1, true)", [t1]);
          const { rows: r1 } = await appClient.query<{ file_object_key: string }>(
            'SELECT file_object_key FROM belege',
          );
          expect(r1.map((x) => x.file_object_key)).toEqual(['iso/a']);
          await appClient.query('COMMIT');

          await appClient.query('BEGIN');
          await appClient.query("SELECT set_config('app.current_tenant', $1, true)", [t2]);
          const { rows: r2 } = await appClient.query<{ file_object_key: string }>(
            'SELECT file_object_key FROM belege',
          );
          expect(r2.map((x) => x.file_object_key)).toEqual(['iso/b']);
          await appClient.query('COMMIT');

          // Außerhalb beider Transaktionen darf nichts sichtbar sein
          // (transaction-lokales Setting wurde mit COMMIT verworfen).
          const { rows: rNone } = await appClient.query<{ count: string }>(
            'SELECT count(*)::text FROM belege',
          );
          expect(rNone[0].count).toBe('0');
        } finally {
          appClient.release();
        }
      } finally {
        await appPool.end();
      }

      // Cleanup
      await setupClient.query('BEGIN');
      await setupClient.query("SET LOCAL app.bypass_rls = 'on'");
      await setupClient.query('DELETE FROM tenants WHERE id IN ($1, $2)', [t1, t2]);
      await setupClient.query('COMMIT');
    } finally {
      setupClient.release();
    }
  });

  it('B5: app-Rolle kann is_rls_bypassed() nicht aktivieren', async () => {
    // gastro_app darf zwar SET app.bypass_rls absetzen, aber is_rls_bypassed()
    // muss false zurückgeben, weil die Rolle nicht Superuser/Owner ist.
    const setupClient = await pool.connect();
    try {
      await setupClient.query(`DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gastro_app') THEN
            CREATE ROLE gastro_app WITH LOGIN PASSWORD 'app_pw' NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$;`);
      await setupClient.query('GRANT USAGE ON SCHEMA public TO gastro_app');
      await setupClient.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gastro_app');
    } finally {
      setupClient.release();
    }

    const appUrl = (TEST_DB_URL as string).replace(/\/\/[^:]+:[^@]+@/, '//gastro_app:app_pw@');
    const appPool = new Pool({ connectionString: appUrl });
    try {
      const appClient = await appPool.connect();
      try {
        await appClient.query('BEGIN');
        await appClient.query("SET LOCAL app.bypass_rls = 'on'");
        const { rows } = await appClient.query<{ bypassed: boolean }>(
          'SELECT is_rls_bypassed() AS bypassed',
        );
        expect(rows[0].bypassed).toBe(false);
        await appClient.query('ROLLBACK');
      } finally {
        appClient.release();
      }
    } finally {
      await appPool.end();
    }
  });

  it('B3: auth_audit_log lehnt UPDATE/DELETE ab (append-only)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL app.bypass_rls = 'on'");
      await client.query(
        `INSERT INTO auth_audit_log (event_type, metadata)
         VALUES ('login_failed', '{"reason":"test"}'::jsonb)
         RETURNING id`,
      );
      await client.query('COMMIT');

      await client.query('BEGIN');
      await expect(
        client.query(
          "UPDATE auth_audit_log SET event_type = 'hacked' WHERE event_type='login_failed'",
        ),
      ).rejects.toThrow(/append-only/i);
      await client.query('ROLLBACK');

      // Cleanup
      await client.query('BEGIN');
      await client.query("SET LOCAL app.bypass_rls = 'on'");
      await client.query("SET LOCAL app.audit_maintenance = 'on'");
      await client.query("DELETE FROM auth_audit_log WHERE event_type='login_failed'");
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('S3: tenant_settings.modules_enabled lehnt ungültige Module-IDs ab', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL app.bypass_rls = 'on'");
      const t = (
        await client.query<{ id: string }>(
          `INSERT INTO tenants (slug, display_name, package) VALUES
           ('mod-test-' || floor(random()*1000000)::text, 'Mod Test', 'standard')
           RETURNING id`,
        )
      ).rows[0].id;

      // Gültig
      await expect(
        client.query(
          `INSERT INTO tenant_settings (tenant_id, modules_enabled)
           VALUES ($1, '["M01","M03"]'::jsonb)`,
          [t],
        ),
      ).resolves.toBeDefined();

      // Ungültig
      await expect(
        client.query(
          `UPDATE tenant_settings SET modules_enabled = '["HACK","M99"]'::jsonb WHERE tenant_id = $1`,
          [t],
        ),
      ).rejects.toThrow(/modules_enabled_check|check constraint/i);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('S1: tenants ohne current_tenant_id() liefert 0 Rows (kein IS-NULL-Bypass)', async () => {
    // Sicherstellen, dass mindestens 1 Tenant existiert.
    const setupClient = await pool.connect();
    try {
      await setupClient.query('BEGIN');
      await setupClient.query("SET LOCAL app.bypass_rls = 'on'");
      await setupClient.query(
        `INSERT INTO tenants (slug, display_name, package) VALUES
         ('s1-test-' || floor(random()*1000000)::text, 'S1', 'standard')
         ON CONFLICT (slug) DO NOTHING`,
      );
      await setupClient.query('COMMIT');
    } finally {
      setupClient.release();
    }

    const appUrl = (TEST_DB_URL as string).replace(/\/\/[^:]+:[^@]+@/, '//gastro_app:app_pw@');
    const appPool = new Pool({ connectionString: appUrl });
    try {
      const appClient = await appPool.connect();
      try {
        // Kein current_tenant gesetzt → SELECT muss 0 Rows liefern.
        const { rows } = await appClient.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM tenants',
        );
        expect(rows[0].count).toBe('0');
      } finally {
        appClient.release();
      }
    } finally {
      await appPool.end();
    }
  });
});
