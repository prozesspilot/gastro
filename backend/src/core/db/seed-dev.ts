/**
 * D-Seed — Lokale Dev-Umgebung mit Test-Tenant + Test-User initialisieren.
 *
 * Idempotent: erneutes Ausführen aktualisiert bestehende Einträge statt zu
 * duplizieren. Wird über `npm run seed:dev` aufgerufen.
 *
 * NICHT für Production geeignet — schreibt feste Test-IDs und einen
 * Discord-Snowflake "000000000000000001".
 */

import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';

async function seed(): Promise<void> {
  if (config.NODE_ENV === 'production') {
    logger.error('Refusing to seed in production environment.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();

  try {
    // WICHTIG: SET LOCAL gilt nur innerhalb einer aktiven Transaktion.
    // Reihenfolge: erst BEGIN, dann SET LOCAL — sonst verwirft Postgres das
    // Setting sofort und die Inserts laufen ohne Bypass in RLS-Errors.
    await client.query('BEGIN');
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    // ---------------------------------------------------------------------
    // 1. Test-Tenant
    // ---------------------------------------------------------------------
    await client.query(
      `INSERT INTO tenants (id, slug, display_name, legal_name, contact_email, package, pos_system, contract_started_at)
       VALUES ($1, 'test-pizzeria', 'Test Pizzeria Bella Italia',
               'Bella Italia Gastro GmbH', 'test@example.local',
               'standard', 'sumup_lite', now())
       ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             updated_at = now()`,
      [TEST_TENANT_ID],
    );

    await client.query(
      `INSERT INTO tenant_settings (tenant_id, modules_enabled, integrations, routing)
       VALUES ($1,
               '["M01","M02","M03","M05","M15"]'::jsonb,
               '{"ocr":{"provider":"google_vision"},"booking":{"provider":"lexware_office"}}'::jsonb,
               '{"ki_kategorisierung":true,"min_amount_review":1000.00,"default_currency":"EUR"}'::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE
         SET modules_enabled = EXCLUDED.modules_enabled,
             updated_at = now()`,
      [TEST_TENANT_ID],
    );

    // ---------------------------------------------------------------------
    // 2. Test-User (Geschäftsführer)
    // ---------------------------------------------------------------------
    await client.query(
      `INSERT INTO users (id, discord_user_id, discord_username, display_name, role, active)
       VALUES ($1, '000000000000000001', 'test-gf', 'Test Geschäftsführer', 'geschaeftsfuehrer', true)
       ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             updated_at = now()`,
      [TEST_USER_ID],
    );

    await client.query('COMMIT');
    logger.info(
      { tenant_id: TEST_TENANT_ID, user_id: TEST_USER_ID },
      'Seed erfolgreich angewendet.',
    );
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(err, 'Seed fehlgeschlagen — Rollback durchgeführt');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  logger.error(err, 'Kritischer Seed-Fehler');
  process.exit(1);
});
