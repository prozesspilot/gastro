/**
 * M14 — Notfall-Login-Service
 *
 * Implementiert den Drei-Faktor-Check für den Notfall-Login:
 *   1. Email + User-Lookup (role=geschaeftsfuehrer, active=true)
 *   2. Passwort-Verify via Argon2id
 *   3. TOTP-Code-Verify (6-stellig, 30s-Fenster) ODER Backup-Code
 *
 * Spec: M14_User_Verwaltung_Auth.md §5.2
 *
 * Rate-Limiting erfolgt via Redis auf zwei Achsen:
 *   - IP-Achse: 5 Versuche / 15 Min (danach 1h-Sperre)
 *   - Email-Achse: 5 Versuche / 15 Min (danach 1h-Sperre)
 */

import * as argon2 from 'argon2';
import type { Redis } from 'ioredis';
import * as OTPAuth from 'otpauth';
import type { Pool } from 'pg';
import {
  type BackupCode,
  getUserByEmergencyEmail,
  markBackupCodeUsed,
  recordEmergencyLogin,
} from './users.repository';

// ── Konstanten ─────────────────────────────────────────────────────────────

const RATE_WINDOW_SECONDS = 15 * 60; // 15 Minuten
const RATE_MAX_ATTEMPTS = 5;
const RATE_LOCKOUT_SECONDS = 60 * 60; // 1 Stunde Sperre nach Überschreitung
const TOTP_WINDOW = 1; // ±1 Zeitfenster (= ±30 Sek)

// ── Fehler-Typen ───────────────────────────────────────────────────────────

export type EmergencyLoginError =
  | 'rate_limit_ip'
  | 'rate_limit_email'
  | 'invalid_credentials'
  | 'role_not_allowed'
  | 'account_disabled'
  | 'totp_invalid'
  | 'no_emergency_setup';

export interface EmergencyLoginResult {
  ok: true;
  userId: string;
  displayName: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
}

export interface EmergencyLoginFailure {
  ok: false;
  error: EmergencyLoginError;
}

export type EmergencyLoginOutcome = EmergencyLoginResult | EmergencyLoginFailure;

// ── Rate-Limit-Hilfsfunktionen ─────────────────────────────────────────────

function rateLimitKeyIp(ip: string): string {
  return `notfall:rl:ip:${ip}`;
}

function rateLimitKeyEmail(email: string): string {
  return `notfall:rl:email:${email.toLowerCase()}`;
}

function lockoutKeyIp(ip: string): string {
  return `notfall:lockout:ip:${ip}`;
}

function lockoutKeyEmail(email: string): string {
  return `notfall:lockout:email:${email.toLowerCase()}`;
}

/**
 * Prüft Rate-Limits für IP und Email.
 * Gibt den Fehlertyp zurück wenn gesperrt, sonst null.
 */
export async function checkRateLimits(
  redis: Redis,
  ip: string,
  email: string,
): Promise<'rate_limit_ip' | 'rate_limit_email' | null> {
  const [ipLock, emailLock] = await Promise.all([
    redis.exists(lockoutKeyIp(ip)),
    redis.exists(lockoutKeyEmail(email)),
  ]);

  if (ipLock) return 'rate_limit_ip';
  if (emailLock) return 'rate_limit_email';
  return null;
}

/**
 * Inkrementiert die Fehlversuch-Zähler für IP und Email.
 * Setzt Sperr-Keys wenn Limit überschritten.
 */
export async function incrementFailureCounters(
  redis: Redis,
  ip: string,
  email: string,
): Promise<void> {
  const ipKey = rateLimitKeyIp(ip);
  const emailKey = rateLimitKeyEmail(email);

  const [ipCount, emailCount] = await Promise.all([redis.incr(ipKey), redis.incr(emailKey)]);

  const multi = redis.multi();

  // Window setzen beim ersten Fehlversuch
  if (ipCount === 1) multi.expire(ipKey, RATE_WINDOW_SECONDS);
  if (emailCount === 1) multi.expire(emailKey, RATE_WINDOW_SECONDS);

  // Lockout setzen wenn Limit erreicht
  if (ipCount >= RATE_MAX_ATTEMPTS) {
    multi.set(lockoutKeyIp(ip), '1', 'EX', RATE_LOCKOUT_SECONDS);
  }
  if (emailCount >= RATE_MAX_ATTEMPTS) {
    multi.set(lockoutKeyEmail(email), '1', 'EX', RATE_LOCKOUT_SECONDS);
  }

  await multi.exec();
}

/**
 * Löscht die Rate-Limit-Zähler nach erfolgreichem Login.
 */
export async function clearRateLimitCounters(
  redis: Redis,
  ip: string,
  email: string,
): Promise<void> {
  await redis.del(rateLimitKeyIp(ip), rateLimitKeyEmail(email));
}

// ── TOTP-Verifikation ──────────────────────────────────────────────────────

/**
 * Prüft einen 6-stelligen TOTP-Code gegen ein Base32-Secret.
 * Fenster: ±1 Zeitschritt (= ±30 Sek).
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: TOTP_WINDOW });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Prüft einen Backup-Code gegen die gespeicherten Hashes.
 * Gibt den Index des gefundenen Codes zurück, oder -1 wenn nicht gefunden/ungültig.
 */
export async function verifyBackupCode(codes: BackupCode[], inputCode: string): Promise<number> {
  for (let i = 0; i < codes.length; i++) {
    const entry = codes[i];
    if (entry.used) continue;
    try {
      const match = await argon2.verify(entry.hash, inputCode);
      if (match) return i;
    } catch {
      // Korrupter Hash — überspringen
    }
  }
  return -1;
}

// ── Haupt-Service ──────────────────────────────────────────────────────────

export interface EmergencyLoginInput {
  email: string;
  password: string;
  totpCode?: string;
  backupCode?: string;
  ipAddress: string | null;
  pool: Pool;
  redis: Redis;
}

/**
 * Führt den vollständigen Notfall-Login-Check durch.
 *
 * Reihenfolge:
 *   1. Rate-Limit prüfen
 *   2. User-Lookup via emergency_email
 *   3. Rolle + Active-Check
 *   4. Passwort-Verify (Argon2id)
 *   5. TOTP oder Backup-Code prüfen
 *   6. Rate-Limit-Zähler zurücksetzen bei Erfolg
 *   7. last_login_at aktualisieren
 *
 * SECURITY: Fehler geben immer 'invalid_credentials' zurück für User-Lookup-Fehler,
 * damit kein User-Enumeration möglich ist (außer rate_limit_* und role_not_allowed).
 */
export async function performEmergencyLogin(
  input: EmergencyLoginInput,
): Promise<EmergencyLoginOutcome> {
  const { email, password, totpCode, backupCode, ipAddress, pool, redis } = input;
  const ip = ipAddress ?? '0.0.0.0';

  // ── 1. Rate-Limit prüfen ─────────────────────────────────────────────────
  const rateLimitError = await checkRateLimits(redis, ip, email);
  if (rateLimitError) {
    return { ok: false, error: rateLimitError };
  }

  // ── 2. User-Lookup ────────────────────────────────────────────────────────
  const user = await getUserByEmergencyEmail(pool, email);

  // SECURITY: Immer Argon2id-Dummy-Verify bei fehlendem User (Timing-Schutz)
  if (!user) {
    await incrementFailureCounters(redis, ip, email);
    // Dummy-Verify um Timing-Angriff zu verhindern
    await argon2.verify(DUMMY_HASH, password).catch(() => {});
    return { ok: false, error: 'invalid_credentials' };
  }

  // ── 3. Rolle + Active-Check ───────────────────────────────────────────────
  // SECURITY: DUMMY_HASH-Verify in allen Fehlerpfaden (Timing-Schutz / B1)
  if (!user.active) {
    await incrementFailureCounters(redis, ip, email);
    await argon2.verify(DUMMY_HASH, password).catch(() => {});
    return { ok: false, error: 'account_disabled' };
  }

  if (user.role !== 'geschaeftsfuehrer') {
    await incrementFailureCounters(redis, ip, email);
    await argon2.verify(DUMMY_HASH, password).catch(() => {});
    return { ok: false, error: 'role_not_allowed' };
  }

  // ── 4. Emergency-Setup-Check ──────────────────────────────────────────────
  if (!user.emergency_password_hash || !user.emergency_totp_secret) {
    // SECURITY: DUMMY_HASH-Verify + Counter-Increment (Timing-Schutz / B1 + M4)
    await argon2.verify(DUMMY_HASH, password).catch(() => {});
    await incrementFailureCounters(redis, ip, email);
    return { ok: false, error: 'no_emergency_setup' };
  }

  // ── 5. Passwort-Verify (Argon2id) ─────────────────────────────────────────
  let passwordOk: boolean;
  try {
    passwordOk = await argon2.verify(user.emergency_password_hash, password);
  } catch {
    passwordOk = false;
  }

  if (!passwordOk) {
    await incrementFailureCounters(redis, ip, email);
    return { ok: false, error: 'invalid_credentials' };
  }

  // ── 6. TOTP oder Backup-Code ──────────────────────────────────────────────
  let secondFactorOk = false;
  let usedBackupCodeIndex = -1;

  if (totpCode) {
    secondFactorOk = verifyTotpCode(user.emergency_totp_secret, totpCode);
  } else if (backupCode && user.emergency_backup_codes) {
    usedBackupCodeIndex = await verifyBackupCode(user.emergency_backup_codes, backupCode);
    secondFactorOk = usedBackupCodeIndex >= 0;
  }

  if (!secondFactorOk) {
    await incrementFailureCounters(redis, ip, email);
    return { ok: false, error: 'totp_invalid' };
  }

  // ── 7. Backup-Code verbrauchen ────────────────────────────────────────────
  // M1: Race-Condition-Check — markBackupCodeUsed gibt false wenn Code
  // zwischen verifyBackupCode und markBackupCodeUsed bereits verbraucht wurde
  if (usedBackupCodeIndex >= 0) {
    const marked = await markBackupCodeUsed(pool, user.id, usedBackupCodeIndex);
    if (!marked) {
      // Race-Condition: ein anderer Request hat diesen Code gleichzeitig verwendet
      await incrementFailureCounters(redis, ip, email);
      return { ok: false, error: 'totp_invalid' };
    }
  }

  // ── 8. Erfolg: Zähler zurücksetzen + last_login aktualisieren ─────────────
  await Promise.all([
    clearRateLimitCounters(redis, ip, email),
    recordEmergencyLogin(pool, user.id, ipAddress),
  ]);

  return {
    ok: true,
    userId: user.id,
    displayName: user.display_name,
    role: user.role,
  };
}

// Dummy-Hash für Timing-Schutz bei unbekannter Email.
// Verhindert, dass Angreifer via Response-Zeit auf User-Existenz schließen können.
//
// WICHTIG — Argon2-Parameter müssen synchron mit echten User-Hashes bleiben:
// Echte Hashes werden mit ARGON2_MEMORY_COST / ARGON2_TIME_COST aus config.ts
// erzeugt (Default: m=65536, t=3, p=1). Wenn diese Werte erhöht werden, muss
// dieser Hash neu generiert werden — sonst entsteht ein Timing-Side-Channel.
// Prüfen: `argon2.hash('dummy', { type: argon2.argon2id, memoryCost: X, ... })`
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$dGVzdHNhbHRmb3JkdW1teQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
