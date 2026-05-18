/**
 * M14 — Discord OAuth 2.0 Routes
 *
 * GET /auth/discord/login    → Redirect zu Discord-OAuth mit CSRF-State
 * GET /auth/discord/callback → Code-Tausch + User-Prüfung + JWT-Issue
 *
 * Security-Maßnahmen:
 *   - CSRF via State-Token (32 Bytes, Base64URL, Redis TTL 5 Min)
 *   - State ist einmalig (DELETE nach Validierung)
 *   - Redirect-Ziel nur relative URLs (verhindert Open-Redirect)
 *   - Cookie: HttpOnly, Secure (Prod), SameSite=Strict
 *   - Tokens werden nie geloggt
 *
 * Registrierung in app.ts VOR dem HMAC-Block:
 *   await app.register(discordAuthRoutes, { prefix: '/api/v1' });
 */

import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../core/config';
import {
  DiscordApiError,
  buildDiscordAuthUrl,
  checkGuildMembership,
  exchangeCodeForTokens,
  fetchDiscordUser,
  mapDiscordRoleToInternalRole,
} from './discord.service';
import { extractJtiUnsafe, signM14Token } from './m14-jwt';
import { createAuthSession, logAuthEvent, upsertDiscordUser } from './users.repository';

// ── Schemas ────────────────────────────────────────────────────────────────

const CallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  // Optionale Redirect-URL nach Login — NUR relative URLs erlaubt
  redirect: z.string().optional(),
});

type CallbackQuery = z.infer<typeof CallbackQuerySchema>;

// Redis-Key-Prefix für CSRF-State-Tokens
const STATE_KEY_PREFIX = 'discord:oauth:state:';
// State TTL: 5 Minuten
const STATE_TTL_SECONDS = 300;
// JWT-Cookie-Name
const AUTH_COOKIE_NAME = 'pp_auth';
// Cookie-MaxAge: 24 Stunden (entspricht JWT-TTL)
const COOKIE_MAX_AGE_SECONDS = 86_400;

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

/**
 * Gibt die IP-Adresse des Requests zurück.
 * Berücksichtigt X-Forwarded-For (hinter Caddy/Proxy).
 */
function getClientIp(req: FastifyRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    // Erster Eintrag in der Forwarded-Chain ist der echte Client
    return forwarded.split(',')[0].trim() ?? null;
  }
  return req.ip ?? null;
}

/**
 * Prüft ob ein Redirect-Ziel sicher ist (nur relative URLs).
 * Verhindert Open-Redirect-Angriffe.
 */
function isSafeRedirect(url: string): boolean {
  // Muss mit / beginnen und darf kein // haben (kein Protocol-Relative)
  return url.startsWith('/') && !url.startsWith('//');
}

// ── Fastify-Plugin ─────────────────────────────────────────────────────────

export async function discordAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /auth/discord/login
   *
   * Generiert einen CSRF-State-Token, speichert ihn in Redis (TTL 5 Min),
   * und redirectet den Browser zu Discord OAuth.
   */
  app.get('/auth/discord/login', async (req: FastifyRequest, reply: FastifyReply) => {
    // 32 Bytes → 43 Base64URL-Zeichen (keine Padding-Zeichen)
    const stateBytes = randomBytes(32);
    const state = stateBytes
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // State in Redis speichern (Einmalverwendung, TTL 5 Min)
    await app.redis.set(`${STATE_KEY_PREFIX}${state}`, '1', 'EX', STATE_TTL_SECONDS);

    const authUrl = buildDiscordAuthUrl(state);

    return reply.redirect(authUrl, 302);
  });

  /**
   * GET /auth/discord/callback
   *
   * Empfängt den OAuth-Callback von Discord.
   * Validiert State, tauscht Code gegen Tokens, prüft Guild-Mitgliedschaft,
   * legt User in DB an/aktualisiert ihn, stellt JWT aus, setzt Cookie.
   */
  app.get<{ Querystring: CallbackQuery }>(
    '/auth/discord/callback',
    async (req: FastifyRequest<{ Querystring: CallbackQuery }>, reply: FastifyReply) => {
      // Zod-Validierung der Query-Params
      const parseResult = CallbackQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Ungültige Query-Parameter',
        });
      }

      const query = parseResult.data;
      const clientIp = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? null;

      // ── 1. Discord-Fehler-Rückgabe abfangen ───────────────────────────
      if (query.error) {
        return reply.code(400).send({
          error: query.error,
          message: query.error_description ?? 'Discord-OAuth-Fehler',
        });
      }

      // ── 2. State und Code prüfen ──────────────────────────────────────
      if (!query.state || !query.code) {
        return reply.code(400).send({
          error: 'missing_params',
          message: 'State oder Code fehlen im Callback',
        });
      }

      // ── 3. CSRF-State validieren ──────────────────────────────────────
      const stateKey = `${STATE_KEY_PREFIX}${query.state}`;
      // DECISION (MAJOR 4): Atomares GETDEL statt GET + DEL.
      // Verhindert Race-Condition bei parallelen Requests mit demselben State-Token:
      // Zwei gleichzeitige Callbacks würden bei GET+DEL beide ein Ergebnis lesen,
      // aber nur einer löscht danach. GETDEL ist atomar — der zweite Request bekommt null.
      const stateValue = await app.redis.getdel(stateKey);
      if (!stateValue) {
        return reply.code(400).send({
          error: 'invalid_state',
          message: 'State ungültig oder abgelaufen. Bitte erneut einloggen.',
        });
      }

      // ── 4. Code gegen Tokens tauschen ────────────────────────────────
      let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
      try {
        tokens = await exchangeCodeForTokens(query.code);
      } catch (err) {
        if (err instanceof DiscordApiError) {
          return reply.code(502).send({
            error: 'discord_error',
            message: 'Discord-Token-Exchange fehlgeschlagen. Bitte erneut versuchen.',
          });
        }
        throw err; // Unbekannter Fehler → Fastify-Error-Handler
      }

      // ── 5. User-Info abrufen ──────────────────────────────────────────
      let discordUser: Awaited<ReturnType<typeof fetchDiscordUser>>;
      try {
        discordUser = await fetchDiscordUser(tokens.access_token);
      } catch (err) {
        if (err instanceof DiscordApiError) {
          return reply.code(502).send({
            error: 'discord_error',
            message: 'Discord-User-Info-Abruf fehlgeschlagen.',
          });
        }
        throw err;
      }

      // ── 6. Guild-Mitgliedschaft prüfen ────────────────────────────────
      let guildMember: Awaited<ReturnType<typeof checkGuildMembership>>;
      try {
        guildMember = await checkGuildMembership(discordUser.id);
      } catch (err) {
        if (err instanceof DiscordApiError) {
          return reply.code(502).send({
            error: 'discord_error',
            message: 'Guild-Membership-Prüfung fehlgeschlagen.',
          });
        }
        throw err;
      }

      if (!guildMember) {
        // Audit-Log: Ablehnung wegen fehlender Guild-Mitgliedschaft
        await logAuthEvent(app.db, {
          userId: null,
          eventType: 'login_rejected_not_in_guild',
          ipAddress: clientIp,
          userAgent,
          metadata: { discord_user_id: discordUser.id, discord_username: discordUser.username },
        });
        return reply.code(403).send({
          error: 'not_in_guild',
          message:
            'Du bist nicht im ProzessPilot-Team-Server. Bitte Steve oder Andreas um einen Invite.',
        });
      }

      // ── 7. Rollen-Mapping ─────────────────────────────────────────────
      const internalRole = mapDiscordRoleToInternalRole(guildMember.roles);

      // ── 8. User in DB anlegen / aktualisieren ─────────────────────────
      const displayName = discordUser.global_name ?? guildMember.nick ?? discordUser.username;

      // Avatar-URL aus Discord-Format bauen (falls vorhanden)
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;

      // Token-Ablaufzeit berechnen
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      const dbUser = await upsertDiscordUser(app.db, {
        discordUserId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatarUrl: avatarUrl,
        displayName,
        role: internalRole,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        ipAddress: clientIp,
      }); // DB-Fehler → 500 via Fastify-Error-Handler

      // ── 9. Account-Status prüfen ──────────────────────────────────────
      if (!dbUser.active) {
        await logAuthEvent(app.db, {
          userId: dbUser.id,
          eventType: 'login_rejected_account_disabled',
          ipAddress: clientIp,
          userAgent,
        });
        return reply.code(403).send({
          error: 'account_disabled',
          message: 'Dein Account ist deaktiviert. Bitte wende dich an den Administrator.',
        });
      }

      // ── 10. JWT erstellen ─────────────────────────────────────────────
      const jwtToken = signM14Token({
        userId: dbUser.id,
        discordId: discordUser.id,
        role: dbUser.role,
        displayName: dbUser.display_name,
      });

      // JTI aus Token extrahieren (für Session-Tracking)
      // DECISION: Wir dekodieren den Token um JTI zu lesen, statt ihn separat zu generieren.
      // signM14Token gibt den signierten Token zurück, und jwt.decode() ist safe (keine Verifikation nötig).
      // extractJtiUnsafe ist statisch importiert (kein dynamischer Import im Hot-Path).
      const jti = extractJtiUnsafe(jwtToken) ?? `session-${Date.now()}`;

      // ── 11. Auth-Session anlegen ──────────────────────────────────────
      const sessionExpiresAt = new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000);
      await createAuthSession(app.db, {
        userId: dbUser.id,
        jwtJti: jti,
        loginMethod: 'discord',
        ipAddress: clientIp,
        userAgent,
        expiresAt: sessionExpiresAt,
      });

      // ── 12. Audit-Log ─────────────────────────────────────────────────
      await logAuthEvent(app.db, {
        userId: dbUser.id,
        eventType: 'login_success',
        ipAddress: clientIp,
        userAgent,
        metadata: {
          login_method: 'discord',
          discord_user_id: discordUser.id,
          role: dbUser.role,
        },
      });

      // ── 13. Cookie setzen ─────────────────────────────────────────────
      const isSecure = config.NODE_ENV === 'production';

      reply.setCookie(AUTH_COOKIE_NAME, jwtToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE_SECONDS,
        path: '/',
      });

      // ── 14. Redirect zu App ───────────────────────────────────────────
      const redirectTarget =
        query.redirect && isSafeRedirect(query.redirect) ? query.redirect : '/';

      return reply.redirect(redirectTarget, 302);
    },
  );
}
