/**
 * M14 — Password Hashing (argon2id)
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §2 + §7
 * - argon2id mit Memory ≥ 64 MB, Time-Cost 3, Parallelism 1 (ENV-konfigurierbar)
 * - Niemals Klartext-Passwort loggen
 */

import argon2 from 'argon2';
import { config } from '../config';

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 1) {
    throw new Error('hashPassword: leeres Passwort');
  }
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: config.ARGON2_MEMORY_COST,
    timeCost: config.ARGON2_TIME_COST,
    parallelism: config.ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Server-seitige Passwort-Stärke-Prüfung. NIST-konform: Length-First, kein
 * erzwungener Charset-Mix wenn Länge ausreichend.
 * Mindestanforderungen: 12 Zeichen.
 */
export function validatePasswordStrength(plain: string): { ok: boolean; reason?: string } {
  if (plain.length < 12) {
    return { ok: false, reason: 'Passwort muss mindestens 12 Zeichen lang sein.' };
  }
  if (plain.length > 256) {
    return { ok: false, reason: 'Passwort zu lang (max 256 Zeichen).' };
  }
  return { ok: true };
}
