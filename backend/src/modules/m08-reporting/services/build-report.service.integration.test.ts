/**
 * T087/M08 — Integrationstest für buildMonthlyReport (DB + Fake-S3).
 *
 * Verifiziert den vollen Build: Aggregat → PDF → Upload → reports-Upsert + Audit,
 * inkl. Idempotenz (ein Row pro Tenant+Monat) gegen echtes Postgres. MinIO wird
 * durch einen aufzeichnenden Fake-S3-Client ersetzt (kein echter Object-Store nötig).
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 */
import type { S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMonthlyReport, reportObjectKey } from './build-report.service';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T = '0c0c0c0c-0087-4087-8087-00000000cccc';
const STAFF = '0c0c0c0c-0087-4087-8087-000000005a40';

let pool: pg.Pool;
let dbAvailable = false;

/** Fake-S3: zeichnet PutObject-Keys auf, ohne echten Store. */
const uploadedKeys: string[] = [];
const fakeS3 = {
  send: async (cmd: { input?: { Key?: string } }) => {
    if (cmd?.input?.Key) uploadedKeys.push(cmd.input.Key);
    return {};
  },
} as unknown as S3Client;

let seedN = 0;
async function seedBeleg(date: string, gross: number, category: string): Promise<void> {
  seedN += 1;
  const sha = (seedN + 0xa000).toString(16).padStart(64, '0');
  await pool.query(
    `INSERT INTO belege
       (tenant_id, source_channel, file_object_key, file_mime_type, file_size_bytes,
        file_sha256, status, category, supplier_name, document_date, total_gross)
     VALUES ($1, 'manual_upload', $2, 'image/jpeg', 1234, $3, 'categorized', $4, 'Lieferant', $5, $6)`,
    [T, `s3://t/${sha}.jpg`, sha, category, date, gross],
  );
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) throw new Error(`[T087] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    return;
  }
  await pool.query('DELETE FROM reports WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email, legal_name) VALUES ($1, $2, $3, $4, $5)',
    [T, 't087-build', 'T087 Build', 'wirt-build@example.com', 'Müller-Bistro GmbH'],
  );
  await seedBeleg('2026-05-10', 100.0, 'wareneinkauf_food');
  await seedBeleg('2026-05-20', 50.0, 'bewirtung');
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM reports WHERE tenant_id = $1', [T]).catch(() => {});
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]).catch(() => {});
    await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

const ACTOR = { type: 'staff', id: STAFF } as const;

describe('T087 — buildMonthlyReport (Integration)', () => {
  it('baut Report: lädt PDF hoch, schreibt reports-Row + Audit, gibt Metadaten', async () => {
    if (!dbAvailable) return;
    const res = await buildMonthlyReport({ db: pool, s3: fakeS3 }, T, 2026, 5, { actor: ACTOR });

    expect(res.pdfObjectKey).toBe(reportObjectKey(T, 2026, 5));
    expect(uploadedKeys).toContain(res.pdfObjectKey);
    expect(res.totals.totals.gross_sum).toBeCloseTo(150.0, 2);

    const row = await pool.query('SELECT * FROM reports WHERE id = $1', [res.reportId]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].period_month).toBe(5);

    const audit = await pool.query(
      "SELECT * FROM audit_log WHERE tenant_id = $1 AND event_type = 'report.monthly_built'",
      [T],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].entity_id).toBe(res.reportId);
  });

  it('ist idempotent: zweiter Build desselben Monats überschreibt, kein Duplikat', async () => {
    if (!dbAvailable) return;
    const first = await buildMonthlyReport({ db: pool, s3: fakeS3 }, T, 2026, 5, { actor: ACTOR });
    const second = await buildMonthlyReport({ db: pool, s3: fakeS3 }, T, 2026, 5, { actor: ACTOR });
    expect(second.reportId).toBe(first.reportId);

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM reports WHERE tenant_id = $1 AND period_year = 2026 AND period_month = 5',
      [T],
    );
    expect(count.rows[0].n).toBe(1);
  });
});
