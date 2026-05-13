/**
 * M14 — JWT Access-Token sign + verify (HS256)
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §5.3
 * - Access-Token TTL 15 min (ENV JWT_ACCESS_TTL_SECONDS)
 * - JWT-Secret aus ENV JWT_SECRET (Pflicht in Production)
 * - Claims: sub, tenant_id (null bei super_admin), permissions, preset, iat, exp, jti
 */

import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string;
  tenant_id: string | null;
  permissions: string[];
  preset: string | null;
  iat: number;
  exp: number;
  jti: string;
}

export interface SignAccessTokenInput {
  userId: string;
  tenantId: string | null;
  permissions: string[];
  preset: string | null;
}

function getSecret(): string {
  // Test/Dev darf einen Default verwenden (config.ts erzwingt Production-Pflicht).
  return config.JWT_SECRET.length >= 32
    ? config.JWT_SECRET
    : 'dev-jwt-secret-do-not-use-in-production-padding-padding';
}

export function signAccessToken(input: SignAccessTokenInput): string {
  const payload = {
    tenant_id: input.tenantId,
    permissions: input.permissions,
    preset: input.preset,
  };
  return jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    subject: input.userId,
    jwtid: randomUUID(),
    expiresIn: config.JWT_ACCESS_TTL_SECONDS,
  });
}

export type VerifyResult =
  | { ok: true; payload: AccessTokenPayload }
  | { ok: false; code: 'EXPIRED' | 'INVALID'; message: string };

export function verifyAccessToken(token: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null) {
      return { ok: false, code: 'INVALID', message: 'JWT-Payload kein Objekt' };
    }
    const p = decoded as Record<string, unknown>;
    if (typeof p.sub !== 'string' || !Array.isArray(p.permissions)) {
      return { ok: false, code: 'INVALID', message: 'JWT-Claims unvollständig' };
    }
    return {
      ok: true,
      payload: {
        sub: p.sub,
        tenant_id: typeof p.tenant_id === 'string' ? p.tenant_id : null,
        permissions: p.permissions as string[],
        preset: typeof p.preset === 'string' ? p.preset : null,
        iat: typeof p.iat === 'number' ? p.iat : 0,
        exp: typeof p.exp === 'number' ? p.exp : 0,
        jti: typeof p.jti === 'string' ? p.jti : '',
      },
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, code: 'EXPIRED', message: 'Access-Token abgelaufen' };
    }
    const msg = err instanceof Error ? err.message : 'JWT-Verifikation fehlgeschlagen';
    return { ok: false, code: 'INVALID', message: msg };
  }
}
