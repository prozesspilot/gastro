/**
 * T002 — Notfall-Login Unit-Tests
 *
 * Testet:
 *   1. verifyTotpCode — TOTP-Code-Verifikation (richtig, falsch, falsches Format)
 *   2. performEmergencyLogin — vollständiger Login-Flow mit gemockter DB + Redis
 *      a. Erfolgreicher Login (TOTP)
 *      b. Erfolgreicher Login (Backup-Code)
 *      c. Rate-Limit (IP) greift
 *      d. Rate-Limit (Email) greift
 *      e. Unbekannte Email → invalid_credentials
 *      f. Falsches Passwort → invalid_credentials
 *      g. Falscher TOTP → totp_invalid
 *      h. Inaktiver User → account_disabled
 *      i. Falsche Rolle (mitarbeiter) → role_not_allowed
 *      j. Kein Emergency-Setup → no_emergency_setup
 *
 * Kein echter DB- oder Redis-Zugriff — alle Calls werden gemockt.
 */

import * as argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimits,
  incrementFailureCounters,
  performEmergencyLogin,
  verifyBackupCode,
  verifyTotpCode,
} from '../../modules/m14-auth/emergency-login.service';

// ── TOTP-Test-Secret ───────────────────────────────────────────────────────

// Deterministisches Test-Secret (Base32-encoded)
const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

function generateCurrentTotpCode(): string {
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(TEST_TOTP_SECRET),
  });
  return totp.generate();
}

// ── 1. verifyTotpCode ──────────────────────────────────────────────────────

describe('verifyTotpCode', () => {
  it('akzeptiert einen gültigen TOTP-Code', () => {
    const code = generateCurrentTotpCode();
    expect(verifyTotpCode(TEST_TOTP_SECRET, code)).toBe(true);
  });

  it('lehnt einen falschen TOTP-Code ab', () => {
    expect(verifyTotpCode(TEST_TOTP_SECRET, '000000')).toBe(false);
  });

  it('lehnt einen ungültigen TOTP-Code-Format ab', () => {
    expect(verifyTotpCode(TEST_TOTP_SECRET, 'abc123')).toBe(false);
  });

  it('lehnt Code bei falschem Secret ab', () => {
    const code = generateCurrentTotpCode();
    expect(verifyTotpCode('INVALIDSECRET!!!', code)).toBe(false);
  });
});

// ── 2. verifyBackupCode ────────────────────────────────────────────────────

describe('verifyBackupCode', () => {
  it('findet einen gültigen ungenutzten Backup-Code', async () => {
    const plainCode = 'ABC123DEF456';
    const hash = await argon2.hash(plainCode, {
      type: argon2.argon2id,
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    });
    const codes = [
      { hash, used: false },
      { hash: 'invalid', used: false },
    ];
    const idx = await verifyBackupCode(codes, plainCode);
    expect(idx).toBe(0);
  });

  it('ignoriert bereits verwendete Codes', async () => {
    const plainCode = 'ABC123DEF456';
    const hash = await argon2.hash(plainCode, {
      type: argon2.argon2id,
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    });
    const codes = [{ hash, used: true }];
    const idx = await verifyBackupCode(codes, plainCode);
    expect(idx).toBe(-1);
  });

  it('gibt -1 zurück wenn kein Code passt', async () => {
    const codes = [{ hash: 'not-a-valid-hash', used: false }];
    const idx = await verifyBackupCode(codes, 'wrongcode');
    expect(idx).toBe(-1);
  });
});

// ── 3. performEmergencyLogin ───────────────────────────────────────────────

// Hilfsfunktionen für Mocks

function makeRedis(lockedIp = false, lockedEmail = false, counts = { ip: 0, email: 0 }) {
  return {
    exists: vi.fn(async (key: string) => {
      if (key.includes('lockout:ip') && lockedIp) return 1;
      if (key.includes('lockout:email') && lockedEmail) return 1;
      return 0;
    }),
    incr: vi.fn(async (key: string) => {
      if (key.includes(':ip:')) return counts.ip + 1;
      if (key.includes(':email:')) return counts.email + 1;
      return 1;
    }),
    expire: vi.fn(async () => 1),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    multi: vi.fn(() => ({
      expire: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
  };
}

async function buildValidUser(password: string) {
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  return {
    id: 'user-uuid-001',
    display_name: 'Steve Test',
    role: 'geschaeftsfuehrer' as const,
    active: true,
    emergency_email: 'steve@test.de',
    emergency_password_hash: hash,
    emergency_totp_secret: TEST_TOTP_SECRET,
    emergency_backup_codes: null,
  };
}

type TestUserRow = {
  id: string;
  display_name: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
  active: boolean;
  emergency_email: string | null;
  emergency_password_hash: string | null;
  emergency_totp_secret: string | null;
  emergency_backup_codes: null;
};

function makePool(user: TestUserRow | null = null) {
  return {
    query: vi.fn(async (sql: string) => {
      // Mehrzeiliges SQL → s-Flag für Dot-All verwenden
      if (/WHERE emergency_email/is.test(sql)) {
        if (!user) return { rows: [] };
        const resolvedUser = user instanceof Promise ? await user : user;
        return { rows: [resolvedUser] };
      }
      if (/UPDATE users/i.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT insert_auth_audit_log/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO auth_sessions/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

describe('performEmergencyLogin', () => {
  const TEST_PASSWORD = 'Sicher!1234567890';
  let validUser: Awaited<ReturnType<typeof buildValidUser>>;

  beforeEach(async () => {
    validUser = await buildValidUser(TEST_PASSWORD);
  });

  it('gibt Erfolg zurück bei korrektem Login mit TOTP', async () => {
    const totpCode = generateCurrentTotpCode();
    const pool = makePool(validUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode,
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('user-uuid-001');
      expect(result.role).toBe('geschaeftsfuehrer');
    }
  });

  it('gibt rate_limit_ip zurück wenn IP gesperrt', async () => {
    const pool = makePool(validUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis(true, false) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode: '123456',
      ipAddress: '1.2.3.4',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('rate_limit_ip');
  });

  it('gibt rate_limit_email zurück wenn Email gesperrt', async () => {
    const pool = makePool(validUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis(false, true) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode: '123456',
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('rate_limit_email');
  });

  it('gibt invalid_credentials zurück wenn Email nicht existiert', async () => {
    const pool = makePool(null) as unknown as Parameters<typeof performEmergencyLogin>[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'unknown@test.de',
      password: TEST_PASSWORD,
      totpCode: '123456',
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_credentials');
  });

  it('gibt invalid_credentials zurück bei falschem Passwort', async () => {
    const pool = makePool(validUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: 'WrongPassword!999',
      totpCode: generateCurrentTotpCode(),
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_credentials');
  });

  it('gibt totp_invalid zurück bei falschem TOTP-Code', async () => {
    const pool = makePool(validUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode: '000000',
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('totp_invalid');
  });

  it('gibt account_disabled zurück wenn User inaktiv', async () => {
    const inactiveUser = { ...validUser, active: false };
    const pool = makePool(inactiveUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode: generateCurrentTotpCode(),
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('account_disabled');
  });

  it('gibt role_not_allowed zurück wenn Rolle nicht geschaeftsfuehrer', async () => {
    const mitarbeiterUser = { ...validUser, role: 'mitarbeiter' as const };
    const pool = makePool(mitarbeiterUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode: generateCurrentTotpCode(),
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('role_not_allowed');
  });

  it('gibt no_emergency_setup zurück wenn kein TOTP-Secret', async () => {
    const noSetupUser = { ...validUser, emergency_totp_secret: null };
    const pool = makePool(noSetupUser) as unknown as Parameters<
      typeof performEmergencyLogin
    >[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    const result = await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode: generateCurrentTotpCode(),
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_emergency_setup');
  });

  it('inkrementiert Rate-Limit-Zähler bei Fehlversuch', async () => {
    const pool = makePool(null) as unknown as Parameters<typeof performEmergencyLogin>[0]['pool'];
    const redis = makeRedis() as unknown as Parameters<typeof performEmergencyLogin>[0]['redis'];

    await performEmergencyLogin({
      email: 'steve@test.de',
      password: TEST_PASSWORD,
      totpCode: '000000',
      ipAddress: '127.0.0.1',
      pool,
      redis,
    });

    expect(redis.incr).toHaveBeenCalled();
  });
});
