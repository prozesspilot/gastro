import { describe, expect, it } from 'vitest';
import { hashPassword, validatePasswordStrength, verifyPassword } from './password';

describe('password', () => {
  it('hash + verify Round-Trip', async () => {
    const hash = await hashPassword('MySecretPassword123!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword('MySecretPassword123!', hash)).toBe(true);
  });

  it('verify mit falschem Passwort schlägt fehl', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple');
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('verify gegen leeren oder kaputten Hash liefert false', async () => {
    expect(await verifyPassword('any', '')).toBe(false);
    expect(await verifyPassword('any', 'not-an-argon2-hash')).toBe(false);
    expect(await verifyPassword('', '$argon2id$v=19$m=65536,t=3,p=1$abc$def')).toBe(false);
  });

  it('hash mit leerem Passwort wirft', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });

  it('Strength: mindestens 12 Zeichen', () => {
    expect(validatePasswordStrength('short').ok).toBe(false);
    expect(validatePasswordStrength('123456789012').ok).toBe(true);
    expect(validatePasswordStrength('a'.repeat(257)).ok).toBe(false);
  });
});
