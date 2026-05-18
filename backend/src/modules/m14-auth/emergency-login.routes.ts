/**
 * M14 — Notfall-Login-Route
 *
 * POST /auth/notfall/login
 *   Body: { email, password, totp_code?, backup_code? }
 *   → Drei-Faktor-Check + JWT-Cookie (4h TTL)
 *
 * Nur für Geschäftsführer (role='geschaeftsfuehrer').
 * Rate-Limit: 5 Versuche / 15 Min pro IP + pro Email.
 *
 * Spec: M14_User_Verwaltung_Auth.md §5.2
 *
 * Registrierung in app.ts:
 *   await app.register(emergencyLoginRoutes, { prefix: '/api/v1/auth' });
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../core/config';
import { performEmergencyLogin } from './emergency-login.service';
import { extractJtiUnsafe, signM14EmergencyToken } from './m14-jwt';
import { createAuthSession, logAuthEvent } from './users.repository';

// ── Schemas ────────────────────────────────────────────────────────────────

const EmergencyLoginBodySchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(1024),
    totp_code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    backup_code: z.string().min(8).max(32).optional(),
  })
  .refine((data) => data.totp_code !== undefined || data.backup_code !== undefined, {
    message: 'Entweder totp_code oder backup_code muss angegeben werden',
  });

type EmergencyLoginBody = z.infer<typeof EmergencyLoginBodySchema>;

// Cookie-Name (identisch zu Discord-Login)
const AUTH_COOKIE_NAME = 'pp_auth';
// 4 Stunden Cookie-Lebensdauer (= JWT-TTL)
const EMERGENCY_COOKIE_MAX_AGE_SECONDS = 14_400;

// ── Hilfsfunktion ──────────────────────────────────────────────────────────

function getClientIp(req: FastifyRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() ?? null;
  return req.ip ?? null;
}

// ── Fastify-Plugin ─────────────────────────────────────────────────────────

export async function emergencyLoginRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/notfall/login
   *
   * Drei-Faktor-Check: Email + Argon2id-Passwort + TOTP (oder Backup-Code).
   * Nur für Geschäftsführer. Setzt JWT-Cookie (4h).
   */
  app.post<{ Body: EmergencyLoginBody }>(
    '/notfall/login',
    async (req: FastifyRequest<{ Body: EmergencyLoginBody }>, reply: FastifyReply) => {
      const parseResult = EmergencyLoginBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: parseResult.error.errors[0]?.message ?? 'Ungültige Eingabe',
        });
      }

      const body = parseResult.data;
      const clientIp = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? null;

      const outcome = await performEmergencyLogin({
        email: body.email,
        password: body.password,
        totpCode: body.totp_code,
        backupCode: body.backup_code,
        ipAddress: clientIp,
        pool: app.db,
        redis: app.redis,
      });

      if (!outcome.ok) {
        // Audit-Log für jeden Fehlversuch
        await logAuthEvent(app.db, {
          userId: null,
          eventType: 'emergency_login_failed',
          ipAddress: clientIp,
          userAgent,
          metadata: {
            reason: outcome.error,
            email_hint: `${body.email.substring(0, 3)}***`,
          },
        });

        const statusCode = outcome.error.startsWith('rate_limit') ? 429 : 401;
        return reply.code(statusCode).send({
          error: outcome.error,
          message: resolveErrorMessage(outcome.error),
        });
      }

      // ── Erfolgreich — JWT ausstellen ────────────────────────────────────
      const jwtToken = signM14EmergencyToken({
        userId: outcome.userId,
        role: outcome.role,
        displayName: outcome.displayName,
      });

      const jti = extractJtiUnsafe(jwtToken) ?? `emergency-${Date.now()}`;
      const sessionExpiresAt = new Date(Date.now() + EMERGENCY_COOKIE_MAX_AGE_SECONDS * 1000);

      await createAuthSession(app.db, {
        userId: outcome.userId,
        jwtJti: jti,
        loginMethod: 'emergency',
        ipAddress: clientIp,
        userAgent,
        expiresAt: sessionExpiresAt,
      });

      await logAuthEvent(app.db, {
        userId: outcome.userId,
        eventType: 'emergency_login_success',
        ipAddress: clientIp,
        userAgent,
        metadata: { role: outcome.role },
      });

      const isSecure = config.NODE_ENV === 'production';
      reply.setCookie(AUTH_COOKIE_NAME, jwtToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'strict',
        maxAge: EMERGENCY_COOKIE_MAX_AGE_SECONDS,
        path: '/',
      });

      return reply.code(200).send({
        ok: true,
        display_name: outcome.displayName,
        role: outcome.role,
        expires_in: EMERGENCY_COOKIE_MAX_AGE_SECONDS,
      });
    },
  );
}

function resolveErrorMessage(error: string): string {
  switch (error) {
    case 'rate_limit_ip':
    case 'rate_limit_email':
      return 'Zu viele Fehlversuche. Bitte später erneut versuchen.';
    case 'role_not_allowed':
      return 'Notfall-Login ist nur für Geschäftsführer verfügbar.';
    case 'account_disabled':
      return 'Dein Account ist deaktiviert.';
    case 'no_emergency_setup':
      return 'Notfall-Login ist für diesen Account nicht eingerichtet.';
    default:
      return 'Anmeldedaten ungültig.';
  }
}
