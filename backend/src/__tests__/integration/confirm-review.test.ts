/**
 * T078 — Integrationstest für confirmBelegReview gegen echtes Postgres.
 *
 * Verifiziert die Garantien, die der Mock-Test NICHT abdeckt (Code-Review #181
 * MAJOR): der status-gegatete UPDATE, das transaktionale `beleg.review_confirmed`-
 * Audit-Insert, der Erhalt bestehender `payload.audit.events`, Idempotenz und der
 * tenant-gescopte Zugriff — alles gegen die echte belege/audit_log-Tabelle.
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmBelegReview } from '../../modules/m01-receipt-intake/services/beleg.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_R = '0c0c0c0c-0078-4078-8078-0000000000c1';
const T_OTHER = '0c0c0c0c-0078-4078-8078-00000000b000';
const STAFF = '0c0c0c0c-0078-4078-8078-000000005a40';

let pool: pg.Pool;
let dbAvailable = false;
let seedN = 0;

async function seedBeleg(
  status: string,
  category: string | null,
  payload: Record<string, unknown>,
): Promise<string> {
  seedN += 1;
  const sha = seedN.toString(16).padStart(64, '0');
  const res = await pool.query<{ id: string }>(
    `INSERT INTO belege
       (tenant_id, source_channel, file_object_key, file_mime_type, file_size_bytes,
        file_sha256, status, category, payload)
     VALUES ($1, 'manual_upload', $2, 'image/jpeg', 1234, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [T_R, `s3://t/${sha}.jpg`, sha, status, category, JSON.stringify(payload)],
  );
  return res.rows[0].id;
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
        `[T078] DB unter DATABASE_URL nicht erreichbar — in CI Pflicht. ${String(err)}`,
      );
    }
    return;
  }

  // Frische DB nötig (audit_log append-only) — Memory backend-db-test-fresh-db.
  await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T_R]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T_R]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T_R, 't078-confirm', 'T078 Confirm-Review', 'wirt-t078@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T_R]).catch(() => {});
    await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T_R]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T_R]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

const AUDIT = { actorType: 'staff', actorId: STAFF } as const;

describe('T078 — confirmBelegReview (Integration)', () => {
  it('requires_review → categorized: Status wechselt, category/categorization bleiben, Event-Append + Audit', async () => {
    if (!dbAvailable) return;
    const id = await seedBeleg('requires_review', 'wareneinkauf_food', {
      categorization: { category: 'wareneinkauf_food', skr_account: '3100' },
      audit: {
        events: [
          {
            at: '2026-06-01T00:00:00Z',
            type: 'categorized',
            actor: { type: 'system', id: 'system' },
          },
        ],
      },
    });

    const updated = await confirmBelegReview(pool, T_R, id, AUDIT);
    expect(updated?.status).toBe('categorized');
    // category + payload.categorization unverändert.
    expect(updated?.category).toBe('wareneinkauf_food');
    const payload = updated?.payload as {
      categorization?: { skr_account?: string };
      audit?: { events?: Array<{ type?: string }> };
    };
    expect(payload.categorization?.skr_account).toBe('3100');
    // Bestehendes Event bleibt, review_confirmed wird ergänzt.
    const types = (payload.audit?.events ?? []).map((e) => e.type);
    expect(types).toEqual(['categorized', 'review_confirmed']);

    // GoBD-Audit-Row geschrieben.
    const audit = await pool.query(
      `SELECT payload_before, payload_after FROM audit_log
        WHERE tenant_id = $1 AND entity_id = $2 AND event_type = 'beleg.review_confirmed'`,
      [T_R, id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].payload_before).toMatchObject({ status: 'requires_review' });
    expect(audit.rows[0].payload_after).toMatchObject({
      status: 'categorized',
      category: 'wareneinkauf_food',
    });
  });

  it('Idempotenz: zweiter Aufruf (nun categorized) → null, kein zweites Audit-Event', async () => {
    if (!dbAvailable) return;
    const id = await seedBeleg('requires_review', 'wareneinkauf_food', {
      categorization: { category: 'wareneinkauf_food' },
    });
    const first = await confirmBelegReview(pool, T_R, id, AUDIT);
    expect(first?.status).toBe('categorized');
    const second = await confirmBelegReview(pool, T_R, id, AUDIT);
    expect(second).toBeNull();
    const audit = await pool.query(
      `SELECT 1 FROM audit_log WHERE tenant_id = $1 AND entity_id = $2 AND event_type = 'beleg.review_confirmed'`,
      [T_R, id],
    );
    expect(audit.rowCount).toBe(1); // genau EIN Event trotz zweier Aufrufe
  });

  it('Nicht-requires_review (extracted) → null, kein Statuswechsel', async () => {
    if (!dbAvailable) return;
    const id = await seedBeleg('extracted', 'wareneinkauf_food', {});
    const res = await confirmBelegReview(pool, T_R, id, AUDIT);
    expect(res).toBeNull();
    const row = await pool.query<{ status: string }>('SELECT status FROM belege WHERE id = $1', [
      id,
    ]);
    expect(row.rows[0].status).toBe('extracted');
  });

  it('Fremder Tenant-Kontext → null (Tenant-Scope im WHERE)', async () => {
    if (!dbAvailable) return;
    const id = await seedBeleg('requires_review', 'wareneinkauf_food', {
      categorization: { category: 'wareneinkauf_food' },
    });
    const res = await confirmBelegReview(pool, T_OTHER, id, AUDIT);
    expect(res).toBeNull();
    // Unter T_R unverändert requires_review.
    const row = await pool.query<{ status: string }>('SELECT status FROM belege WHERE id = $1', [
      id,
    ]);
    expect(row.rows[0].status).toBe('requires_review');
  });
});
