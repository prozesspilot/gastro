/**
 * M14 — JWT Auth-Middleware + Permission-Guards
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §5.6
 *
 * Verwendung:
 *   app.register(async (api) => {
 *     api.addHook('preHandler', jwtAuthMiddleware);
 *     api.get('/users', { preHandler: requirePermission('users.read') }, ...);
 *   });
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type AccessTokenPayload, verifyAccessToken } from './jwt';
import { matchPermission } from './permissions';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AccessTokenPayload;
  }
}

function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function jwtAuthMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractBearer(req);
  if (!token) {
    await reply.code(401).send({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Bearer-Token fehlt' },
    });
    return;
  }
  const result = verifyAccessToken(token);
  if (!result.ok) {
    await reply.code(401).send({
      ok: false,
      error: {
        code: result.code === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
        message: result.message,
      },
    });
    return;
  }
  req.authUser = result.payload;
}

export function requirePermission(permission: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.authUser) {
      await reply.code(401).send({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' },
      });
      return;
    }
    if (!matchPermission(req.authUser.permissions, permission)) {
      await reply.code(403).send({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Berechtigung fehlt',
          details: { required: permission },
        },
      });
      return;
    }
  };
}

/** Hilfs-Middleware: blockt User mit password_must_change=true außer auf
 *  /auth/me + /auth/change-password + /auth/logout. */
export function requirePasswordChangeNotPending() {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Markierung kommt aus DB-Lookup im Handler — hier nur Placeholder,
    // damit Handlers konsistent gegen denselben Helper checken können.
    if (req.authUser && (req.authUser as { password_must_change?: boolean }).password_must_change) {
      await reply.code(403).send({
        ok: false,
        error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Passwort-Wechsel erforderlich' },
      });
      return;
    }
  };
}
