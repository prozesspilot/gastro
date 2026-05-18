/**
 * M14 — Bootstrap-Service: erster Geschäftsführer-Account anlegen
 *
 * Extrahiert aus scripts/bootstrap-admin.ts für Testbarkeit.
 * Enthält den reinen DB-Logik-Teil ohne CLI-Prompts und console.log.
 *
 * Spec: M14_User_Verwaltung_Auth.md §3.4 (Bootstrapping)
 *
 * Wichtige Design-Entscheidungen:
 *   - Prompts finden VOR der Transaktion statt (CLI-Eingabe blockiert keine Tx)
 *   - Innerhalb der Tx: LOCK TABLE + re-check count + email-dup-check + INSERT
 *   - TOTP-Secret wird mit pgp_sym_encrypt verschlüsselt (Migration 021)
 *   - Audit-Log wird nach erfolgreichem INSERT geschrieben
 */

import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import type { Pool } from 'pg';
import { config } from '../../core/config';
import { BACKUP_CODE_COUNT, generateBackupCode } from './bootstrap-helpers';
import { logAuthEvent } from './users.repository';

// ── Argon2id-Optionen (synchron mit DUMMY_HASH in emergency-login.service.ts) ─

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: config.ARGON2_MEMORY_COST,
  timeCost: config.ARGON2_TIME_COST,
  parallelism: config.ARGON2_PARALLELISM,
} as const;

// ── Öffentliche Interfaces ─────────────────────────────────────────────────

export interface BootstrapInput {
  discordUsername: string | null;
  displayName: string;
  emergencyEmail: string;
  /** Klartext-Passwort — wird intern mit Argon2id gehasht, NIE gespeichert */
  password: string;
  /** Wenn true: auch anlegen wenn bereits User in der DB existieren */
  force?: boolean;
}

export interface BootstrapResult {
  userId: string;
  createdAt: Date;
  totpSecret: string; // Base32
  totpUrl: string; // otpauth://totp/...
  backupCodes: string[]; // Klartext — EINMALIGE Anzeige, danach nur Hashes in DB
}

// ── Haupt-Funktion ─────────────────────────────────────────────────────────

/**
 * Legt den ersten Geschäftsführer-Account an.
 *
 * Ablauf:
 *   1. TOTP-Secret + Backup-Codes + Passwort-Hash generieren (außerhalb der Tx)
 *   2. Transaktion öffnen + LOCK TABLE users (Race-Condition-Schutz)
 *   3. Idempotenz-Check (count) + Email-Dup-Check innerhalb der Tx
 *   4. INSERT mit pgp_sym_encrypt für das TOTP-Secret
 *   5. COMMIT + Audit-Log
 *
 * Wirft einen Error wenn:
 *   - users-Tabelle nicht leer ist und force=false
 *   - Email bereits existiert
 */
export async function runBootstrap(pool: Pool, input: BootstrapInput): Promise<BootstrapResult> {
  const { discordUsername, displayName, emergencyEmail, password, force } = input;

  // ── 0. Production-Guard: PP_PGCRYPTO_KEY ist in Production Pflicht ─────────
  // DECISION: Wenn der Key in Production fehlt, würde TOTP unverschlüsselt gespeichert
  // werden — der Account ist faktisch tot (Notfall-Login schlägt mit no_emergency_setup
  // fehl). Hard-Stop verhindert das "stille" Anlegen eines unbrauchbaren Admins.
  if (config.NODE_ENV === 'production' && !config.PP_PGCRYPTO_KEY) {
    throw new Error(
      'PP_PGCRYPTO_KEY ist in Production Pflicht — TOTP-Secret würde unverschlüsselt gespeichert. Bootstrap abgebrochen.',
    );
  }

  // ── 1. Krypto-Material generieren (außerhalb Tx — rechenintensiv) ──────────
  const totpSecret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'ProzessPilot',
    label: emergencyEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: totpSecret,
  });
  const totpUrl = totp.toString();

  const plainBackupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashedBackupCodes = await Promise.all(
    plainBackupCodes.map(async (code) => ({
      hash: await argon2.hash(code, ARGON2_OPTIONS),
      used: false,
    })),
  );
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

  // ── 2. Transaktion + Table-Lock (Race-Condition-Schutz) ───────────────────
  // DECISION: LOCK TABLE users IN EXCLUSIVE MODE verhindert parallele Bootstrap-
  // Aufrufe, die beide den count-Check bestehen könnten. Bei CLI-Nutzung akzeptabel.
  const client = await pool.connect();
  let newUserId: string;
  let newCreatedAt: Date;

  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');

    // ── 3. Idempotenz-Check + Email-Dup-Check (innerhalb der Tx) ──────────────
    const countResult = await client.query('SELECT count(*)::int AS n FROM users');
    const userCount = countResult.rows[0].n as number;

    if (userCount > 0 && !force) {
      throw new Error(
        `Es existieren bereits ${userCount} User in der DB. Nutze force=true um trotzdem fortzufahren (z.B. zweiten Geschäftsführer anlegen).`,
      );
    }

    const existingEmail = await client.query('SELECT id FROM users WHERE emergency_email = $1', [
      emergencyEmail,
    ]);
    if (existingEmail.rows.length > 0) {
      throw new Error(`Email "${emergencyEmail}" ist bereits einem User zugeordnet.`);
    }

    // ── 4. INSERT mit pgp_sym_encrypt für TOTP-Secret ─────────────────────────
    // DECISION: Wenn PP_PGCRYPTO_KEY leer ist (Dev/Test), wird empty BYTEA gespeichert.
    // Konsistent mit Discord-Token-Pattern in users.repository.ts.
    let insertResult: { rows: Array<{ id: string; created_at: Date }> };

    if (config.PP_PGCRYPTO_KEY) {
      insertResult = await client.query(
        `INSERT INTO users (
           discord_username, display_name, role,
           emergency_email, emergency_password_hash,
           emergency_totp_secret, emergency_backup_codes,
           active
         ) VALUES ($1, $2, 'geschaeftsfuehrer', $3, $4,
           pgp_sym_encrypt($5::text, $6::text),
           $7::jsonb, true)
         RETURNING id, created_at`,
        [
          discordUsername || null, // $1
          displayName, // $2
          emergencyEmail, // $3
          passwordHash, // $4
          totpSecret.base32, // $5 — Klartext-Secret für pgp_sym_encrypt
          config.PP_PGCRYPTO_KEY, // $6 — Verschlüsselungs-Key
          JSON.stringify(hashedBackupCodes), // $7
        ],
      );
    } else {
      // Dev/Test ohne Key: leeres BYTEA — TOTP funktioniert nicht, aber Bootstrap läuft durch
      insertResult = await client.query(
        `INSERT INTO users (
           discord_username, display_name, role,
           emergency_email, emergency_password_hash,
           emergency_totp_secret, emergency_backup_codes,
           active
         ) VALUES ($1, $2, 'geschaeftsfuehrer', $3, $4,
           ''::bytea,
           $5::jsonb, true)
         RETURNING id, created_at`,
        [
          discordUsername || null, // $1
          displayName, // $2
          emergencyEmail, // $3
          passwordHash, // $4
          JSON.stringify(hashedBackupCodes), // $5
        ],
      );
    }

    newUserId = insertResult.rows[0].id;
    newCreatedAt = insertResult.rows[0].created_at;

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // ── 5. Audit-Log (nach COMMIT — außerhalb der Tx, fire-and-forget) ─────────
  // DECISION: email_hash (erste 16 Hex-Zeichen von SHA256) statt Klartext-Email
  // im Audit-Log — kein PII in den Logs.
  await logAuthEvent(pool, {
    userId: newUserId,
    eventType: 'bootstrap_admin_created',
    ipAddress: null,
    userAgent: 'bootstrap-admin-cli',
    metadata: {
      display_name: displayName,
      has_discord_username: discordUsername !== null,
      role: 'geschaeftsfuehrer',
      email_hash: createHash('sha256')
        .update(emergencyEmail.toLowerCase())
        .digest('hex')
        .substring(0, 16),
    },
  });

  return {
    userId: newUserId,
    createdAt: newCreatedAt,
    totpSecret: totpSecret.base32,
    totpUrl,
    backupCodes: plainBackupCodes,
  };
}
