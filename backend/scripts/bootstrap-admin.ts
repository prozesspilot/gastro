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
 *   - TOTP-Secret wird verschlüsselt (pgp_sym_encrypt) in DB gespeichert (Migration 021)
 *
 * DESIGN: Prompts erfolgen ZUERST (außerhalb der DB-Transaktion), dann öffnet
 * runBootstrap() eine Tx mit LOCK TABLE users. Damit blockiert User-Eingabe keine
 * DB-Verbindungen.
 */

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Pool } from 'pg';
import qrcode from 'qrcode-terminal';
import { config } from '../src/core/config';
import {
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from '../src/modules/m14-auth/bootstrap-helpers';
import { runBootstrap } from '../src/modules/m14-auth/bootstrap.service';

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

// ── Haupt-Flow ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const forceFlag = process.argv.includes('--force');

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║ ProzessPilot Bootstrap-Admin — erster Geschäftsführer-Account    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── Warnung wenn PP_PGCRYPTO_KEY fehlt ──────────────────────────────────────
  if (!config.PP_PGCRYPTO_KEY) {
    console.warn(
      '⚠ PP_PGCRYPTO_KEY nicht gesetzt — TOTP-Secret wird NICHT verschlüsselt gespeichert.',
    );
    console.warn('  Nur OK in Dev/Test. In Production MUSS der Key gesetzt sein.\n');
  }

  const pool = new Pool({ connectionString: config.DATABASE_URL });

  // ── 1. Interaktive Eingaben (ZUERST — außerhalb der DB-Transaktion) ─────────
  // DESIGN: Prompts außerhalb der Tx, damit User-Eingabe keine DB-Verbindung blockiert.
  // Die eigentliche Tx (mit LOCK TABLE) öffnet runBootstrap() erst nach Eingabe aller Daten.
  const discordUsername = await prompt('Discord-Username (optional, z.B. stevebernhardt): ', true);
  const displayName = await prompt('Display-Name (z.B. Steve Bernhardt): ');
  const emergencyEmail = await prompt('Notfall-Email: ');

  if (!EMAIL_REGEX.test(emergencyEmail)) {
    console.error('  ✗ Ungültiges Email-Format.');
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

  console.log('\n→ Generiere TOTP-Secret + Backup-Codes, schreibe in DB…');

  // ── 2. Bootstrap ausführen (Tx + Lock + INSERT + Audit-Log) ─────────────────
  let result: Awaited<ReturnType<typeof runBootstrap>>;
  try {
    result = await runBootstrap(pool, {
      discordUsername: discordUsername || null,
      displayName,
      emergencyEmail,
      password,
      force: forceFlag,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Bootstrap fehlgeschlagen: ${message}`);
    await pool.end();
    process.exit(1);
  }

  // ── 3. Output: QR-Code + Backup-Codes ────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║ ✓ Geschäftsführer-Account angelegt                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`User-ID:           ${result.userId}`);
  console.log(`Display-Name:      ${displayName}`);
  console.log(`Notfall-Email:     ${emergencyEmail}`);
  console.log(`Discord-Username:  ${discordUsername || '(nicht gesetzt)'}`);
  console.log('Rolle:             geschaeftsfuehrer');

  console.log('\n── TOTP-Setup ─────────────────────────────────────────────────────');
  console.log('Scanne diesen QR-Code mit deiner Authenticator-App (z.B. 1Password, Authy):\n');
  qrcode.generate(result.totpUrl, { small: true });
  console.log('\nFalls QR nicht funktioniert — manuell eingeben:');
  console.log(`  Secret (Base32): ${result.totpSecret}`);
  console.log(`  URL:             ${result.totpUrl}\n`);

  console.log('── Backup-Codes ───────────────────────────────────────────────────');
  console.log('Diese Codes werden NUR JETZT angezeigt — speichere sie in 1Password!');
  console.log('Jeder Code ist einmal verwendbar als Ersatz für den TOTP-Code.\n');
  result.backupCodes.forEach((code, i) => {
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
