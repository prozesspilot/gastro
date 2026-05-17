import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://pp:pp@localhost:5432/pp_test';

export async function setupTestDb(): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: TEST_DB });
  const migrationsDir = path.resolve(__dirname, '../../../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Ignore errors from already-applied migrations (idempotent approach)
    await pool.query(sql).catch(() => {});
  }
  return pool;
}

export async function cleanTestDb(pool: pg.Pool): Promise<void> {
  // DECISION: Truncate most tables. CASCADE handles FK-constraints.
  // Falls eine Tabelle nicht existiert, ignorieren.
  await pool
    .query(
      `TRUNCATE receipts, tenants, customers, customer_profiles, communications,
       plugin_registry CASCADE`,
    )
    .catch(() => {});
}
