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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../core/config';
import { runBootstrap } from '../../modules/m14-auth/bootstrap.service';

// ── Config-Test-Helper ────────────────────────────────────────────────────────
// Erlaubt einzelne config-Felder pro Test zu überschreiben (z.B. PP_PGCRYPTO_KEY).
// config ist nicht frozen, daher direkte Mutation OK.

const ORIGINAL_PGCRYPTO_KEY = config.PP_PGCRYPTO_KEY;
const ORIGINAL_NODE_ENV = config.NODE_ENV;

afterEach(() => {
  (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = ORIGINAL_PGCRYPTO_KEY;
  (config as { NODE_ENV: string }).NODE_ENV = ORIGINAL_NODE_ENV;
});

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

    // Distinkter Regex: count-check Message lautet "Es existieren bereits N User"
    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow(/bereits \d+ User/i);
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

    // Distinkter Regex: Email-Dup-Message lautet "Email "X" ist bereits ... zugeordnet"
    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow(
      /Email.*bereits.*zugeordnet/i,
    );
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

  it('ruft client.release() auch bei Fehler auf (kein Pool-Leak)', async () => {
    const { pool, client } = makePool({
      userCount: 0,
      emailExists: false,
      insertShouldFail: true,
    });

    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow();
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// ── 6. N1: Production-Guard für PP_PGCRYPTO_KEY ───────────────────────────────

describe('runBootstrap — N1 Production-Guard', () => {
  it('wirft Error in production wenn PP_PGCRYPTO_KEY leer ist', async () => {
    (config as { NODE_ENV: string }).NODE_ENV = 'production';
    (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = '';

    const { pool } = makePool({ userCount: 0, emailExists: false });

    await expect(runBootstrap(pool as never, BASE_INPUT)).rejects.toThrow(
      /PP_PGCRYPTO_KEY.*Production.*Pflicht/i,
    );
  });

  it('lässt Bootstrap in production zu wenn PP_PGCRYPTO_KEY gesetzt ist', async () => {
    (config as { NODE_ENV: string }).NODE_ENV = 'production';
    (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = 'test-production-key';

    const { pool } = makePool({ userCount: 0, emailExists: false });

    const result = await runBootstrap(pool as never, BASE_INPUT);
    expect(result.userId).toBe('new-user-uuid-001');
  });

  it('lässt Bootstrap in development zu auch wenn PP_PGCRYPTO_KEY leer ist (Warnung im CLI)', async () => {
    (config as { NODE_ENV: string }).NODE_ENV = 'development';
    (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = '';

    const { pool } = makePool({ userCount: 0, emailExists: false });

    const result = await runBootstrap(pool as never, BASE_INPUT);
    expect(result.userId).toBe('new-user-uuid-001');
  });
});

// ── 7. N3: PGCRYPTO-Branch — beide INSERT-Pfade differenzieren ────────────────

describe('runBootstrap — N3 PGCRYPTO-Branch', () => {
  it('nutzt pgp_sym_encrypt im INSERT wenn PP_PGCRYPTO_KEY gesetzt', async () => {
    (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = 'test-key-abc-123';

    const { pool, client } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, BASE_INPUT);

    const insertCall = client.query.mock.calls.find((args) =>
      /INSERT INTO users/i.test(args[0] as string),
    );
    expect(insertCall).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: insertCall ist durch expect().toBeDefined() gesichert
    const sql = insertCall![0] as string;
    expect(sql).toMatch(/pgp_sym_encrypt/i);
    // biome-ignore lint/style/noNonNullAssertion: insertCall ist durch expect().toBeDefined() gesichert
    const params = insertCall![1] as string[];
    // $6 muss der Verschlüsselungs-Key sein
    expect(params[5]).toBe('test-key-abc-123');
  });

  it('nutzt empty BYTEA im INSERT wenn PP_PGCRYPTO_KEY leer (Dev/Test)', async () => {
    (config as { PP_PGCRYPTO_KEY: string }).PP_PGCRYPTO_KEY = '';

    const { pool, client } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, BASE_INPUT);

    const insertCall = client.query.mock.calls.find((args) =>
      /INSERT INTO users/i.test(args[0] as string),
    );
    expect(insertCall).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: insertCall ist durch expect().toBeDefined() gesichert
    const sql = insertCall![0] as string;
    expect(sql).toMatch(/''::bytea/i);
    expect(sql).not.toMatch(/pgp_sym_encrypt/i);
  });
});

// ── 8. N3: Audit-Log-Parameter (eventType + email_hash + has_discord_username) ─

describe('runBootstrap — N3 Audit-Log-Parameter', () => {
  it('schreibt korrekten eventType + Metadata-Felder', async () => {
    const { pool } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, BASE_INPUT);

    // logAuthEvent ruft pool.query('SELECT insert_auth_audit_log(...)') auf
    const auditCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find((args) =>
      /insert_auth_audit_log/i.test(args[0] as string),
    );
    expect(auditCall).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: auditCall ist durch expect().toBeDefined() gesichert
    const params = auditCall![1] as unknown[];
    // Reihenfolge laut insert_auth_audit_log($1::uuid, $2::text, $3::text, $4::text, $5::jsonb):
    //   $1 = userId, $2 = eventType, $3 = ipAddress, $4 = userAgent, $5 = metadata (JSON-String)
    expect(params[0]).toBe('new-user-uuid-001'); // userId
    expect(params[1]).toBe('bootstrap_admin_created'); // eventType
    expect(params[2]).toBeNull(); // ipAddress (CLI hat keine IP)
    expect(params[3]).toBe('bootstrap-admin-cli'); // userAgent

    // Metadata als JSON-String prüfen
    const metadataStr = params[4] as string;
    const metadata = JSON.parse(metadataStr);
    expect(metadata.role).toBe('geschaeftsfuehrer');
    expect(metadata.has_discord_username).toBe(true);
    expect(metadata.display_name).toBe('Steve Test');
    // email_hash muss 16-Hex (SHA256-Prefix) sein — KEIN Klartext-Email
    expect(metadata.email_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(metadata.email_hash).not.toContain('@');
    expect(metadataStr).not.toContain(BASE_INPUT.emergencyEmail);
  });

  it('setzt has_discord_username=false wenn discordUsername null', async () => {
    const { pool } = makePool({ userCount: 0, emailExists: false });

    await runBootstrap(pool as never, { ...BASE_INPUT, discordUsername: null });

    const auditCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find((args) =>
      /insert_auth_audit_log/i.test(args[0] as string),
    );
    // biome-ignore lint/style/noNonNullAssertion: auditCall ist durch expect-find gesichert
    const params = auditCall![1] as unknown[];
    const metadata = JSON.parse(params[4] as string);
    expect(metadata.has_discord_username).toBe(false);
  });
});
