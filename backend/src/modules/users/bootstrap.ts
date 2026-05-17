/**
 * M14 — Bootstrap-CLI: erster super_admin
 *
 * Aufruf:  npm run bootstrap:super-admin
 *
 * - Liest Email + Passwort entweder interaktiv (Prompt) oder aus ENV
 *   INITIAL_SUPER_ADMIN_EMAIL + INITIAL_SUPER_ADMIN_PASSWORD (CI-Fall).
 * - Idempotent: wenn bereits ein aktiver super_admin existiert, abbrechen.
 * - Schreibt direkt in die DB (kein Login-Flow notwendig).
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Pool } from 'pg';
import { hashPassword, validatePasswordStrength } from '../../core/auth/password';
import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { newUserId, UserRepository } from './services/user.repository';

async function promptIfMissing(envVal: string, prompt: string, silent = false): Promise<string> {
  if (envVal) return envVal;
  const rl = createInterface({ input, output });
  try {
    if (silent) {
      // Einfaches "silent" — nicht perfekt, aber für Bootstrap-CLI ausreichend
      process.stdout.write(prompt);
      const line = await rl.question('');
      process.stdout.write('\n');
      return line;
    }
    return rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const users = new UserRepository(pool);

  const existing = await users.countSuperAdmins();
  if (existing > 0) {
    logger.info({ existing }, 'Bereits ein aktiver super_admin vorhanden — Bootstrap übersprungen.');
    await pool.end();
    return;
  }

  const email = await promptIfMissing(config.INITIAL_SUPER_ADMIN_EMAIL, 'super_admin Email: ');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    logger.error('Ungültige Email');
    process.exit(2);
  }

  const password = await promptIfMissing(
    config.INITIAL_SUPER_ADMIN_PASSWORD,
    'super_admin Passwort (mind. 12 Zeichen): ',
    true,
  );
  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    logger.error({ reason: strength.reason }, 'Passwort zu schwach');
    process.exit(2);
  }

  const passwordHash = await hashPassword(password);
  const created = await users.create({
    id: newUserId(),
    tenantId: null,
    email,
    displayName: 'Super Admin',
    passwordHash,
    passwordMustChange: true, // Spec §6.4: Owner muss bei Erst-Login Passwort wechseln
    permissions: ['*'],
    preset: 'super_admin',
    createdBy: null,
  });

  logger.info(
    { user_id: created.id, email: created.email },
    '✓ Erster super_admin angelegt. Du kannst dich jetzt einloggen.',
  );
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Bootstrap fehlgeschlagen');
  process.exit(1);
});
