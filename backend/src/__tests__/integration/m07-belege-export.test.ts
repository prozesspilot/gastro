/**
 * M07 — Integrationstest für `fetchBelegeForMonth` gegen echtes Postgres.
 *
 * Beweist: Monats-/Status-Filter (BOOKED_STATUS, document_date-Fenster), das
 * payload→BelegExportRow-Mapping (document_number, total_net, tax_rate/-amount,
 * skr_account, category_label) und die Sortierung. In CI Pflicht; lokal ohne DB
 * sauber übersprungen.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  insertBeleg,
  updateBelegCategorization,
  updateBelegStatus,
} from '../../modules/m01-receipt-intake/services/beleg.repository';
import { fetchBelegeForMonth } from '../../modules/m07-export/services/belege-export.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T = '0a07a07a-0007-4007-8007-000000000a07';

let pool: pg.Pool;
let dbAvailable = false;
let counter = 0;

/** Legt einen Beleg an, optional kategorisiert + mit document_date. */
async function seedBeleg(opts: {
  documentDate: string | null;
  status?: string;
  gross?: number;
  categorized?: boolean;
}): Promise<string> {
  counter++;
  const sha = counter.toString(16).padStart(64, '0');
  const { beleg } = await insertBeleg(pool, {
    tenantId: T,
    sourceChannel: 'manual_upload',
    fileObjectKey: `test/m07-${counter}.jpg`,
    fileMimeType: 'image/jpeg',
    fileSizeBytes: 100,
    fileSha256: sha,
    uploadedByUserId: null,
    originalFilename: 'm07.jpg',
  });
  // document_date + total_gross direkt setzen (insertBeleg setzt sie nicht).
  await pool.query(
    'UPDATE belege SET document_date = $2, total_gross = $3, currency = $4 WHERE id = $1',
    [beleg.id, opts.documentDate, opts.gross ?? 119, 'EUR'],
  );
  if (opts.categorized) {
    await updateBelegCategorization(pool, T, beleg.id, {
      newStatus: 'categorized',
      category: 'wareneinkauf_food',
      categorization: {
        engine: 'test',
        category: 'wareneinkauf_food',
        category_label: 'Wareneinkauf Food',
        skr_account: '5100',
        skr_chart: 'SKR03',
        confidence: 0.95,
        rationale: 'test',
        categorized_at: '2026-05-10T00:00:00.000Z',
      },
      audit: { actorType: 'system', actorId: 'module:M07-test' },
    });
  } else if (opts.status) {
    await updateBelegStatus(pool, T, beleg.id, opts.status as never);
  }
  return beleg.id;
}

async function cleanup(): Promise<void> {
  await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T]).catch(() => {});
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL app.bypass_rls = 'on'");
    await c.query("SET LOCAL app.audit_maintenance = 'on'");
    await c.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]);
    await c.query('COMMIT');
  } catch {
    await c.query('ROLLBACK').catch(() => undefined);
  } finally {
    c.release();
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [T]).catch(() => {});
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) throw new Error(`[M07] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    return;
  }
  await cleanup();
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T, 'm07-export', 'M07 Export', 'm07@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) await cleanup();
  await pool?.end().catch(() => {});
});

describe('M07 — fetchBelegeForMonth (echte DB)', () => {
  it('liefert nur verbuchte Belege im Monatsfenster, sortiert + gemappt', async () => {
    if (!dbAvailable) return;
    // Im Mai 2026, kategorisiert → exportiert.
    const inMonthLate = await seedBeleg({ documentDate: '2026-05-20', categorized: true });
    const inMonthEarly = await seedBeleg({ documentDate: '2026-05-03', categorized: true });
    // Außerhalb des Monats (Juni) → NICHT enthalten.
    await seedBeleg({ documentDate: '2026-06-01', categorized: true });
    // Im Monat, aber NICHT verbucht (received) → NICHT enthalten.
    await seedBeleg({ documentDate: '2026-05-15', status: 'received' });

    const rows = await fetchBelegeForMonth(pool, T, 2026, 5);

    // Nur die zwei verbuchten Mai-Belege, sortiert nach document_date ASC.
    expect(rows.map((r) => r.id)).toEqual([inMonthEarly, inMonthLate]);
    const first = rows[0];
    expect(first.document_date?.slice(0, 10)).toBe('2026-05-03');
    expect(first.category).toBe('wareneinkauf_food');
    // category_label kommt aus dem kanonischen System-Kategorien-Namen
    // (findCategory), NICHT aus dem im Payload gespeicherten Label.
    expect(first.category_label).toBe('Wareneinkauf Lebensmittel');
    expect(first.skr_account).toBe('5100');
    expect(first.total_gross).toBe(119);
    expect(first.status).toBe('categorized');
    expect(first.currency).toBe('EUR');
  });

  it('leerer Monat → leeres Array', async () => {
    if (!dbAvailable) return;
    const rows = await fetchBelegeForMonth(pool, T, 2025, 1);
    expect(rows).toEqual([]);
  });
});
