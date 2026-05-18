/**
 * T003 — Tests für Bootstrap-Helper-Funktionen
 *
 * Testet:
 *   1. validatePassword — Stärke-Prüfung (16+ Zeichen, Großbuch, Kleinbuch, Zahl, Sonderzeichen)
 *   2. generateBackupCode — Format (12 Zeichen, Alphabet ohne Verwechsler)
 *   3. Backup-Codes-Eindeutigkeit (statistisch)
 */

import { describe, expect, it } from 'vitest';
import {
  BACKUP_CODE_ALPHABET,
  BACKUP_CODE_LENGTH,
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
  generateBackupCode,
  validatePassword,
} from '../../modules/m14-auth/bootstrap-helpers';

// ── validatePassword ──────────────────────────────────────────────────────────

describe('validatePassword', () => {
  it('lehnt zu kurzes Passwort ab', () => {
    const result = validatePassword('Sicher!123');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(MIN_PASSWORD_LENGTH.toString());
  });

  it('lehnt Passwort ohne Großbuchstaben ab', () => {
    const result = validatePassword('alleskleinklein!1234567');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Großbuchstaben');
  });

  it('lehnt Passwort ohne Kleinbuchstaben ab', () => {
    const result = validatePassword('ALLESGROSS!1234567');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Kleinbuchstaben');
  });

  it('lehnt Passwort ohne Ziffer ab', () => {
    const result = validatePassword('NurBuchstaben!Hier');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Ziffer');
  });

  it('lehnt Passwort ohne Sonderzeichen ab', () => {
    const result = validatePassword('NurAlphaNumerisch123');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Sonderzeichen');
  });

  it('akzeptiert valides starkes Passwort', () => {
    const result = validatePassword('Sicheres!Passwort123');
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('akzeptiert Passwort mit verschiedenen Sonderzeichen', () => {
    const cases = ['Sicher@Pass123word!', 'Sicher#Pass123word!', 'Sicher$Pass123word!'];
    for (const pw of cases) {
      expect(validatePassword(pw).ok).toBe(true);
    }
  });
});

// ── generateBackupCode ────────────────────────────────────────────────────────

describe('generateBackupCode', () => {
  it('generiert Code mit korrekter Länge', () => {
    const code = generateBackupCode();
    expect(code).toHaveLength(BACKUP_CODE_LENGTH);
  });

  it('nutzt nur Zeichen aus dem definierten Alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateBackupCode();
      for (const char of code) {
        expect(BACKUP_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('vermeidet Verwechsler-Zeichen (0, O, 1, I)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateBackupCode();
      expect(code).not.toMatch(/[0O1I]/);
    }
  });

  it('generiert eindeutige Codes (statistisch)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateBackupCode());
    }
    // Bei ~60 Bit Entropie ist eine Kollision in 100 Codes praktisch unmöglich
    expect(codes.size).toBe(100);
  });
});

// ── EMAIL_REGEX ───────────────────────────────────────────────────────────────

describe('EMAIL_REGEX', () => {
  it('akzeptiert valide Email-Adressen', () => {
    const validEmails = ['steve@prozesspilot.net', 'andreas@example.de', 'a@b.co'];
    for (const email of validEmails) {
      expect(EMAIL_REGEX.test(email)).toBe(true);
    }
  });

  it('lehnt invalide Email-Adressen ab', () => {
    const invalidEmails = ['no-at-sign', 'spaces in@email.de', '@nodomain.de', 'noTld@example'];
    for (const email of invalidEmails) {
      expect(EMAIL_REGEX.test(email)).toBe(false);
    }
  });
});
