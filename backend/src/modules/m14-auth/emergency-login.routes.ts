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

import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../core/config';
import { performEmergencyLogin } from './emergency-login.service';
import type { EmergencyLoginError } from './emergency-login.service';
import { signM14EmergencyToken, verifyM14Token } from './m14-jwt';
import { createAuthSession, getUserById, logAuthEvent } from './users.repository';

// ── Schemas ────────────────────────────────────────────────────────────────

const EmergencyLoginBodySchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(1024),
    totp_code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    backup_code: z
      .string()
      .regex(/^[A-Z0-9]{12,16}$/)
      .optional(), // M6: 12-16 alphanumerisch gem. Spec §5.3
  })
  .refine((data) => data.totp_code !== undefined || data.backup_code !== undefined, {
    message: 'Entweder totp_code oder backup_code muss angegeben werden',
  });

type EmergencyLoginBody = z.infer<typeof EmergencyLoginBodySchema>;

// Cookie-Name (identisch zu Discord-Login)
const AUTH_COOKIE_NAME = 'pp_auth';
// 4 Stunden Cookie-Lebensdauer (= JWT-TTL)
const EMERGENCY_COOKIE_MAX_AGE_SECONDS = 14_400;

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

/**
 * Mappt interne Fehler-Codes auf externe Fehlercodes (B1: User-Enumeration-Schutz).
 * Nur rate_limit_* und totp_invalid werden spezifisch zurückgegeben.
 * Alle anderen internen Fehler werden zu 'invalid_credentials' maskiert.
 */
function toExternalError(
  error: EmergencyLoginError,
): 'rate_limit_ip' | 'rate_limit_email' | 'totp_invalid' | 'invalid_credentials' {
  switch (error) {
    case 'rate_limit_ip':
      return 'rate_limit_ip';
    case 'rate_limit_email':
      return 'rate_limit_email';
    case 'totp_invalid':
      return 'totp_invalid';
    // role_not_allowed, account_disabled, no_emergency_setup, invalid_credentials
    // alle → 'invalid_credentials' (verhindert User-Enumeration)
    default:
      return 'invalid_credentials';
  }
}

/**
 * Gibt den Audit-Log-Event-Type je nach internem Fehler zurück (B1 Punkt 5, M9).
 */
function toAuditEventType(error: EmergencyLoginError): string {
  switch (error) {
    case 'rate_limit_ip':
    case 'rate_limit_email':
      return 'emergency_login_rate_limited';
    case 'totp_invalid':
      return 'emergency_login_totp_failed';
    default:
      return 'emergency_login_failed';
  }
}

// ── Fastify-Plugin ─────────────────────────────────────────────────────────

export async function emergencyLoginRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /auth/session
   *
   * Verifiziert die aktive pp_auth-Cookie-Session und gibt User-Daten zurück.
   * Wird vom Frontend beim Mount aufgerufen, um M14-Cookie-Sessions wiederherzustellen.
   */
  app.get('/session', async (req: FastifyRequest, reply: FastifyReply) => {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies.pp_auth;
    if (!token) {
      return reply.code(401).send({ error: 'no_session', message: 'Nicht eingeloggt' });
    }

    const result = verifyM14Token(token);
    if (!result.ok) {
      // M2: Audit-Log bei ungültigem JWT
      await logAuthEvent(app.db, {
        userId: null,
        eventType: 'session_check_invalid_jwt',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return reply.code(401).send({ error: 'invalid_session', message: result.message });
    }

    // B2: Revocation-Check — Session muss in auth_sessions existieren und nicht widerrufen sein
    const jti = result.payload.jti;
    const sessionCheck = await app.db.query(
      `SELECT 1 FROM auth_sessions
       WHERE jwt_jti = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [jti],
    );
    if (sessionCheck.rows.length === 0) {
      return reply
        .code(401)
        .send({ error: 'session_revoked', message: 'Session abgelaufen oder widerrufen' });
    }

    const user = await getUserById(app.db, result.payload.sub);
    if (!user || !user.active) {
      // M2: Audit-Log bei inaktivem User
      await logAuthEvent(app.db, {
        userId: result.payload.sub,
        eventType: 'session_check_user_inactive',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return reply.code(401).send({ error: 'user_inactive', message: 'Account nicht aktiv' });
    }

    return reply.code(200).send({
      ok: true,
      user: {
        id: user.id,
        display_name: user.display_name,
        role: user.role,
        login_method: result.payload.login_method,
      },
    });
  });

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
      // M2+M3: req.ip direkt verwenden (kein X-Forwarded-For-Parsing in der Route)
      const clientIp = req.ip;
      if (!clientIp) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Client-IP nicht ermittelbar',
        });
      }
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
        // Minor #24: SHA256-Hash statt Klartext-Hint
        const emailHint = createHash('sha256')
          .update(body.email.toLowerCase())
          .digest('hex')
          .substring(0, 16);

        // B1 Punkt 5 + M9: Audit-Log mit differenziertem Event-Type je nach internem Fehler
        await logAuthEvent(app.db, {
          userId: null,
          eventType: toAuditEventType(outcome.error),
          ipAddress: clientIp,
          userAgent,
          metadata: {
            reason: outcome.error, // interner Fehler nur im Audit-Log, nicht nach außen
            email_hint: emailHint,
          },
        });

        // B1: externe Fehlermaskierung — nur rate_limit_* und totp_invalid sichtbar
        const externalError = toExternalError(outcome.error);
        const statusCode = externalError.startsWith('rate_limit') ? 429 : 401;
        return reply.code(statusCode).send({
          error: externalError,
          message: resolveErrorMessage(externalError),
        });
      }

      // ── Erfolgreich — JWT ausstellen ────────────────────────────────────
      // Minor #23: JTI vor Sign generieren — kein extractJtiUnsafe mehr nötig
      const jti = randomUUID();
      const jwtToken = signM14EmergencyToken(
        {
          userId: outcome.userId,
          role: outcome.role,
          displayName: outcome.displayName,
        },
        jti,
      );

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
      // sameSite: 'lax' — konsistent mit Discord-OAuth-Pfad (auth.routes.ts).
      // CSRF-Schutz bleibt erhalten (POST-Requests cross-site werden weiterhin geblockt).
      reply.setCookie(AUTH_COOKIE_NAME, jwtToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
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

/**
 * Gibt eine externe Fehlermeldung zurück.
 * B1 Punkt 6: Nur rate_limit_* und totp_invalid haben spezifische Messages.
 * Alle anderen (inkl. maskierten internen Fehlern) → 'Anmeldedaten ungültig.'
 */
function resolveErrorMessage(
  error: 'rate_limit_ip' | 'rate_limit_email' | 'totp_invalid' | 'invalid_credentials',
): string {
  switch (error) {
    case 'rate_limit_ip':
    case 'rate_limit_email':
      return 'Zu viele Fehlversuche. Bitte später erneut versuchen.';
    case 'totp_invalid':
      return 'Der eingegebene Code ist ungültig.';
    default:
      return 'Anmeldedaten ungültig.';
  }
}
