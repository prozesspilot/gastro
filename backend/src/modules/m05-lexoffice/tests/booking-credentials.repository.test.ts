/**
 * T009-Review-Fix #1 — Tests fuer booking_credentials Repo.
 *
 * Security-kritisches Modul: pgcrypto Encrypt/Decrypt, Token-Rotation,
 * Audit-Log ohne PII. Mock-Pool simuliert das DB-Verhalten — der echte
 * pgcrypto-Roundtrip wird in Integration-Tests gegen postgres laufen,
 * hier verifizieren wir nur die Query-Struktur + Audit-Verhalten.
 */

import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../core/audit/audit-log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('../../../core/config', () => ({
  config: { PP_PGCRYPTO_KEY: 'test-key-32-chars-min-aaaaaaaa' },
}));

import { logAuditEvent } from '../../../core/audit/audit-log';
import { config } from '../../../core/config';
import {
  BookingCredentialNotConfiguredError,
  getBookingTokenDecrypted,
  listBookingCredentials,
  upsertBookingCredential,
} from '../services/booking-credentials.repository';

const TENANT = '550e8400-e29b-41d4-a716-446655440000';
const USER = '550e8400-e29b-41d4-a716-446655440099';

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
  // Default: Key gesetzt
  (config as unknown as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY =
    'test-key-32-chars-min-aaaaaaaa';
});
afterEach(() => {
  vi.clearAllMocks();
});

// ── upsertBookingCredential ───────────────────────────────────────────────

describe('upsertBookingCredential', () => {
  it('throws wenn PP_PGCRYPTO_KEY leer (kein silent fail)', async () => {
    (config as unknown as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = '';
    const { pool } = makePoolWithQueryFn(() => ({ rows: [] }));
    await expect(
      upsertBookingCredential(pool, {
        tenantId: TENANT,
        provider: 'lexware_office',
        apiTokenPlaintext: 'lxo-xxx',
        actorUserId: USER,
      }),
    ).rejects.toThrow(/PP_PGCRYPTO_KEY/);
  });

  it('fuehrt BEGIN, set_config, INSERT, audit, COMMIT in dieser Reihenfolge aus', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePoolWithQueryFn((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('INSERT INTO booking_credentials')) {
        return {
          rows: [
            {
              id: 'bc-1',
              tenant_id: TENANT,
              provider: 'lexware_office',
              display_name: 'Test Steuerkanzlei',
              auto_push: false,
              active: true,
              deactivation_reason: null,
              created_at: new Date(),
              updated_at: new Date(),
              last_used_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await upsertBookingCredential(pool, {
      tenantId: TENANT,
      provider: 'lexware_office',
      apiTokenPlaintext: 'lxo-secret',
      displayName: 'Test Steuerkanzlei',
      actorUserId: USER,
    });

    expect(result.id).toBe('bc-1');

    const beginIdx = sqlCalls.findIndex((s) => s === 'BEGIN');
    const setConfigIdx = sqlCalls.findIndex((s) => s.includes('set_config'));
    const insertIdx = sqlCalls.findIndex((s) => s.includes('INSERT INTO booking_credentials'));
    const commitIdx = sqlCalls.findIndex((s) => s === 'COMMIT');

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(setConfigIdx).toBeGreaterThan(beginIdx);
    expect(insertIdx).toBeGreaterThan(setConfigIdx);
    expect(commitIdx).toBeGreaterThan(insertIdx);
  });

  it('SQL verwendet pgp_sym_encrypt fuer den Token (Klartext darf nicht direkt in Spalte)', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];
    const { pool } = makePoolWithQueryFn((sql, params) => {
      if (sql.includes('INSERT INTO booking_credentials')) {
        capturedSql = sql;
        capturedParams = params ?? [];
        return {
          rows: [
            {
              id: 'bc-1',
              tenant_id: TENANT,
              provider: 'lexware_office',
              display_name: null,
              auto_push: false,
              active: true,
              deactivation_reason: null,
              created_at: new Date(),
              updated_at: new Date(),
              last_used_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await upsertBookingCredential(pool, {
      tenantId: TENANT,
      provider: 'lexware_office',
      apiTokenPlaintext: 'lxo-supersecret-token',
      actorUserId: USER,
    });

    expect(capturedSql).toContain('pgp_sym_encrypt');
    // Token ist Parameter $3, Key ist Parameter $4
    expect(capturedParams[2]).toBe('lxo-supersecret-token');
    expect(capturedParams[3]).toBe('test-key-32-chars-min-aaaaaaaa');
  });

  it('Audit-Log enthaelt has_token=true aber NICHT den Klartext-Token', async () => {
    const { pool } = makePoolWithQueryFn((sql) => {
      if (sql.includes('INSERT INTO booking_credentials')) {
        return {
          rows: [
            {
              id: 'bc-1',
              tenant_id: TENANT,
              provider: 'lexware_office',
              display_name: null,
              auto_push: true,
              active: true,
              deactivation_reason: null,
              created_at: new Date(),
              updated_at: new Date(),
              last_used_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await upsertBookingCredential(pool, {
      tenantId: TENANT,
      provider: 'lexware_office',
      apiTokenPlaintext: 'lxo-supersecret-token-do-not-leak',
      autoPush: true,
      actorUserId: USER,
    });

    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const auditCall = (logAuditEvent as ReturnType<typeof vi.fn>).mock.calls[0];
    const auditInput = auditCall[1] as {
      eventType: string;
      payloadAfter?: { has_token?: boolean; api_token_plaintext?: string };
    };
    expect(auditInput.eventType).toBe('booking_credentials.upserted');
    expect(auditInput.payloadAfter?.has_token).toBe(true);
    // Sicherheits-Check: kein Klartext im Audit-Payload
    expect(JSON.stringify(auditInput.payloadAfter)).not.toContain(
      'lxo-supersecret-token-do-not-leak',
    );
  });

  it('ROLLBACK bei DB-Fehler', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePoolWithQueryFn((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('INSERT INTO booking_credentials')) {
        throw new Error('DB unavailable');
      }
      return { rows: [] };
    });

    await expect(
      upsertBookingCredential(pool, {
        tenantId: TENANT,
        provider: 'lexware_office',
        apiTokenPlaintext: 'lxo-x',
        actorUserId: USER,
      }),
    ).rejects.toThrow('DB unavailable');
    expect(sqlCalls).toContain('ROLLBACK');
  });
});

// ── getBookingTokenDecrypted ──────────────────────────────────────────────

describe('getBookingTokenDecrypted', () => {
  it('throws wenn PP_PGCRYPTO_KEY leer', async () => {
    (config as unknown as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = '';
    const { pool } = makePoolWithQueryFn(() => ({ rows: [] }));
    await expect(getBookingTokenDecrypted(pool, TENANT, 'lexware_office')).rejects.toThrow(
      /PP_PGCRYPTO_KEY/,
    );
  });

  it('throws BookingCredentialNotConfiguredError wenn kein aktiver Token', async () => {
    const { pool } = makePoolWithQueryFn(() => ({ rows: [] })); // empty result
    await expect(getBookingTokenDecrypted(pool, TENANT, 'lexware_office')).rejects.toThrow(
      BookingCredentialNotConfiguredError,
    );
  });

  it('liefert Token + Credential (ohne token_plain im Credential-Object)', async () => {
    const { pool } = makePoolWithQueryFn((sql) => {
      if (
        sql.includes('SELECT') &&
        sql.includes('booking_credentials') &&
        sql.includes('pgp_sym_decrypt')
      ) {
        return {
          rows: [
            {
              id: 'bc-1',
              tenant_id: TENANT,
              provider: 'lexware_office',
              display_name: 'Test',
              auto_push: false,
              active: true,
              deactivation_reason: null,
              created_at: new Date(),
              updated_at: new Date(),
              last_used_at: null,
              token_plain: 'lxo-decrypted-secret',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await getBookingTokenDecrypted(pool, TENANT, 'lexware_office');
    expect(result.token).toBe('lxo-decrypted-secret');
    expect(result.credential.id).toBe('bc-1');
    // Wichtig: token_plain darf NICHT im credential-Object landen
    expect((result.credential as unknown as { token_plain?: string }).token_plain).toBeUndefined();
  });

  it('SQL verwendet pgp_sym_decrypt mit PP_PGCRYPTO_KEY', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];
    const { pool } = makePoolWithQueryFn((sql, params) => {
      if (sql.includes('pgp_sym_decrypt')) {
        capturedSql = sql;
        capturedParams = params ?? [];
        return {
          rows: [
            {
              id: 'bc-1',
              tenant_id: TENANT,
              provider: 'lexware_office',
              display_name: null,
              auto_push: false,
              active: true,
              deactivation_reason: null,
              created_at: new Date(),
              updated_at: new Date(),
              last_used_at: null,
              token_plain: 'decrypted',
            },
          ],
        };
      }
      return { rows: [] };
    });

    await getBookingTokenDecrypted(pool, TENANT, 'lexware_office');
    expect(capturedSql).toContain('pgp_sym_decrypt(api_token_encrypted');
    expect(capturedParams[2]).toBe('test-key-32-chars-min-aaaaaaaa');
  });
});

// ── listBookingCredentials ────────────────────────────────────────────────

describe('listBookingCredentials', () => {
  it('SELECT enthaelt KEIN api_token_encrypted / token_plain', async () => {
    let capturedSql = '';
    const { pool } = makePoolWithQueryFn((sql) => {
      if (sql.includes('FROM booking_credentials')) {
        capturedSql = sql;
        return { rows: [] };
      }
      return { rows: [] };
    });

    await listBookingCredentials(pool, TENANT);
    expect(capturedSql).not.toContain('api_token_encrypted');
    expect(capturedSql).not.toContain('pgp_sym_decrypt');
    expect(capturedSql).not.toContain('token_plain');
  });

  it('liefert alle Credentials des Tenants', async () => {
    const { pool } = makePoolWithQueryFn((sql) => {
      if (sql.includes('FROM booking_credentials')) {
        return {
          rows: [
            {
              id: 'bc-1',
              tenant_id: TENANT,
              provider: 'lexware_office',
              display_name: 'Lexware',
              auto_push: false,
              active: true,
              deactivation_reason: null,
              created_at: new Date(),
              updated_at: new Date(),
              last_used_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await listBookingCredentials(pool, TENANT);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('lexware_office');
  });
});
