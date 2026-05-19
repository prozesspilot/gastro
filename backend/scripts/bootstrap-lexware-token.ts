/**
 * T009-Review-Fix #5 — Bootstrap-Script fuer Lexware-Office-API-Token.
 *
 * Sicherheits-Issue der ersten T009-Variante: Setup-Befehl in MANUELLE_AUFGABEN
 * nutzte `node -e "..."` mit inline-Token → Token landet in Shell-History,
 * docker-exec-Audit-Log und ggf. syslog.
 *
 * Dieses Skript liest den Token via readline (echo-muted, kein History-Leak)
 * und schreibt ihn pgcrypto-verschluesselt via upsertBookingCredential.
 *
 * Aufruf:
 *   npm run bootstrap-lexware-token
 *   # ODER in Production-Container:
 *   docker compose exec -T backend node dist/scripts/bootstrap-lexware-token.js
 *
 * Prompts:
 *   1. Tenant-UUID
 *   2. Display-Name (z.B. "Steuerkanzlei Mustermann")
 *   3. Lexware-API-Token (muted, echo unterdrueckt)
 *   4. actor_user_id (UUID des Mitarbeiters, der das Token einrichtet)
 *
 * Voraussetzungen:
 *   - PP_PGCRYPTO_KEY in ENV gesetzt
 *   - Migration 100_booking_credentials.sql ist gelaufen
 *   - Tenant existiert
 */

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Pool } from 'pg';
import { config } from '../src/core/config';
import { upsertBookingCredential } from '../src/modules/m05-lexoffice/services/booking-credentials.repository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Prompt-Helfer ──────────────────────────────────────────────────────────

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

async function promptSilent(question: string): Promise<string> {
  process.stdout.write(question);
  const rl = createInterface({ input, output, terminal: true });
  // biome-ignore lint/suspicious/noExplicitAny: readline-internal API ohne Type
  const rlAny = rl as any;
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

// ── Hauptfunktion ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!config.PP_PGCRYPTO_KEY) {
    console.error(
      '  ✗ PP_PGCRYPTO_KEY ist leer — Token kann nicht verschluesselt gespeichert werden.',
    );
    console.error('    Setze PP_PGCRYPTO_KEY in .env vor dem Aufruf.');
    process.exit(3);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ProzessPilot — Lexware-Office Token Setup (T009)               ║');
  console.log('║  Speichert API-Token pgcrypto-verschluesselt pro Tenant         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();

  const tenantId = await prompt('Tenant-UUID: ');
  if (!UUID_RE.test(tenantId)) {
    console.error(`  ✗ "${tenantId}" ist keine gueltige UUID.`);
    process.exit(2);
  }

  const actorUserId = await prompt('Mitarbeiter-User-UUID (wer setzt den Token?): ');
  if (!UUID_RE.test(actorUserId)) {
    console.error(`  ✗ "${actorUserId}" ist keine gueltige UUID.`);
    process.exit(2);
  }

  const displayName = await prompt(
    'Display-Name (z.B. "Steuerkanzlei Mustermann", optional): ',
    true,
  );

  // Token mit echo-mute — kein History-Leak
  const token = await promptSilent('Lexware-Office-API-Token (Eingabe verborgen): ');

  if (token.length < 10) {
    console.error('  ✗ Token zu kurz (< 10 Zeichen) — vermutlich falsch kopiert.');
    process.exit(2);
  }

  console.log();
  console.log('Schreibe Token in booking_credentials...');

  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    const credential = await upsertBookingCredential(pool, {
      tenantId,
      provider: 'lexware_office',
      apiTokenPlaintext: token,
      displayName: displayName || null,
      actorUserId,
    });
    console.log(`  ✓ Token gespeichert (credential id: ${credential.id}).`);
    console.log(`  ✓ Audit-Log-Event 'booking_credentials.upserted' geschrieben.`);
    console.log();
    console.log('Smoke-Test fuer einen Beleg-Push:');
    console.log(
      '  curl -X POST https://api.prozesspilot.net/api/v1/belege/<beleg-id>/exports/lexware \\',
    );
    console.log('       -b pp_auth=<mitarbeiter-jwt> \\');
    console.log(`       -H "X-PP-Tenant-ID: ${tenantId}"`);
  } catch (err) {
    console.error('  ✗ Fehler beim Speichern:', err instanceof Error ? err.message : String(err));
    process.exit(4);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
