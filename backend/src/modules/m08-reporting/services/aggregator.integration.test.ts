/**
 * T087/M08 — Integrationstest für computeMonthlyAggregates gegen echtes Postgres.
 *
 * Verifiziert die Monats-Aggregation über die belege-Tabelle: Status-Whitelist,
 * Monatsfenster, by_category/top_suppliers-Sortierung, Vormonatsvergleich,
 * Belege-ohne-Datum und die Tenant-Isolation (explizites tenant_id + RLS).
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeMonthlyAggregates } from './aggregator';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_A = '0c0c0c0c-0087-4087-8087-0000000000a1';
const T_B = '0c0c0c0c-0087-4087-8087-0000000000b2';

let pool: pg.Pool;
let dbAvailable = false;
let seedN = 0;

interface SeedOpts {
  tenant?: string;
  status?: string;
  category?: string | null;
  supplier?: string | null;
  date?: string | null;
  gross?: number | null;
}

async function seedBeleg(o: SeedOpts = {}): Promise<void> {
  seedN += 1;
  const sha = seedN.toString(16).padStart(64, '0');
  await pool.query(
    `INSERT INTO belege
       (tenant_id, source_channel, file_object_key, file_mime_type, file_size_bytes,
        file_sha256, status, category, supplier_name, document_date, total_gross)
     VALUES ($1, 'manual_upload', $2, 'image/jpeg', 1234, $3, $4, $5, $6, $7, $8)`,
    [
      o.tenant ?? T_A,
      `s3://t/${sha}.jpg`,
      sha,
      o.status ?? 'categorized',
      o.category ?? null,
      o.supplier ?? null,
      o.date ?? null,
      o.gross ?? null,
    ],
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

  for (const t of [T_A, T_B]) {
    await pool.query('DELETE FROM belege WHERE tenant_id = $1', [t]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [t]);
    await pool.query(
      'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
      [t, `t087-${t.slice(-4)}`, `T087 ${t.slice(-4)}`, `wirt-${t.slice(-4)}@example.com`],
    );
  }

  // Tenant A, Mai 2026 — verbucht:
  await seedBeleg({
    status: 'categorized',
    category: 'wareneinkauf_food',
    supplier: 'Metro AG',
    date: '2026-05-10',
    gross: 100.0,
  });
  await seedBeleg({
    status: 'exported',
    category: 'wareneinkauf_food',
    supplier: 'Metro AG',
    date: '2026-05-15',
    gross: 50.0,
  });
  await seedBeleg({
    status: 'completed',
    category: 'bewirtung',
    supplier: 'Restaurant X',
    date: '2026-05-20',
    gross: 30.0,
  });
  // NICHT verbucht (requires_review) → muss ausgeschlossen sein:
  await seedBeleg({
    status: 'requires_review',
    category: 'wareneinkauf_food',
    supplier: 'Geist',
    date: '2026-05-12',
    gross: 999.0,
  });
  // verbucht aber ohne Datum → receipts_without_date, nicht im Monat:
  await seedBeleg({
    status: 'categorized',
    category: null,
    supplier: null,
    date: null,
    gross: 12.0,
  });
  // Vormonat April 2026:
  await seedBeleg({
    status: 'categorized',
    category: 'miete',
    supplier: 'Vermieter',
    date: '2026-04-25',
    gross: 200.0,
  });

  // Tenant B, Mai 2026 — darf NICHT in A's Aggregation auftauchen:
  await seedBeleg({
    tenant: T_B,
    status: 'categorized',
    category: 'wareneinkauf_food',
    supplier: 'Fremd',
    date: '2026-05-10',
    gross: 5000.0,
  });
});

afterAll(async () => {
  if (dbAvailable) {
    for (const t of [T_A, T_B]) {
      await pool.query('DELETE FROM belege WHERE tenant_id = $1', [t]).catch(() => {});
      await pool.query('DELETE FROM tenants WHERE id = $1', [t]).catch(() => {});
    }
  }
  await pool?.end().catch(() => {});
});

describe('T087 — computeMonthlyAggregates (Integration)', () => {
  it('aggregiert nur verbuchte Belege im Monatsfenster (totals + größte Einzelausgabe)', async () => {
    if (!dbAvailable) return;
    const agg = await computeMonthlyAggregates(pool, T_A, 2026, 5);
    expect(agg.totals.receipts_count).toBe(3);
    expect(agg.totals.gross_sum).toBeCloseTo(180.0, 2);
    expect(agg.totals.largest_single).toBeCloseTo(100.0, 2);
  });

  it('by_category nach Brutto absteigend, mit Labels', async () => {
    if (!dbAvailable) return;
    const agg = await computeMonthlyAggregates(pool, T_A, 2026, 5);
    expect(agg.by_category.map((c) => c.category)).toEqual(['wareneinkauf_food', 'bewirtung']);
    expect(agg.by_category[0].gross_sum).toBeCloseTo(150.0, 2);
    expect(agg.by_category[0].count).toBe(2);
    expect(agg.by_category[0].label).toBeTruthy();
  });

  it('top_suppliers nach Brutto absteigend', async () => {
    if (!dbAvailable) return;
    const agg = await computeMonthlyAggregates(pool, T_A, 2026, 5);
    expect(agg.top_suppliers[0]).toMatchObject({ supplier: 'Metro AG', count: 2 });
    expect(agg.top_suppliers[0].gross_sum).toBeCloseTo(150.0, 2);
  });

  it('Vormonatsvergleich + Delta-Prozent', async () => {
    if (!dbAvailable) return;
    const agg = await computeMonthlyAggregates(pool, T_A, 2026, 5);
    expect(agg.comparison_prev_month.gross_sum).toBeCloseTo(200.0, 2);
    // (180 - 200) / 200 = -10 %
    expect(agg.comparison_prev_month.delta_percent).toBeCloseTo(-10.0, 1);
  });

  it('zählt verbuchte Belege ohne Datum separat', async () => {
    if (!dbAvailable) return;
    const agg = await computeMonthlyAggregates(pool, T_A, 2026, 5);
    expect(agg.receipts_without_date).toBe(1);
  });

  it('Tenant-Isolation: fremde Belege fließen NICHT ein', async () => {
    if (!dbAvailable) return;
    const agg = await computeMonthlyAggregates(pool, T_A, 2026, 5);
    // T_B hat 5000 € im Mai — dürfte die 180 € von T_A nicht berühren.
    expect(agg.totals.gross_sum).toBeCloseTo(180.0, 2);
    const aggB = await computeMonthlyAggregates(pool, T_B, 2026, 5);
    expect(aggB.totals.gross_sum).toBeCloseTo(5000.0, 2);
    expect(aggB.totals.receipts_count).toBe(1);
  });

  it('leerer Monat → alles 0, leere Listen, Delta null', async () => {
    if (!dbAvailable) return;
    const agg = await computeMonthlyAggregates(pool, T_A, 2026, 1);
    expect(agg.totals.receipts_count).toBe(0);
    expect(agg.totals.gross_sum).toBe(0);
    expect(agg.by_category).toEqual([]);
    expect(agg.top_suppliers).toEqual([]);
    expect(agg.comparison_prev_month.delta_percent).toBeNull();
  });
});
