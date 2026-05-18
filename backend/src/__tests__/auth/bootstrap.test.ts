/**
 * T003 — Bootstrap-Service Unit-Tests
 *
 * Testet runBootstrap() mit gemocktem Pool (kein echter DB-Zugriff).
 * Pattern analog zu notfall.test.ts.
 *
 * Testet:
 *   1. Erfolgreicher Bootstrap → gibt userId, totpSecret, backupCodes zurück
 *   2. Bricht ab wenn users-Tabelle nicht leer ist (ohne force)
 *   3. Lässt zweiten Admin mit force=true zu
 *   4. Bricht ab bei Email-Duplikat
 *   5. Rollback bei INSERT-Fehler
 *   6. Audit-Log wird nach Commit aufgerufen
 */

import * as argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBootstrap } from '../../modules/m14-auth/bootstrap.service';

// ── Pool-Mock-Helfer ──────────────────────────────────────────────────────────

interface MockClientState {
  userCount: number;
  emailExists: boolean;
  insertShouldFail?: boolean;
}

/**
 * Erstellt einen Pool-Mock der die Transaction-Sequenz simuliert.
 *
 * DESIGN: bootstrap.service.ts ruft pool.connect() auf und arbeitet danach
 * ausschließlich mit dem Client. pool.query() wird nur für den Audit-Log
 * (logAuthEvent) nach dem Commit aufgerufen.
 */
function makePool(state: MockClientState) {
  const committed: string[] = [];

  const client = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      const sqlNorm = sql.trim().toUpperCase();

      if (sqlNorm === 'BEGIN') {
        committed.push('BEGIN');
        return { rows: [], rowCount: 0 };
      }
      if (sqlNorm === 'COMMIT') {
        committed.push('COMMIT');
        return { rows: [], rowCount: 0 };
      }
      if (sqlNorm === 'ROLLBACK') {
        committed.push('ROLLBACK');
        return { rows: [], rowCount: 0 };
      }
      if (/LOCK TABLE/i.test(sql)) {
        committed.push('LOCK');
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT count/i.test(sql)) {
        return { rows: [{ n: state.userCount }], rowCount: 1 };
      }
      if (/SELECT id FROM users WHERE emergency_email/i.test(sql)) {
        if (state.emailExists) return { rows: [{ id: 'existing-uuid' }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO users/i.test(sql)) {
        if (state.insertShouldFail) throw new Error('DB connection lost');
        committed.push('INSERT');
        return {
          rows: [{ id: 'new-user-uuid-001', created_at: new Date('2026-05-18T12:00:00Z') }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };

  // pool.query() wird für logAuthEvent (Audit-Log) nach dem Commit aufgerufen
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string) => {
      // SECURITY DEFINER Funktion für Audit-Log
      if (/SELECT insert_auth_audit_log/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };

  return { pool, client, committed };
}

// ── Basis-Input ────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  discordUsername: 'stevetest',
  displayName: 'Steve Test',
  emergencyEmail: 'steve@test.gastro.de',
  // M14 §5.1: 16+ Zeichen, Groß, Klein, Zahl, Sonderzeichen
  password: 'TestPasswort!1234567',
};

// ── 1. Erfolgreicher Bootstrap ─────────────────────────────────────────────────

describe('runBootstrap — Erfolgsfall', () => {
  it('gibt userId, totpSecret und backupCodes zurück', async () => {
    const { pool } = makePool({ userCount: 0, emailExists: false });

    const result = await runBootstrap(pool as never, BASE_INPUT);

    expect(result.userId).toBe('new-user-uuid-001');
    // TOTP-Secret muss Base32 sein (Alphabet A-Z + 2-7)
    expect(result.totpSecret).toMatch(/^[A-Z2-7]+=*$/);
    // otpauth-URL
    expect(result.totpUrl).toMatch(/^otpauth:\/\/totp\//);
    // 10 Backup-Codes
    expect(result.backupCodes).toHaveLength(10);
    // Backup-Codes haben korrekte Länge (12 Zeichen)
    for (const code of result.backupCodes) {
      expect(code).toHaveLength(12);
    }
  });

  it('Passwort-Hash ist gültig (Argon2id round-trip)', async () => {
    const { pool, client } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, BASE_INPUT);

    // Den INSERT-Aufruf finden und den Passwort-Hash extrahieren
    const insertCall = client.query.mock.calls.find((args) =>
      /INSERT INTO users/i.test(args[0] as string),
    );
    // biome-ignore lint/style/noNonNullAssertion: insertCall ist durch expect().toBeDefined() gesichert
    const params = insertCall![1] as string[];
    // $4 = passwordHash (Position 3 in 0-indexed params array)
    const passwordHash = params[3];
    expect(typeof passwordHash).toBe('string');
    // Argon2id-Hash-Format prüfen
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    // Verify: muss mit Original-Passwort übereinstimmen
    const ok = await argon2.verify(passwordHash, BASE_INPUT.password);
    expect(ok).toBe(true);
  });

  it('führt BEGIN → LOCK → INSERT → COMMIT in korrekter Reihenfolge aus', async () => {
    const { pool, committed } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, BASE_INPUT);

    expect(committed).toEqual(['BEGIN', 'LOCK', 'INSERT', 'COMMIT']);
  });

  it('ruft Audit-Log nach COMMIT auf', async () => {
    const { pool } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, BASE_INPUT);

    // pool.query() (nicht client.query) ist der Audit-Log-Pfad
    const auditCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find((args) =>
      /insert_auth_audit_log/i.test(args[0] as string),
    );
    expect(auditCall).toBeDefined();
  });

  it('setzt discord_username auf null wenn leer übergeben', async () => {
    const { pool, client } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, { ...BASE_INPUT, discordUsername: null });

    const insertCall = client.query.mock.calls.find((args) =>
      /INSERT INTO users/i.test(args[0] as string),
    );
    expect(insertCall).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: insertCall ist durch expect().toBeDefined() gesichert
    const params = insertCall![1] as (string | null)[];
    // $1 = discordUsername
    expect(params[0]).toBeNull();
  });
});

// ── 2. Idempotenz: bricht ab wenn users nicht leer (ohne force) ───────────────

describe('runBootstrap — Idempotenz', () => {
  it('wirft Error wenn users-Tabelle nicht leer und force=false', async () => {
    const { pool } = makePool({ userCount: 1, emailExists: false });

    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow(/bereits.*User/i);
  });

  it('führt ROLLBACK bei Abbruch durch count-Check aus', async () => {
    const { pool, committed } = makePool({ userCount: 1, emailExists: false });

    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow();
    expect(committed).toContain('ROLLBACK');
    expect(committed).not.toContain('COMMIT');
  });
});

// ── 3. force=true: erlaubt zweiten Admin ─────────────────────────────────────

describe('runBootstrap — force=true', () => {
  it('legt User an auch wenn bereits andere User existieren', async () => {
    const { pool } = makePool({ userCount: 2, emailExists: false });

    const result = await runBootstrap(pool as never, { ...BASE_INPUT, force: true });

    expect(result.userId).toBe('new-user-uuid-001');
  });
});

// ── 4. Email-Duplikat ─────────────────────────────────────────────────────────

describe('runBootstrap — Email-Duplikat', () => {
  it('wirft Error bei doppelter Email (CITEXT-check)', async () => {
    const { pool } = makePool({ userCount: 0, emailExists: true });

    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow(/bereits.*User/i);
  });

  it('führt ROLLBACK bei Email-Duplikat aus', async () => {
    const { pool, committed } = makePool({ userCount: 0, emailExists: true });

    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow();
    expect(committed).toContain('ROLLBACK');
    expect(committed).not.toContain('COMMIT');
  });
});

// ── 5. INSERT-Fehler → ROLLBACK ───────────────────────────────────────────────

describe('runBootstrap — DB-Fehler', () => {
  it('führt ROLLBACK durch wenn INSERT fehlschlägt', async () => {
    const { pool, committed } = makePool({
      userCount: 0,
      emailExists: false,
      insertShouldFail: true,
    });

    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow('DB connection lost');
    expect(committed).toContain('ROLLBACK');
    expect(committed).not.toContain('COMMIT');
  });

  it('gibt den Original-Fehler weiter (kein Error-Swallowing)', async () => {
    const { pool } = makePool({
      userCount: 0,
      emailExists: false,
      insertShouldFail: true,
    });

    const err = await runBootstrap(pool as never, BASE_INPUT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('DB connection lost');
  });
});
