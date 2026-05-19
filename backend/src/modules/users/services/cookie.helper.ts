/**
 * M14 — Refresh-Cookie Helper
 *
 * HttpOnly + Secure + SameSite=Strict (ENV-gesteuert)
 * Pfad: /api/v1/auth (Cookie nur an Auth-Endpoints gesendet)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../../core/config';

const COOKIE_PATH = '/api/v1/auth';

export function setRefreshCookie(reply: FastifyReply, plainToken: string): void {
  reply.setCookie(config.AUTH_REFRESH_COOKIE_NAME, plainToken, {
    httpOnly: true,
    secure: config.AUTH_REFRESH_COOKIE_SECURE,
    sameSite: config.AUTH_REFRESH_COOKIE_SAMESITE,
    path: COOKIE_PATH,
    maxAge: config.JWT_REFRESH_TTL_SECONDS,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(config.AUTH_REFRESH_COOKIE_NAME, { path: COOKIE_PATH });
}

export function getRefreshCookie(req: FastifyRequest): string | null {
  const cookies = (req as FastifyRequest & { cookies?: Record<string, string | undefined> })
    .cookies;
  const val = cookies?.[config.AUTH_REFRESH_COOKIE_NAME];
  return val ?? null;
}
