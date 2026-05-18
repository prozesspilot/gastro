/**
 * D2 — Migration Runner
 *
 * Liest alle *.sql-Dateien aus /migrations (alphabetisch sortiert),
 * verfolgt den Fortschritt in der Tabelle `schema_migrations` und
 * wendet ausstehende Migrationen transaktional an.
 *
 * Aufruf:  npm run migrate
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

// Pfad relativ zu backend/src/core/db/migrate.ts → backend/migrations
// (Spec T011: Migrations leben unter `backend/migrations/`.)
// Bei tsx läuft __dirname auf backend/src/core/db → drei Ebenen hoch nach backend/,
// dann /migrations. Bei tsc-Build (dist/core/db/migrate.js) gilt die gleiche
// Relation, weil dist/ direkt unter backend/ liegt.
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations');

// Beliebiger, projektweit eindeutiger 64-Bit-Integer für pg_advisory_lock.
// "GASTRO" als ASCII auf bigint gemapped: 0x47415354524F00 = 20094489948651264.
// Dieser Lock serialisiert konkurrierende Migrations-Runs (z. B. zwei
// gleichzeitig hochfahrende Backend-Pods beim Auto-Deploy).
const MIGRATION_ADVISORY_LOCK = BigInt('20094489948651264');

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Cluster-weites Lock auf dieser Connection — falls bereits ein anderer
    // Runner aktiv ist, blockiert pg_advisory_lock() bis dieser fertig ist.
    logger.info('Versuche, Migrations-Advisory-Lock zu erwerben …');
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK.toString()]);
    logger.info('Migrations-Lock erworben.');

    // Migrations-Tracking-Tabelle anlegen (idempotent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT        PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Bereits angewendete Versionen laden
    const { rows } = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    const applied = new Set(rows.map((r) => r.version));

    // Alle SQL-Dateien einlesen und sortieren
    let files: string[];
    try {
      // `.sql`-Dateien sortiert; Files mit `_`-Prefix sind reservierte Helper
      // (z. B. `_rollback.sql`, `_helpers.sql`) und keine Migrationen.
      files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
        .sort();
    } catch {
      logger.error({ dir: MIGRATIONS_DIR }, 'Migrations-Verzeichnis nicht gefunden');
      process.exit(1);
    }

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      logger.info('Keine ausstehenden Migrationen — Datenbank ist aktuell.');
      return;
    }

    logger.info({ count: pending.length, files: pending }, 'Ausstehende Migrationen gefunden');

    for (const file of pending) {
      const filePath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(filePath, 'utf-8');

      logger.info({ file }, 'Wende Migration an …');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ file }, '✓ Migration erfolgreich angewendet');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ file, err }, '✗ Migration fehlgeschlagen — Rollback durchgeführt');
        throw err;
      }
    }

    logger.info({ count: pending.length }, 'Alle Migrationen erfolgreich angewendet.');
  } finally {
    // Lock freigeben, falls erworben. pg_advisory_unlock liefert false, wenn
    // der Lock nicht gehalten wurde — kein Fehler.
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK.toString()]);
    } catch {
      // Connection bereits dead — ignorieren, der Lock wird mit Session-End freigegeben.
    }
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error(err, 'Kritischer Migrations-Fehler');
  process.exit(1);
});
