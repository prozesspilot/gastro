/**
 * T003 — Pure Helper-Funktionen für Bootstrap-Admin
 *
 * Ausgelagert für Testbarkeit ohne DB/Readline-Mocks.
 */

import { randomBytes } from 'node:crypto';

// ── Validierung ────────────────────────────────────────────────────────────

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 16;

export interface PasswordValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Prüft Passwort-Stärke gemäß M14-Spec §5.1.
 * Mindestens 16 Zeichen + 1 Groß + 1 Klein + 1 Ziffer + 1 Sonderzeichen.
 *
 * M14 §5.1: strikter als core/auth/password.ts (16 statt 12 Zeichen) wegen
 * Notfall-Login-Sensitivität — der Notfall-Login ist der einzige Non-Discord-Zugang
 * zum System und muss daher besonders hohe Passwort-Anforderungen stellen.
 */
export function validatePassword(pw: string): PasswordValidation {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen erforderlich (aktuell: ${pw.length}).`,
    };
  }
  if (!/[A-Z]/.test(pw)) return { ok: false, reason: 'Mindestens einen Großbuchstaben enthalten.' };
  if (!/[a-z]/.test(pw)) {
    return { ok: false, reason: 'Mindestens einen Kleinbuchstaben enthalten.' };
  }
  if (!/\d/.test(pw)) return { ok: false, reason: 'Mindestens eine Ziffer enthalten.' };
  if (!/[^A-Za-z0-9]/.test(pw)) {
    return { ok: false, reason: 'Mindestens ein Sonderzeichen enthalten.' };
  }
  return { ok: true };
}

// ── Backup-Code-Generierung ─────────────────────────────────────────────────

// Alphabet ohne Verwechsler (kein 0/O, 1/I, etc.) — 32 Zeichen, gut lesbar
export const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const BACKUP_CODE_LENGTH = 12;
export const BACKUP_CODE_COUNT = 10;

/**
 * Generiert einen kryptografisch sicheren Backup-Code.
 * 12 Zeichen aus 32-stelligem Alphabet → ~60 Bit Entropie pro Code.
 */
export function generateBackupCode(): string {
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    code += BACKUP_CODE_ALPHABET[bytes[i] % BACKUP_CODE_ALPHABET.length];
  }
  return code;
}
