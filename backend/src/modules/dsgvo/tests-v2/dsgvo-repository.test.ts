/**
 * T010/M12 — Tests fuer die dsgvo_requests-Repository-Funktionen.
 *
 * Strategie: Pool-Mock mit BEGIN/COMMIT-Sequenz; wir verifizieren, dass
 *   * setTenantContext im Tx aufgerufen wird (RLS-Disziplin)
 *   * INSERT/UPDATE-SQL korrekt parametrisiert ist
 *   * Audit-Log in derselben Tx geschrieben wird
 */

import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countRecentDsgvoRequests,
  createDsgvoRequest,
  getDsgvoRequestById,
  updateDsgvoRequestStatus,
} from '../services/dsgvo-request.repository';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const REQUEST_UUID = '660e8400-e29b-41d4-a716-446655440000';
const USER_UUID = '770e8400-e29b-41d4-a716-446655440000';

function makePoolWithQueryFn(
  queryFn: (sql: string, params?: unknown[]) => { rows: unknown[] } | Promise<{ rows: unknown[] }>,
) {
  const mockClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => queryFn(sql, params)),
    release: vi.fn(),
  } as unknown as PoolClient;
  return {
    connect: vi.fn(async () => mockClient),
    mockClient,
  } as { connect: ReturnType<typeof vi.fn>; mockClient: PoolClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createDsgvoRequest', () => {
  it('fuehrt BEGIN, set_config, INSERT, audit_log, COMMIT in dieser Reihenfolge aus', async () => {
    const sqlCalls: string[] = [];
    const pool = makePoolWithQueryFn((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('INSERT INTO dsgvo_requests')) {
        return {
          rows: [
            {
              id: REQUEST_UUID,
              tenant_id: TENANT_UUID,
              type: 'auskunft',
              status: 'pending',
              subject_email: 'subject@example.com',
              subject_description: null,
              requested_by_user_id: USER_UUID,
              export_object_key: null,
              export_password_hash: null,
              soft_deleted_count: 0,
              hard_deleted_count: 0,
              error_message: null,
              created_at: new Date(),
              updated_at: new Date(),
              completed_at: null,
              expires_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await createDsgvoRequest(pool as unknown as Pool, {
      tenantId: TENANT_UUID,
      type: 'auskunft',
      subjectEmail: 'subject@example.com',
      requestedByUserId: USER_UUID,
    });

    expect(result.id).toBe(REQUEST_UUID);
    expect(result.type).toBe('auskunft');
    expect(result.status).toBe('pending');

    // Reihenfolge-Check
    const beginIdx = sqlCalls.findIndex((s) => s === 'BEGIN');
    const setConfigIdx = sqlCalls.findIndex((s) => s.includes('set_config'));
    const insertIdx = sqlCalls.findIndex((s) => s.includes('INSERT INTO dsgvo_requests'));
    const auditIdx = sqlCalls.findIndex((s) => s.includes('audit_log'));
    const commitIdx = sqlCalls.findIndex((s) => s === 'COMMIT');

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(setConfigIdx).toBeGreaterThan(beginIdx);
    expect(insertIdx).toBeGreaterThan(setConfigIdx);
    expect(auditIdx).toBeGreaterThan(insertIdx);
    expect(commitIdx).toBeGreaterThan(auditIdx);
  });

  it('ROLLBACK bei DB-Fehler', async () => {
    const sqlCalls: string[] = [];
    const pool = makePoolWithQueryFn((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('INSERT INTO dsgvo_requests')) {
        throw new Error('DB unavailable');
      }
      return { rows: [] };
    });

    await expect(
      createDsgvoRequest(pool as unknown as Pool, {
        tenantId: TENANT_UUID,
        type: 'auskunft',
        subjectEmail: 'subject@example.com',
        requestedByUserId: USER_UUID,
      }),
    ).rejects.toThrow('DB unavailable');
    expect(sqlCalls.find((s) => s === 'ROLLBACK')).toBe('ROLLBACK');
  });
});

describe('getDsgvoRequestById', () => {
  it('liefert die Request-Row wenn vorhanden', async () => {
    const pool = makePoolWithQueryFn((sql) => {
      if (sql.startsWith('SELECT * FROM dsgvo_requests')) {
        return {
          rows: [
            {
              id: REQUEST_UUID,
              tenant_id: TENANT_UUID,
              type: 'loeschung',
              status: 'confirming',
              subject_email: 'subject@example.com',
              subject_description: null,
              requested_by_user_id: USER_UUID,
              export_object_key: null,
              export_password_hash: null,
              soft_deleted_count: 0,
              hard_deleted_count: 0,
              error_message: null,
              created_at: new Date(),
              updated_at: new Date(),
              completed_at: null,
              expires_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await getDsgvoRequestById(pool as unknown as Pool, TENANT_UUID, REQUEST_UUID);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(REQUEST_UUID);
    expect(result?.type).toBe('loeschung');
  });

  it('liefert null wenn nicht vorhanden', async () => {
    const pool = makePoolWithQueryFn(() => ({ rows: [] }));
    const result = await getDsgvoRequestById(pool as unknown as Pool, TENANT_UUID, REQUEST_UUID);
    expect(result).toBeNull();
  });
});

describe('updateDsgvoRequestStatus', () => {
  it('baut dynamische UPDATE-Klausel nur mit gesetzten Feldern', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];
    const pool = makePoolWithQueryFn((sql, params) => {
      if (sql.includes('SELECT status, type FROM dsgvo_requests')) {
        return { rows: [{ status: 'pending', type: 'auskunft' }] };
      }
      if (sql.includes('UPDATE dsgvo_requests')) {
        capturedSql = sql;
        capturedParams = params ?? [];
        return {
          rows: [
            {
              id: REQUEST_UUID,
              tenant_id: TENANT_UUID,
              type: 'auskunft',
              status: 'ready',
              subject_email: 'subject@example.com',
              subject_description: null,
              requested_by_user_id: USER_UUID,
              export_object_key: 'key.zip',
              export_password_hash: null,
              soft_deleted_count: 0,
              hard_deleted_count: 0,
              error_message: null,
              created_at: new Date(),
              updated_at: new Date(),
              completed_at: null,
              expires_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await updateDsgvoRequestStatus(
      pool as unknown as Pool,
      TENANT_UUID,
      REQUEST_UUID,
      { status: 'ready', export_object_key: 'key.zip' },
    );

    expect(result?.status).toBe('ready');
    expect(capturedSql).toContain('status = $1');
    expect(capturedSql).toContain('export_object_key = $2');
    expect(capturedParams).toEqual(['ready', 'key.zip', REQUEST_UUID, TENANT_UUID]);
  });

  it('Audit-Log nur wenn Status sich aendert', async () => {
    const sqlCalls: string[] = [];
    const pool = makePoolWithQueryFn((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('SELECT status, type FROM dsgvo_requests')) {
        return { rows: [{ status: 'ready', type: 'auskunft' }] };
      }
      if (sql.includes('UPDATE dsgvo_requests')) {
        return { rows: [{ id: REQUEST_UUID, status: 'ready' }] };
      }
      return { rows: [] };
    });

    // Patch nur export_password_hash, NICHT status → kein audit_log-Insert
    await updateDsgvoRequestStatus(pool as unknown as Pool, TENANT_UUID, REQUEST_UUID, {
      export_password_hash: 'hash',
    });

    const auditCall = sqlCalls.find((s) => s.includes('INSERT INTO audit_log'));
    expect(auditCall).toBeUndefined();
  });
});

describe('countRecentDsgvoRequests', () => {
  it('zaehlt Antraege der letzten 24h (status NOT cancelled/failed)', async () => {
    const pool = makePoolWithQueryFn((sql) => {
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ count: '3' }] };
      }
      return { rows: [] };
    });

    const count = await countRecentDsgvoRequests(pool as unknown as Pool, TENANT_UUID);
    expect(count).toBe(3);
  });

  it('liefert 0 wenn keine Antraege', async () => {
    const pool = makePoolWithQueryFn(() => ({ rows: [] }));
    const count = await countRecentDsgvoRequests(pool as unknown as Pool, TENANT_UUID);
    expect(count).toBe(0);
  });
});
