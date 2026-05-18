/**
 * T003 — Bootstrap-Admin-Skript für den ersten Geschäftsführer
 *
 * Löst das Henne-Ei-Problem: ohne User in der DB kann sich keiner anmelden.
 * Dieses Skript legt den ersten `geschaeftsfuehrer`-Account direkt in die DB.
 *
 * Aufruf:
 *   npm run bootstrap-admin           # Nur wenn users-Tabelle leer ist
 *   npm run bootstrap-admin -- --force # Trotzdem ausführen
 *
 * Prompts (interaktiv):
 *   - Discord-Username (optional — fürs Zuordnen bei erstem Discord-Login)
 *   - Display-Name
 *   - Notfall-Email (CITEXT — case-insensitive, eindeutig)
 *   - Notfall-Passwort (mind. 16 Zeichen, mind. 1 Groß-, 1 Klein-, 1 Zahl, 1 Sonderzeichen)
 *
 * Output:
 *   - TOTP-Secret als QR-Code im Terminal + otpauth-URL für manuelle Eingabe
 *   - 10 einmalig verwendbare Backup-Codes (Argon2id-gehasht in DB)
 *
 * Spec: M14_User_Verwaltung_Auth.md §3.4 (Bootstrapping)
 *
 * SECURITY:
 *   - Klartext-Passwort wird NIE geloggt oder gespeichert (nur Argon2id-Hash)
 *   - Backup-Codes werden EINMAL im Terminal angezeigt — danach nur Hashes in DB
 *   - TOTP-Secret wird in DB gespeichert (Base32) — für Notfall-Recovery via DB-Dump
 */

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import * as argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import { Pool } from 'pg';
import qrcode from 'qrcode-terminal';
import { config } from '../src/core/config';
import {
  BACKUP_CODE_COUNT,
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
  generateBackupCode,
  validatePassword,
} from '../src/modules/m14-auth/bootstrap-helpers';

// ── Prompt-Helfer ───────────────────────────────────────────────────────────

async function prompt(question: string, allowEmpty = false): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim();
    if (!answer && !allowEmpty) {
      console.error('  ✗ Pflichteingabe — Skript abgebrochen.');
      process.exit(2);
    }
    return answer;
  } finally {
    rl.close();
  }
}

/**
 * Liest Passwort ohne Echo auf das Terminal.
 * Hinweis: Nicht 100% sicher gegen Shoulder-Surfing (TTY-Buffer), aber gut genug für Bootstrap-Setup.
 */
async function promptSilent(question: string): Promise<string> {
  process.stdout.write(question);
  const rl = createInterface({ input, output, terminal: true });
  // biome-ignore lint/suspicious/noExplicitAny: readline-internal API ohne Type
  const rlAny = rl as any;
  // Echo deaktivieren via Override des _writeToOutput
  rlAny._writeToOutput = (str: string) => {
    if (str === '\r\n' || str === '\n') {
      rlAny.output.write(str);
    } else {
      rlAny.output.write('*');
    }
  };
  try {
    const answer = await rl.question('');
    if (!answer.trim()) {
      console.error('\n  ✗ Pflichteingabe — Skript abgebrochen.');
      process.exit(2);
    }
    return answer;
  } finally {
    rl.close();
  }
}

// ── Argon2id-Optionen (synchron mit DUMMY_HASH in emergency-login.service.ts) ─

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: config.ARGON2_MEMORY_COST,
  timeCost: config.ARGON2_TIME_COST,
  parallelism: config.ARGON2_PARALLELISM,
} as const;

// ── Haupt-Flow ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const forceFlag = process.argv.includes('--force');

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║ ProzessPilot Bootstrap-Admin — erster Geschäftsführer-Account    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const pool = new Pool({ connectionString: config.DATABASE_URL });

  // ── 1. Idempotenz-Check ──────────────────────────────────────────────────
  const countResult = await pool.query('SELECT count(*)::int AS n FROM users');
  const userCount = countResult.rows[0].n as number;

  if (userCount > 0 && !forceFlag) {
    console.error(`✗ Es existieren bereits ${userCount} User in der DB.`);
    console.error(
      '  Nutze --force um trotzdem fortzufahren (z.B. zweiten Geschäftsführer anlegen).',
    );
    await pool.end();
    process.exit(1);
  }

  if (forceFlag && userCount > 0) {
    console.log(`ℹ ${userCount} User bereits vorhanden — --force aktiv, lege zusätzlich an.\n`);
  }

  // ── 2. Interaktive Eingaben ──────────────────────────────────────────────
  const discordUsername = await prompt('Discord-Username (optional, z.B. stevebernhardt): ', true);
  const displayName = await prompt('Display-Name (z.B. Steve Bernhardt): ');
  const emergencyEmail = await prompt('Notfall-Email: ');

  if (!EMAIL_REGEX.test(emergencyEmail)) {
    console.error('  ✗ Ungültiges Email-Format.');
    await pool.end();
    process.exit(2);
  }

  // Email-Duplikat-Check (CITEXT in DB → case-insensitive)
  const existingEmail = await pool.query('SELECT id FROM users WHERE emergency_email = $1', [
    emergencyEmail,
  ]);
  if (existingEmail.rows.length > 0) {
    console.error(`  ✗ Email "${emergencyEmail}" ist bereits einem User zugeordnet.`);
    await pool.end();
    process.exit(2);
  }

  const password = await promptSilent(
    `Notfall-Passwort (min. ${MIN_PASSWORD_LENGTH} Zeichen, mit Groß-/Klein-/Zahl/Sonderzeichen): `,
  );
  const validation = validatePassword(password);
  if (!validation.ok) {
    console.error(`  ✗ Passwort zu schwach: ${validation.reason}`);
    await pool.end();
    process.exit(2);
  }

  const passwordConfirm = await promptSilent('Passwort wiederholen: ');
  if (password !== passwordConfirm) {
    console.error('  ✗ Passwörter stimmen nicht überein.');
    await pool.end();
    process.exit(2);
  }

  console.log('\n→ Generiere TOTP-Secret + Backup-Codes…');

  // ── 3. TOTP-Secret + URL generieren ──────────────────────────────────────
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

  // ── 4. Backup-Codes generieren + hashen ──────────────────────────────────
  const plainBackupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashedBackupCodes = await Promise.all(
    plainBackupCodes.map(async (code) => ({
      hash: await argon2.hash(code, ARGON2_OPTIONS),
      used: false,
    })),
  );

  // ── 5. Passwort hashen ──────────────────────────────────────────────────
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

  // ── 6. INSERT ───────────────────────────────────────────────────────────
  const insertResult = await pool.query(
    `INSERT INTO users (
       discord_username, display_name, role,
       emergency_email, emergency_password_hash, emergency_totp_secret, emergency_backup_codes,
       active
     ) VALUES ($1, $2, 'geschaeftsfuehrer', $3, $4, $5, $6::jsonb, true)
     RETURNING id, created_at`,
    [
      discordUsername || null,
      displayName,
      emergencyEmail,
      passwordHash,
      totpSecret.base32,
      JSON.stringify(hashedBackupCodes),
    ],
  );

  const newUserId = insertResult.rows[0].id as string;

  // ── 7. Output: QR-Code + Backup-Codes ────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║ ✓ Geschäftsführer-Account angelegt                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`User-ID:           ${newUserId}`);
  console.log(`Display-Name:      ${displayName}`);
  console.log(`Notfall-Email:     ${emergencyEmail}`);
  console.log(`Discord-Username:  ${discordUsername || '(nicht gesetzt)'}`);
  console.log('Rolle:             geschaeftsfuehrer');

  console.log('\n── TOTP-Setup ─────────────────────────────────────────────────────');
  console.log('Scanne diesen QR-Code mit deiner Authenticator-App (z.B. 1Password, Authy):\n');
  qrcode.generate(totpUrl, { small: true });
  console.log('\nFalls QR nicht funktioniert — manuell eingeben:');
  console.log(`  Secret (Base32): ${totpSecret.base32}`);
  console.log(`  URL:             ${totpUrl}\n`);

  console.log('── Backup-Codes ───────────────────────────────────────────────────');
  console.log('Diese Codes werden NUR JETZT angezeigt — speichere sie in 1Password!');
  console.log('Jeder Code ist einmal verwendbar als Ersatz für den TOTP-Code.\n');
  plainBackupCodes.forEach((code, i) => {
    console.log(`  ${(i + 1).toString().padStart(2, ' ')}.  ${code}`);
  });

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║ ⚠ NÄCHSTE SCHRITTE                                               ║');
  console.log('║   1. TOTP-Secret + Backup-Codes JETZT in 1Password speichern     ║');
  console.log('║   2. Notfall-Login testen:                                       ║');
  console.log('║      POST /api/v1/auth/notfall/login                             ║');
  console.log('║      { email, password, totp_code }                              ║');
  console.log('║   3. Discord-OAuth-Account dann eigenständig connecten           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

main().catch((err) => {
  console.error('\n✗ Bootstrap fehlgeschlagen:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
