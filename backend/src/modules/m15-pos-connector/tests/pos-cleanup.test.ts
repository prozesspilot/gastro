/**
 * T018/T022/M15 — Tests fuer purgeInactivePosCredentials + Cron-Script.
 *
 * Nach T018-Review-Fix #1+#2 + T022-Fix:
 *   * T022: DELETE laeuft ueber SECURITY DEFINER-Funktion delete_inactive_pos_credentials()
 *     (Migration 121). Der Pool-Mock matcht jetzt `SELECT * FROM delete_inactive_pos_credentials`.
 *   * Audit-Log-Inserts (tenant-isoliert) laufen in DERSELBEN Transaktion.
 *   * GUC-Name fuer Tenant-Context: app.current_tenant (nicht app.tenant_id).
 */

import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface QueryReturn {
  rows: unknown[];
  rowCount?: number;
}

/**
 * Pool-Mock mit Tx-Tracker: Liste der ausgefuehrten SQL-Statements.
 */
function makeTxPool(deletedRows: Array<Record<string, unknown>>): {
  pool: Pool;
  sqlCalls: string[];
  paramsCalls: unknown[][];
} {
  const sqlCalls: string[] = [];
  const paramsCalls: unknown[][] = [];

  const mockClient = {
    query: vi.fn(async (sql: string, params?: unknown[]): Promise<QueryReturn> => {
      sqlCalls.push(sql);
      paramsCalls.push(params ?? []);

      // T022: DELETE laeuft ueber SECURITY DEFINER-Funktion
      if (sql.startsWith('SELECT * FROM delete_inactive_pos_credentials')) {
        return { rows: deletedRows, rowCount: deletedRows.length };
      }
      // BEGIN, COMMIT, ROLLBACK, set_config, INSERT INTO audit_log → leeres Ergebnis
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  return {
    pool: {
      connect: vi.fn(async () => mockClient),
    } as unknown as Pool,
    sqlCalls,
    paramsCalls,
  };
}

const TENANT = '550e8400-e29b-41d4-a716-446655440000';

import { purgeInactivePosCredentials } from '../pos.repository';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('purgeInactivePosCredentials — Atomicity (Review-Fix #1)', () => {
  it('wraps DELETE + Audit-Inserts in EINER Transaktion', async () => {
    const { pool, sqlCalls } = makeTxPool([
      {
        id: 'cred-1',
        tenant_id: TENANT,
        pos_system: 'sumup_lite',
        pos_account_id: 'merch-001',
        inactive_reason: 'refresh_failed',
        updated_at: new Date(),
      },
    ]);

    await purgeInactivePosCredentials(pool, 30);

    // T022: Reihenfolge: BEGIN → delete_fn() → set_config(current_tenant) → INSERT audit_log → COMMIT
    const beginIdx = sqlCalls.findIndex((s) => s === 'BEGIN');
    const deleteIdx = sqlCalls.findIndex((s) =>
      s.startsWith('SELECT * FROM delete_inactive_pos_credentials'),
    );
    const tenantCtxIdx = sqlCalls.findIndex((s) => s.includes("'app.current_tenant'"));
    const auditIdx = sqlCalls.findIndex((s) => s.includes('INSERT INTO audit_log'));
    const commitIdx = sqlCalls.findIndex((s) => s === 'COMMIT');

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(beginIdx);
    expect(tenantCtxIdx).toBeGreaterThan(deleteIdx);
    expect(auditIdx).toBeGreaterThan(tenantCtxIdx);
    expect(commitIdx).toBeGreaterThan(auditIdx);
  });

  it('Review-Fix #2: Audit geht tenant-isoliert in audit_log, nicht in auth_audit_log', async () => {
    const { pool, sqlCalls, paramsCalls } = makeTxPool([
      {
        id: 'cred-1',
        tenant_id: TENANT,
        pos_system: 'sumup_lite',
        pos_account_id: 'merch-001',
        inactive_reason: 'refresh_failed',
        updated_at: new Date(),
      },
    ]);
    await purgeInactivePosCredentials(pool, 30);

    // audit_log statt auth_audit_log
    expect(sqlCalls.some((s) => s.includes('INSERT INTO audit_log'))).toBe(true);
    expect(sqlCalls.some((s) => s.includes('auth_audit_log'))).toBe(false);

    // T022: GUC-Name ist app.current_tenant (current_tenant_id() liest diesen Wert)
    const tenantCtxIdx = sqlCalls.findIndex((s) => s.includes("'app.current_tenant'"));
    expect(paramsCalls[tenantCtxIdx]).toEqual([TENANT]);
  });

  it('ROLLBACK wenn delete_fn() wirft (kein orphaner Zustand)', async () => {
    const sqlCalls: string[] = [];
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        sqlCalls.push(sql);
        // T022: SECURITY DEFINER-Funktion wirft
        if (sql.startsWith('SELECT * FROM delete_inactive_pos_credentials')) {
          throw new Error('DB unavailable');
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => mockClient) } as unknown as Pool;

    await expect(purgeInactivePosCredentials(pool, 30)).rejects.toThrow('DB unavailable');
    expect(sqlCalls).toContain('ROLLBACK');
  });

  it('ROLLBACK wenn audit_log-INSERT wirft → delete_fn wird rueckabgewickelt', async () => {
    const sqlCalls: string[] = [];
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        sqlCalls.push(sql);
        // T022: SECURITY DEFINER-Funktion gibt Rows zurueck
        if (sql.startsWith('SELECT * FROM delete_inactive_pos_credentials')) {
          return {
            rows: [
              {
                id: 'cred-1',
                tenant_id: TENANT,
                pos_system: 'sumup_lite',
                pos_account_id: 'merch-001',
                inactive_reason: null,
                updated_at: new Date(),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO audit_log')) {
          throw new Error('Audit-Log DB unavailable');
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => mockClient) } as unknown as Pool;

    await expect(purgeInactivePosCredentials(pool, 30)).rejects.toThrow('Audit-Log DB');
    // Wichtig: COMMIT darf NICHT vorkommen — DELETE muss rueckabgewickelt sein
    expect(sqlCalls).toContain('ROLLBACK');
    expect(sqlCalls).not.toContain('COMMIT');
  });

  it('client.release() wird in finally aufgerufen (kein Pool-Leak)', async () => {
    const releaseFn = vi.fn();
    const mockClient = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: releaseFn,
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => mockClient) } as unknown as Pool;

    await purgeInactivePosCredentials(pool, 30);
    expect(releaseFn).toHaveBeenCalledTimes(1);
  });

  it('client.release() auch bei Error im finally aufgerufen', async () => {
    const releaseFn = vi.fn();
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        // T022: Funktion-Aufruf wirft
        if (sql.startsWith('SELECT * FROM delete_inactive_pos_credentials')) {
          throw new Error('boom');
        }
        return { rows: [] };
      }),
      release: releaseFn,
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => mockClient) } as unknown as Pool;

    await expect(purgeInactivePosCredentials(pool, 30)).rejects.toThrow('boom');
    expect(releaseFn).toHaveBeenCalledTimes(1);
  });
});

describe('purgeInactivePosCredentials — Output', () => {
  it('keine inaktiven Credentials → []', async () => {
    const { pool } = makeTxPool([]);
    const result = await purgeInactivePosCredentials(pool, 30);
    expect(result).toEqual([]);
  });

  it('eine inaktive Row → PurgedPosCredential mit inactive_since=updated_at', async () => {
    const inactiveDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const { pool } = makeTxPool([
      {
        id: 'cred-1',
        tenant_id: TENANT,
        pos_system: 'sumup_lite',
        pos_account_id: 'merch-001',
        inactive_reason: 'refresh_failed',
        updated_at: inactiveDate,
      },
    ]);
    const result = await purgeInactivePosCredentials(pool, 30);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cred-1');
    expect(result[0].pos_system).toBe('sumup_lite');
    expect(result[0].inactive_reason).toBe('refresh_failed');
    expect(result[0].inactive_since).toEqual(inactiveDate);
  });

  it('T022: Funktion-Aufruf nutzt retentionDays als Parameter', async () => {
    const { pool, sqlCalls, paramsCalls } = makeTxPool([]);
    await purgeInactivePosCredentials(pool, 90);
    // T022: SECURITY DEFINER-Funktion wird mit retentionDays aufgerufen
    const deleteIdx = sqlCalls.findIndex((s) =>
      s.startsWith('SELECT * FROM delete_inactive_pos_credentials'),
    );
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(paramsCalls[deleteIdx]).toEqual([90]);
  });

  it('mehrere Rows + N Audit-Inserts (1 pro Row)', async () => {
    const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const { pool, sqlCalls } = makeTxPool([
      {
        id: 'c-1',
        tenant_id: TENANT,
        pos_system: 'sumup_lite',
        pos_account_id: 'a',
        inactive_reason: null,
        updated_at: oldDate,
      },
      {
        id: 'c-2',
        tenant_id: '660e8400-e29b-41d4-a716-446655440000',
        pos_system: 'sumup_pos_pro',
        pos_account_id: 'b',
        inactive_reason: 'manual_disconnect',
        updated_at: oldDate,
      },
    ]);
    const result = await purgeInactivePosCredentials(pool, 30);
    expect(result).toHaveLength(2);

    // Genau 2 audit_log-Inserts (1 pro Row)
    const auditCalls = sqlCalls.filter((s) => s.includes('INSERT INTO audit_log'));
    expect(auditCalls).toHaveLength(2);
  });

  it('audit_log-Eintrag hat korrekte entity/event-Felder + payload_before + metadata', async () => {
    const inactiveDate = new Date('2026-04-15T10:00:00Z');
    const { pool, sqlCalls, paramsCalls } = makeTxPool([
      {
        id: 'c-1',
        tenant_id: TENANT,
        pos_system: 'sumup_lite',
        pos_account_id: 'merch-test',
        inactive_reason: 'token_revoked',
        updated_at: inactiveDate,
      },
    ]);
    await purgeInactivePosCredentials(pool, 30);

    const auditIdx = sqlCalls.findIndex((s) => s.includes('INSERT INTO audit_log'));
    const auditParams = paramsCalls[auditIdx];
    // logAuditEvent-Params: [tenantId, entityType, entityId, eventType,
    //   actor-JSON, payloadBefore-JSON, payloadAfter-JSON, metadata-JSON]
    expect(auditParams[0]).toBe(TENANT); // tenant_id (tenant-isoliert!)
    expect(auditParams[1]).toBe('pos_credentials'); // entity_type
    expect(auditParams[2]).toBe('c-1'); // entity_id
    expect(auditParams[3]).toBe('pos_credentials.purged'); // event_type

    const actor = JSON.parse(auditParams[4] as string);
    expect(actor).toEqual({ type: 'system', id: 'cron:pos-credentials-cleanup' });

    const payloadBefore = JSON.parse(auditParams[5] as string);
    expect(payloadBefore.pos_system).toBe('sumup_lite');
    expect(payloadBefore.pos_account_id).toBe('merch-test');
    expect(payloadBefore.inactive_reason).toBe('token_revoked');
    expect(payloadBefore.inactive_since).toBe('2026-04-15T10:00:00.000Z');

    const metadata = JSON.parse(auditParams[7] as string);
    expect(metadata.retention_days).toBe(30);
  });
});

// ── Cron-Integration ─────────────────────────────────────────────────────

vi.mock('pg', () => {
  const mockPool = {
    connect: vi.fn(),
    end: vi.fn(async () => undefined),
  };
  return {
    Pool: vi.fn(() => mockPool),
    __mockPool: mockPool,
  };
});

import { runPosCredentialsCleanup } from '../../../cron/pos-credentials-cleanup';

describe('runPosCredentialsCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nichts zu loeschen → purged=0', async () => {
    const pg = (await import('pg')) as unknown as {
      __mockPool: { connect: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    };
    pg.__mockPool.connect.mockResolvedValueOnce({
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: vi.fn(),
    });

    const result = await runPosCredentialsCleanup();
    expect(result.purged).toBe(0);
    expect(pg.__mockPool.end).toHaveBeenCalled();
  });

  it('pool.end() wird auch bei Crash aufgerufen (finally-Block)', async () => {
    const pg = (await import('pg')) as unknown as {
      __mockPool: { connect: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    };
    pg.__mockPool.connect.mockRejectedValueOnce(new Error('Pool exhausted'));

    await expect(runPosCredentialsCleanup()).rejects.toThrow('Pool exhausted');
    expect(pg.__mockPool.end).toHaveBeenCalled();
  });
});
