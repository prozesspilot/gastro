/**
 * T005/M15 — Repository fuer kasse_transactions (Migration 040 + 110).
 *
 * Strukturell: pro Tenant × pos_system × business_date eine Row mit
 * vorab aggregierten Z-Bon-Summen (Brutto/Netto/MwSt-Split/Payment-Split).
 *
 * Idempotenz via UNIQUE-Constraint (tenant_id, pos_system, business_date):
 * Re-Sync desselben Tages UPSERTet die Aggregate.
 */

import type { Pool, PoolClient } from 'pg';
import { logAuditEvent } from '../../core/audit/audit-log';

export interface DbKasseTransaction {
  id: string;
  tenant_id: string;
  integration_id: string | null;
  pos_system: string;
  business_date: string;
  total_brutto: number;
  total_netto: number;
  transaction_count: number;
  ust_19_brutto: number;
  ust_19_netto: number;
  ust_19_amount: number;
  ust_7_brutto: number;
  ust_7_netto: number;
  ust_7_amount: number;
  ust_0_brutto: number;
  payment_method_split: Record<string, number>;
  raw_data: Record<string, unknown>;
  exported_to_accounting: boolean;
  exported_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DailyAggregate {
  tenantId: string;
  posSystem: string;
  businessDate: string;
  totalBrutto: number;
  totalNetto: number;
  transactionCount: number;
  ust19Brutto: number;
  ust19Netto: number;
  ust19Amount: number;
  ust7Brutto: number;
  ust7Netto: number;
  ust7Amount: number;
  ust0Brutto: number;
  paymentMethodSplit: Record<string, number>;
  rawData?: Record<string, unknown>;
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  // T041: Key MUSS app.current_tenant sein (von RLS-Policy current_tenant_id() gelesen).
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

/**
 * UPSERT eines Daily-Z-Bon-Eintrags. Idempotent ueber UNIQUE
 * (tenant_id, pos_system, business_date). Audit-Log: kasse.day_synced.
 */
export async function upsertKasseTransactionDay(
  pool: Pool,
  agg: DailyAggregate,
  actorUserId: string,
): Promise<DbKasseTransaction> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, agg.tenantId);

    const result = await client.query<DbKasseTransaction>(
      `INSERT INTO kasse_transactions (
         tenant_id, pos_system, business_date,
         total_brutto, total_netto, transaction_count,
         ust_19_brutto, ust_19_netto, ust_19_amount,
         ust_7_brutto, ust_7_netto, ust_7_amount,
         ust_0_brutto,
         payment_method_split, raw_data
       ) VALUES (
         $1, $2, $3,
         $4, $5, $6,
         $7, $8, $9,
         $10, $11, $12,
         $13,
         $14::jsonb, $15::jsonb
       )
       ON CONFLICT (tenant_id, pos_system, business_date) DO UPDATE
         SET total_brutto = EXCLUDED.total_brutto,
             total_netto = EXCLUDED.total_netto,
             transaction_count = EXCLUDED.transaction_count,
             ust_19_brutto = EXCLUDED.ust_19_brutto,
             ust_19_netto = EXCLUDED.ust_19_netto,
             ust_19_amount = EXCLUDED.ust_19_amount,
             ust_7_brutto = EXCLUDED.ust_7_brutto,
             ust_7_netto = EXCLUDED.ust_7_netto,
             ust_7_amount = EXCLUDED.ust_7_amount,
             ust_0_brutto = EXCLUDED.ust_0_brutto,
             payment_method_split = EXCLUDED.payment_method_split,
             raw_data = EXCLUDED.raw_data
       RETURNING *`,
      [
        agg.tenantId,
        agg.posSystem,
        agg.businessDate,
        agg.totalBrutto,
        agg.totalNetto,
        agg.transactionCount,
        agg.ust19Brutto,
        agg.ust19Netto,
        agg.ust19Amount,
        agg.ust7Brutto,
        agg.ust7Netto,
        agg.ust7Amount,
        agg.ust0Brutto,
        JSON.stringify(agg.paymentMethodSplit),
        JSON.stringify(agg.rawData ?? {}),
      ],
    );

    await logAuditEvent(client, {
      tenantId: agg.tenantId,
      entityType: 'kasse_transaction',
      entityId: result.rows[0].id,
      eventType: 'kasse.day_synced',
      actor: { type: 'system', id: actorUserId },
      payloadAfter: {
        pos_system: agg.posSystem,
        business_date: agg.businessDate,
        transaction_count: agg.transactionCount,
        total_brutto: agg.totalBrutto,
      },
    });

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Listet Daily-Z-Bons im Datums-Fenster fuer einen Tenant.
 */
export async function listKasseTransactions(
  pool: Pool,
  tenantId: string,
  opts: { fromDate?: string; toDate?: string; limit?: number; offset?: number },
): Promise<{ items: DbKasseTransaction[]; total: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    // T005-Review-Fix: Separater COUNT statt `COUNT(*) OVER()`. Das Window-COUNT
    // liefert den Gesamtwert nur ueber zurueckgegebene Rows — auf einer Seite
    // jenseits der Treffermenge (offset >= total) sind keine Rows da und der
    // Gesamtwert fiel faelschlich auf 0, obwohl Datensaetze existieren.
    const countResult = await client.query<{ total: string }>(
      `SELECT COUNT(*) AS total
         FROM kasse_transactions
        WHERE tenant_id = $1
          AND ($2::date IS NULL OR business_date >= $2::date)
          AND ($3::date IS NULL OR business_date <= $3::date)`,
      [tenantId, opts.fromDate ?? null, opts.toDate ?? null],
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

    const result = await client.query<DbKasseTransaction>(
      `SELECT *
         FROM kasse_transactions
        WHERE tenant_id = $1
          AND ($2::date IS NULL OR business_date >= $2::date)
          AND ($3::date IS NULL OR business_date <= $3::date)
        ORDER BY business_date DESC
        LIMIT $4 OFFSET $5`,
      [tenantId, opts.fromDate ?? null, opts.toDate ?? null, limit, offset],
    );

    await client.query('COMMIT');
    const items = result.rows.map((row) => row as DbKasseTransaction);
    return { items, total };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Listet alle aktiven pos_credentials-Tenants — Daily-Cron iteriert darueber.
 *
 * BEGIN/COMMIT-Pattern: `set_config(name, value, is_local=true)` ist LOCAL und
 * braucht eine aktive Transaktion, sonst ist das GUC im naechsten Statement
 * schon wieder weg.
 *
 * ⚠️ WICHTIG — RLS-Bypass-Grenze (T005-Review-Fix #2, korrigiert):
 * Das `set_config('app.bypass_rls','on')` unten ist zur Laufzeit ein NO-OP,
 * solange der Cron mit der App-Rolle `gastro_app` laeuft: `is_rls_bypassed()`
 * (Migration 002_helpers) liefert nur fuer `gastro_owner`/Superuser true.
 * Aktuell funktioniert die Abfrage NUR, weil `pos_credentials` noch gar keine
 * RLS-Policy hat (Migration 022). SOBALD T020 RLS auf pos_credentials mit einer
 * `is_rls_bypassed() OR tenant_id = current_tenant_id()`-Policy aktiviert, gibt
 * dieser Cron als `gastro_app` ein SILENT-EMPTY-Result zurueck (kein Fehler).
 *
 * T020 MUSS daher diesen Cron auf eine Owner-Connection umstellen (analog zum
 * Migrate-Pfad) — der GUC allein reicht nicht. Siehe Backlog
 * `T022-pos-cron-owner-connection`.
 */
export async function listActiveSumUpTenants(
  pool: Pool,
): Promise<Array<{ tenant_id: string; pos_account_id: string }>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const result = await client.query<{ tenant_id: string; pos_account_id: string }>(
      `SELECT tenant_id, pos_account_id
         FROM pos_credentials
        WHERE active = true AND pos_system = 'sumup_lite'`,
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
