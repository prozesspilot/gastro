/**
 * T023 — Integration-Test-Setup fuer Gastro-Schema.
 *
 * Verbindet mit der Test-DB, fuehrt alle Migrations aus (idempotent),
 * und gibt einen Pool zurueck. Tests, die DB-Isolation brauchen, rufen
 * cleanGastroTestDb() in beforeEach auf.
 *
 * DB-URL: TEST_DATABASE_URL (default: gastro_app@localhost:5432/gastro_test)
 * Falls die DB nicht erreichbar ist, wirft setupGastroTestDb() — Aufrufer
 * fangen den Fehler und setzen dbAvailable=false.
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgresql://gastro_app:gastro_app@localhost:5432/gastro_test';

export async function setupGastroTestDb(): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: TEST_DB });

  // Verbindungstest — wirft bei nicht-erreichbarer DB
  await pool.query('SELECT 1');

  const migrationsDir = path.resolve(__dirname, '../../../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_rollback.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Ignoriere Errors aus bereits-angewendeten Migrations (idempotent)
    await pool.query(sql).catch(() => {});
  }

  return pool;
}

/**
 * Bereinigt alle Test-Daten zwischen Test-Cases.
 * CASCADE loest FK-Abhaengigkeiten auf (belege, export_log, pos_credentials etc.).
 */
export async function cleanGastroTestDb(pool: pg.Pool): Promise<void> {
  // DECISION: Reihenfolge so dass CASCADE FKs greift. tenants zuletzt (alles haengt daran).
  await pool
    .query(
      `TRUNCATE
         export_log,
         belege,
         pos_credentials,
         kasse_transactions,
         audit_log,
         tenant_settings,
         tenants
       CASCADE`,
    )
    .catch(() => {});
}

/**
 * Legt einen Test-Tenant an und gibt dessen ID zurueck.
 * Verwendet gastro_owner-Verbindung (via TEST_DATABASE_URL) die SECURITY DEFINER
 * und bypass_rls nutzt, um auch in Tests mit aktivem RLS Fixtures anlegen zu koennen.
 */
export async function seedTenant(
  pool: pg.Pool,
  opts?: { slug?: string; displayName?: string; modules?: string[] },
): Promise<string> {
  const slug = opts?.slug ?? `test-wirt-${Date.now()}`;
  const displayName = opts?.displayName ?? 'Test Gastro';
  const modules = opts?.modules ?? ['M01', 'M03'];

  // INSERT tenant
  const tenantResult = await pool.query<{ id: string }>(
    `INSERT INTO tenants (slug, display_name)
     VALUES ($1, $2)
     RETURNING id`,
    [slug, displayName],
  );
  const tenantId = tenantResult.rows[0].id;

  // INSERT tenant_settings
  await pool.query(
    `INSERT INTO tenant_settings (tenant_id, modules_enabled)
     VALUES ($1, $2::jsonb)`,
    [tenantId, JSON.stringify(modules)],
  );

  return tenantId;
}

// Test-Encryption-Key fuer pgcrypto — NIEMALS in Production verwenden.
// Tokens in Integration-Tests sind nicht echt.
const TEST_PGCRYPTO_KEY = 'gastro-test-key-not-for-production';

/**
 * Legt eine pos_credentials-Row an.
 * Tokens werden mit Test-Key via pgp_sym_encrypt verschluesselt (Pflichtfeld).
 */
export async function seedPosCredential(
  pool: pg.Pool,
  tenantId: string,
  opts: {
    posSystem?: string;
    posAccountId?: string;
    active?: boolean;
    inactiveReason?: string | null;
    updatedAt?: Date;
  } = {},
): Promise<{ id: string }> {
  const posSystem = opts.posSystem ?? 'sumup_lite';
  const posAccountId = opts.posAccountId ?? `merch-${Date.now()}`;
  const active = opts.active ?? true;
  const inactiveReason = opts.inactiveReason ?? null;

  let result: pg.QueryResult<{ id: string }>;

  if (opts.updatedAt) {
    // Setze updated_at explizit fuer Boundary-Tests (Trigger wird umgangen via direkte Spalte)
    result = await pool.query<{ id: string }>(
      `INSERT INTO pos_credentials
         (tenant_id, pos_system, pos_account_id, active, inactive_reason,
          access_token_encrypted, refresh_token_encrypted, token_expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5,
               pgp_sym_encrypt('test-access-token', $6),
               pgp_sym_encrypt('test-refresh-token', $6),
               now() + interval '1 hour',
               $7)
       RETURNING id`,
      [
        tenantId,
        posSystem,
        posAccountId,
        active,
        inactiveReason,
        TEST_PGCRYPTO_KEY,
        opts.updatedAt.toISOString(),
      ],
    );
  } else {
    result = await pool.query<{ id: string }>(
      `INSERT INTO pos_credentials
         (tenant_id, pos_system, pos_account_id, active, inactive_reason,
          access_token_encrypted, refresh_token_encrypted, token_expires_at)
       VALUES ($1, $2, $3, $4, $5,
               pgp_sym_encrypt('test-access-token', $6),
               pgp_sym_encrypt('test-refresh-token', $6),
               now() + interval '1 hour')
       RETURNING id`,
      [tenantId, posSystem, posAccountId, active, inactiveReason, TEST_PGCRYPTO_KEY],
    );
  }

  return { id: result.rows[0].id };
}

/**
 * Legt eine belege-Row an (minimal fuer M05-Export-Tests).
 */
export async function seedBeleg(
  pool: pg.Pool,
  tenantId: string,
  opts?: {
    status?: string;
    category?: string;
    supplierName?: string;
  },
): Promise<{ id: string }> {
  const sha = `${Date.now()}${Math.random()}`.replace('.', '');
  const result = await pool.query<{ id: string }>(
    `INSERT INTO belege
       (tenant_id, source_channel, file_object_key, file_mime_type,
        file_size_bytes, file_sha256, status, category, supplier_name, payload)
     VALUES ($1, 'manual_upload', $2, 'image/jpeg', 1024, $3, $4, $5, $6, '{}'::jsonb)
     RETURNING id`,
    [
      tenantId,
      `test/${tenantId}/${sha}.jpg`,
      sha.substring(0, 64),
      opts?.status ?? 'extracted',
      opts?.category ?? null,
      opts?.supplierName ?? null,
    ],
  );
  return { id: result.rows[0].id };
}
