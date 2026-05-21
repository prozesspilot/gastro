/**
 * M14 — JWT-Funktionen für Discord-OAuth-Login (Reboot)
 *
 * GETRENNT von `core/auth/jwt.ts` (der alte Pre-Reboot-Flow mit email/password + tenant_id).
 * Diese Datei implementiert JWT-Claims speziell für den Discord-OAuth-Flow:
 *
 *   Claims: sub (user_id UUID), discord_id, role, display_name, jti, iat, exp
 *   TTL:    24 Stunden (fester Wert — nicht JWT_ACCESS_TTL_SECONDS, das ist 15min für alten Flow)
 *   Algo:   HS256
 *   Secret: JWT_SECRET aus config (identischer Secret wie alter Flow)
 *
 * DECISION: Wir nutzen 24h TTL für Discord-Login statt 15min, weil die Mitarbeiter-Webapp
 * im Browser läuft und kein automatisches Token-Refresh implementiert ist (T002).
 * Das Cookie hat SameSite=Lax + HttpOnly als Schutz (Lax ist Pflicht für OAuth-Redirects).
 */

import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../core/config';

// TTL für Discord-Login-JWTs: 24 Stunden
const M14_DISCORD_JWT_TTL_SECONDS = 86_400;
// TTL für Notfall-Login-JWTs: 4 Stunden (sicherheitskritisch, kürzer)
const M14_EMERGENCY_JWT_TTL_SECONDS = 14_400;

// ── Types ──────────────────────────────────────────────────────────────────

export interface M14TokenPayload {
  sub: string; // user_id UUID (interne DB-ID)
  discord_id: string | null; // Discord-User-ID (null bei emergency-Login)
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
  display_name: string;
  login_method: 'discord' | 'emergency'; // Pflichtfeld — B2
  jti: string;
  iat: number;
  exp: number;
}

export interface SignM14TokenInput {
  userId: string;
  discordId: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
  displayName: string;
}

export interface SignM14EmergencyTokenInput {
  userId: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
  displayName: string;
}

export type VerifyResult<T> =
  | { ok: true; payload: T }
  | { ok: false; code: 'EXPIRED' | 'INVALID'; message: string };

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

function getSecret(): string {
  // Test/Dev: deterministischer Default (config.ts erzwingt Production-Pflicht)
  return config.JWT_SECRET.length >= 32
    ? config.JWT_SECRET
    : 'dev-jwt-secret-do-not-use-in-production-padding-padding';
}

// ── Öffentliche API ────────────────────────────────────────────────────────

/**
 * Signiert einen M14-Discord-OAuth-JWT mit 24h TTL.
 * Gibt den signierten Token-String zurück.
 */
export function signM14Token(input: SignM14TokenInput): string {
  const payload = {
    discord_id: input.discordId,
    role: input.role,
    display_name: input.displayName,
    login_method: 'discord' as const, // B2: Pflichtfeld
  };
  return jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    subject: input.userId,
    jwtid: randomUUID(),
    expiresIn: M14_DISCORD_JWT_TTL_SECONDS,
  });
}

/**
 * Signiert einen M14-Notfall-Login-JWT mit 4h TTL.
 * discord_id ist null (kein Discord bei Notfall-Login).
 * Optionaler jti-Parameter für deterministische JTI-Vergabe (Minor-Fix #23).
 */
export function signM14EmergencyToken(input: SignM14EmergencyTokenInput, jti?: string): string {
  const payload = {
    discord_id: null, // B2: explicit null statt fehlendem Claim
    role: input.role,
    display_name: input.displayName,
    login_method: 'emergency' as const, // B2: Pflichtfeld
  };
  return jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    subject: input.userId,
    jwtid: jti ?? randomUUID(),
    expiresIn: M14_EMERGENCY_JWT_TTL_SECONDS,
  });
}

/**
 * Verifiziert und dekodiert einen M14-Discord-JWT.
 * Gibt VerifyResult<M14TokenPayload> zurück — nie throw.
 */
export function verifyM14Token(token: string): VerifyResult<M14TokenPayload> {
  try {
    const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null) {
      return { ok: false, code: 'INVALID', message: 'JWT-Payload kein Objekt' };
    }
    const p = decoded as Record<string, unknown>;
    // discord_id darf string oder null sein (emergency-Login hat null) — B2
    const discordIdOk = typeof p.discord_id === 'string' || p.discord_id === null;
    if (
      typeof p.sub !== 'string' ||
      !discordIdOk ||
      typeof p.role !== 'string' ||
      typeof p.display_name !== 'string' ||
      typeof p.jti !== 'string'
    ) {
      return { ok: false, code: 'INVALID', message: 'M14-JWT-Claims unvollständig' };
    }
    // Rolle validieren
    const validRoles = ['geschaeftsfuehrer', 'mitarbeiter', 'support'] as const;
    if (!validRoles.includes(p.role as (typeof validRoles)[number])) {
      return { ok: false, code: 'INVALID', message: `Ungültige Rolle: ${p.role}` };
    }
    // login_method validieren — B2
    const validMethods = ['discord', 'emergency'] as const;
    if (!validMethods.includes(p.login_method as (typeof validMethods)[number])) {
      return {
        ok: false,
        code: 'INVALID',
        message: `Ungültige login_method: ${String(p.login_method)}`,
      };
    }
    return {
      ok: true,
      payload: {
        sub: p.sub,
        discord_id: typeof p.discord_id === 'string' ? p.discord_id : null,
        role: p.role as M14TokenPayload['role'],
        display_name: p.display_name,
        login_method: p.login_method as M14TokenPayload['login_method'],
        jti: p.jti,
        iat: typeof p.iat === 'number' ? p.iat : 0,
        exp: typeof p.exp === 'number' ? p.exp : 0,
      },
    };
  } catch (err) {
    // DECISION: Prüfen per name-Property statt instanceof, weil in Vitest ESM
    // der instanceof-Check über Modul-Grenzen hinweg fehlschlagen kann.
    if (
      err instanceof jwt.TokenExpiredError ||
      (err instanceof Error && err.name === 'TokenExpiredError')
    ) {
      return { ok: false, code: 'EXPIRED', message: 'M14-JWT abgelaufen' };
    }
    const msg = err instanceof Error ? err.message : 'M14-JWT-Verifikation fehlgeschlagen';
    return { ok: false, code: 'INVALID', message: msg };
  }
}

/**
 * Extrahiert die JTI aus einem M14-Token OHNE Signatur-Verifikation.
 * Nur für Revocation-Checks geeignet, nicht für Auth.
 */
export function extractJtiUnsafe(token: string): string | null {
  try {
    const decoded = jwt.decode(token);
    if (typeof decoded !== 'object' || decoded === null) return null;
    const jti = (decoded as Record<string, unknown>).jti;
    return typeof jti === 'string' ? jti : null;
  } catch {
    return null;
  }
}
