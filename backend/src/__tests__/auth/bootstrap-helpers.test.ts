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

  it('akzeptiert Passwort mit exakt 16 Zeichen (alle Anforderungen erfüllt)', () => {
    // M14 §5.1: 16 Zeichen = Minimum, muss ok:true zurückgeben
    // 'A1!aaaaaaaaaaaaa' = 1 Groß (A) + 1 Zahl (1) + 1 Sonderzeichen (!) + 13 Klein = 16 Zeichen
    const result = validatePassword('A1!aaaaaaaaaaaaa');
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('lehnt Passwort mit exakt 15 Zeichen ab', () => {
    // 'A1!aaaaaaaaaaaa' = 15 Zeichen — gerade unter dem Minimum
    const result = validatePassword('A1!aaaaaaaaaaaa');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('16');
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

  it('generiert eindeutige Codes (statistisch, n=100)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateBackupCode());
    }
    // Bei ~60 Bit Entropie ist eine Kollision in 100 Codes praktisch unmöglich
    expect(codes.size).toBe(100);
  });

  it('generiert eindeutige Codes auch bei n=10000', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      codes.add(generateBackupCode());
    }
    // ~60 Bit Entropie: Geburtstags-Paradoxon erst bei ~2^30 Codes relevant
    // 10000 Codes sollten mit nahezu 100% Wahrscheinlichkeit eindeutig sein
    expect(codes.size).toBe(10000);
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
