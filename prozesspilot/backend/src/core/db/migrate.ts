/**
 * D2 — Migration Runner
 *
 * Liest alle *.sql-Dateien aus /migrations (alphabetisch sortiert),
 * verfolgt den Fortschritt in der Tabelle `schema_migrations` und
 * wendet ausstehende Migrationen transaktional an.
 *
 * Aufruf:  npm run migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

// Pfad relativ zu dist/core/db/migrate.js → ../../../../migrations
// Bei tsx (kein Build): __dirname ist src/core/db → ../../../migrations
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations');

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();

  try {
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
      files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith('.sql'))
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
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file],
        );
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
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error(err, 'Kritischer Migrations-Fehler');
  process.exit(1);
});
