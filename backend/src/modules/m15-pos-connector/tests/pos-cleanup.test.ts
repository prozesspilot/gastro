/**
 * T018/M15 — Tests fuer purgeInactivePosCredentials + Cron-Script.
 *
 * Strategie:
 *   * Pool-Mock simuliert das DELETE ... RETURNING + interpretiert das
 *     retentionDays-Param.
 *   * Cron-Script-Test verifiziert: Audit-Log pro geloeschter Row.
 */

import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeInactivePosCredentials } from '../pos.repository';

const TENANT = '550e8400-e29b-41d4-a716-446655440000';

function makeMockPool(returnedRows: Array<Record<string, unknown>>) {
  return {
    query: vi.fn(async () => ({ rows: returnedRows, rowCount: returnedRows.length })),
  } as unknown as Pool;
}

describe('purgeInactivePosCredentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keine inaktiven Credentials → []', async () => {
    const pool = makeMockPool([]);
    const result = await purgeInactivePosCredentials(pool, 30);
    expect(result).toHaveLength(0);
  });

  it('eine inaktive Row > 30 Tage → 1 PurgedPosCredential', async () => {
    const inactiveDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const pool = makeMockPool([
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

  it('SQL nutzt retentionDays-Parameter', async () => {
    const pool = makeMockPool([]);
    await purgeInactivePosCredentials(pool, 90);
    const queryCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryCall[1]).toEqual([90]);
    expect(queryCall[0]).toContain('active = false');
    expect(queryCall[0]).toContain("INTERVAL '1 day'");
  });

  it('mehrere Rows werden alle zurueckgegeben', async () => {
    const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const pool = makeMockPool([
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
    expect(result.map((r) => r.id)).toEqual(['c-1', 'c-2']);
  });
});

// ── Cron-Integration ─────────────────────────────────────────────────────

vi.mock('../../m14-auth/users.repository', () => ({
  logAuthEvent: vi.fn(async () => undefined),
}));

vi.mock('pg', () => {
  const mockPool = {
    query: vi.fn(),
    end: vi.fn(async () => undefined),
  };
  return {
    Pool: vi.fn(() => mockPool),
    __mockPool: mockPool,
  };
});

import { runPosCredentialsCleanup } from '../../../cron/pos-credentials-cleanup';
import { logAuthEvent } from '../../m14-auth/users.repository';

describe('runPosCredentialsCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schreibt einen auth_audit_log-Eintrag pro geloeschter Row', async () => {
    // Mock-Pool gibt 2 Purged-Rows zurueck
    const pg = (await import('pg')) as unknown as {
      __mockPool: { query: ReturnType<typeof vi.fn> };
    };
    pg.__mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'c-1',
          tenant_id: TENANT,
          pos_system: 'sumup_lite',
          pos_account_id: 'a',
          inactive_reason: 'refresh_failed',
          updated_at: new Date(),
        },
        {
          id: 'c-2',
          tenant_id: '660e8400-e29b-41d4-a716-446655440000',
          pos_system: 'sumup_pos_pro',
          pos_account_id: 'b',
          inactive_reason: null,
          updated_at: new Date(),
        },
      ],
      rowCount: 2,
    });

    const result = await runPosCredentialsCleanup();
    expect(result.purged).toBe(2);
    expect(logAuthEvent).toHaveBeenCalledTimes(2);
    expect(logAuthEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'pos_credentials_purged',
        userId: null,
        userAgent: 'cron:pos-credentials-cleanup',
      }),
    );
  });

  it('nichts zu loeschen → kein Audit-Log', async () => {
    const pg = (await import('pg')) as unknown as {
      __mockPool: { query: ReturnType<typeof vi.fn> };
    };
    pg.__mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await runPosCredentialsCleanup();
    expect(result.purged).toBe(0);
    expect(logAuthEvent).not.toHaveBeenCalled();
  });
});
