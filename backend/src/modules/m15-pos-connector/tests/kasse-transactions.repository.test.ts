/**
 * T005-Review-Fix #1 + #3 — Tests fuer kasse-transactions.repository.
 *
 * Vor dem Fix: listActiveSumUpTenants nutzte set_config(..., true) ohne
 * BEGIN/COMMIT → GUC wirkte nicht im naechsten Query → silent-empty-Result
 * sobald RLS auf pos_credentials aktiviert wird (T020).
 *
 * Diese Tests verifizieren die korrekte BEGIN/COMMIT-Reihenfolge.
 */

import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listActiveSumUpTenants,
  listKasseTransactions,
  upsertKasseTransactionDay,
} from '../kasse-transactions.repository';

vi.mock('../../../core/audit/audit-log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

const TENANT = '550e8400-e29b-41d4-a716-446655440000';

function makePoolWithQueryFn(
  queryFn: (sql: string, params?: unknown[]) => { rows: unknown[] } | Promise<{ rows: unknown[] }>,
): { pool: Pool; mockClient: PoolClient } {
  const mockClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => queryFn(sql, params)),
    release: vi.fn(),
  } as unknown as PoolClient;
  return {
    pool: { connect: vi.fn(async () => mockClient) } as unknown as Pool,
    mockClient,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.clearAllMocks();
});

// ── listActiveSumUpTenants ────────────────────────────────────────────────

describe('listActiveSumUpTenants (Review-Fix #1)', () => {
  it('wraps in BEGIN/COMMIT damit set_config(..., true) wirkt', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePoolWithQueryFn((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('SELECT tenant_id, pos_account_id')) {
        return { rows: [{ tenant_id: TENANT, pos_account_id: 'merch-001' }] };
      }
      return { rows: [] };
    });

    const result = await listActiveSumUpTenants(pool);

    expect(result).toHaveLength(1);
    expect(result[0].tenant_id).toBe(TENANT);

    // Reihenfolge-Check: BEGIN, set_config, SELECT, COMMIT
    const beginIdx = sqlCalls.findIndex((s) => s === 'BEGIN');
    const setConfigIdx = sqlCalls.findIndex((s) => s.includes('set_config'));
    const selectIdx = sqlCalls.findIndex((s) => s.includes('SELECT tenant_id'));
    const commitIdx = sqlCalls.findIndex((s) => s === 'COMMIT');

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(setConfigIdx).toBeGreaterThan(beginIdx);
    expect(selectIdx).toBeGreaterThan(setConfigIdx);
    expect(commitIdx).toBeGreaterThan(selectIdx);
  });

  it('set_config setzt app.bypass_rls=on (RLS-Bypass-GUC)', async () => {
    let bypassCall: { sql: string; params?: unknown[] } | null = null;
    const { pool } = makePoolWithQueryFn((sql, params) => {
      if (sql.includes('set_config')) {
        bypassCall = { sql, params };
      }
      if (sql.includes('SELECT tenant_id')) return { rows: [] };
      return { rows: [] };
    });

    await listActiveSumUpTenants(pool);

    if (!bypassCall) throw new Error('Expected set_config call to be captured');
    expect(bypassCall.sql).toContain("'app.bypass_rls'");
    expect(bypassCall.sql).toContain("'on'");
  });

  it('ROLLBACK bei DB-Fehler', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePoolWithQueryFn((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('SELECT tenant_id')) {
        throw new Error('DB unavailable');
      }
      return { rows: [] };
    });

    await expect(listActiveSumUpTenants(pool)).rejects.toThrow('DB unavailable');
    expect(sqlCalls).toContain('ROLLBACK');
  });

  it('leere DB → leeres Array (kein Crash)', async () => {
    const { pool } = makePoolWithQueryFn((sql) => {
      if (sql.includes('SELECT tenant_id')) return { rows: [] };
      return { rows: [] };
    });

    const result = await listActiveSumUpTenants(pool);
    expect(result).toEqual([]);
  });
});

// ── upsertKasseTransactionDay ─────────────────────────────────────────────

describe('upsertKasseTransactionDay (Review-Fix #3)', () => {
  it('UPSERT-SQL nutzt ON CONFLICT (tenant_id, pos_system, business_date)', async () => {
    let capturedSql = '';
    const { pool } = makePoolWithQueryFn((sql) => {
      if (sql.includes('INSERT INTO kasse_transactions')) {
        capturedSql = sql;
        return {
          rows: [
            {
              id: 'kt-1',
              tenant_id: TENANT,
              pos_system: 'sumup_lite',
              business_date: '2026-05-18',
              total_brutto: 100,
              total_netto: 84.03,
              transaction_count: 5,
              ust_19_brutto: 100,
              ust_19_netto: 84.03,
              ust_19_amount: 15.97,
              ust_7_brutto: 0,
              ust_7_netto: 0,
              ust_7_amount: 0,
              ust_0_brutto: 0,
              payment_method_split: {},
              raw_data: {},
              exported_to_accounting: false,
              exported_at: null,
              created_at: new Date(),
              updated_at: new Date(),
              integration_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await upsertKasseTransactionDay(
      pool,
      {
        tenantId: TENANT,
        posSystem: 'sumup_lite',
        businessDate: '2026-05-18',
        totalBrutto: 100,
        totalNetto: 84.03,
        transactionCount: 5,
        ust19Brutto: 100,
        ust19Netto: 84.03,
        ust19Amount: 15.97,
        ust7Brutto: 0,
        ust7Netto: 0,
        ust7Amount: 0,
        ust0Brutto: 0,
        paymentMethodSplit: { card: 100 },
      },
      'cron:test',
    );

    expect(capturedSql).toContain('ON CONFLICT (tenant_id, pos_system, business_date)');
    expect(capturedSql).toContain('DO UPDATE');
  });

  it('schreibt Audit-Log mit kasse.day_synced Event-Type', async () => {
    const { logAuditEvent } = (await import('../../../core/audit/audit-log')) as unknown as {
      logAuditEvent: ReturnType<typeof vi.fn>;
    };
    const { pool } = makePoolWithQueryFn((sql) => {
      if (sql.includes('INSERT INTO kasse_transactions')) {
        return { rows: [{ id: 'kt-1' }] };
      }
      return { rows: [] };
    });

    await upsertKasseTransactionDay(
      pool,
      {
        tenantId: TENANT,
        posSystem: 'sumup_lite',
        businessDate: '2026-05-18',
        totalBrutto: 100,
        totalNetto: 84.03,
        transactionCount: 5,
        ust19Brutto: 0,
        ust19Netto: 0,
        ust19Amount: 0,
        ust7Brutto: 0,
        ust7Netto: 0,
        ust7Amount: 0,
        ust0Brutto: 0,
        paymentMethodSplit: {},
      },
      'cron:test',
    );

    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const auditInput = logAuditEvent.mock.calls[0][1];
    expect(auditInput.eventType).toBe('kasse.day_synced');
  });
});

// ── listKasseTransactions ─────────────────────────────────────────────────

describe('listKasseTransactions', () => {
  it('Pagination + Date-Filter sind optional', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];
    const { pool } = makePoolWithQueryFn((sql, params) => {
      if (sql.includes('FROM kasse_transactions')) {
        capturedSql = sql;
        capturedParams = params ?? [];
        return { rows: [] };
      }
      return { rows: [] };
    });

    await listKasseTransactions(pool, TENANT, { limit: 50, offset: 10 });
    expect(capturedSql).toContain('LIMIT $4 OFFSET $5');
    expect(capturedParams[3]).toBe(50);
    expect(capturedParams[4]).toBe(10);
    expect(capturedParams[1]).toBeNull(); // fromDate
    expect(capturedParams[2]).toBeNull(); // toDate
  });

  it('total wird aus Window-Function-COUNT extrahiert', async () => {
    const { pool } = makePoolWithQueryFn((sql) => {
      if (sql.includes('FROM kasse_transactions')) {
        return {
          rows: [{ id: 'kt-1', tenant_id: TENANT, total_count: '42' }],
        };
      }
      return { rows: [] };
    });

    const result = await listKasseTransactions(pool, TENANT, {});
    expect(result.total).toBe(42);
    expect(result.items).toHaveLength(1);
    // total_count darf NICHT im Item-Object landen
    expect((result.items[0] as unknown as { total_count?: string }).total_count).toBeUndefined();
  });

  it('leeres Result → total=0', async () => {
    const { pool } = makePoolWithQueryFn(() => ({ rows: [] }));
    const result = await listKasseTransactions(pool, TENANT, {});
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
