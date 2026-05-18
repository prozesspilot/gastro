/**
 * M15 — SumUp OAuth 2.0 Routes
 *
 * GET  /m15/oauth/sumup/start             → OAuth-Flow initiieren (mit CSRF-State)
 * GET  /m15/oauth/sumup/callback          → OAuth-Callback verarbeiten
 * POST /m15/sumup/disconnect/:tenantId    → Verbindung trennen (Soft-Delete via active=false)
 *
 * Security:
 *   - CSRF via State-Token (32 Bytes Base64URL, Redis TTL 5 Min)
 *   - State atomar via GETDEL consumed (kein Race-Condition-Risiko)
 *   - Start-Route: M14-JWT-Auth via pp_auth Cookie (Mitarbeiter-Only)
 *   - Callback-Route: öffentlich (SumUp-Redirect — aber State-Validierung als CSRF-Schutz)
 *   - Disconnect-Route: M14-JWT-Auth
 *
 * Registrierung in app.ts VOR dem HMAC-Block (analog discordAuthRoutes):
 *   await app.register(sumupOauthRoutes, { prefix: '/api/v1' });
 *
 * Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md §4.2, §8
 */

import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../core/config';
import { verifyM14Token } from '../m14-auth/m14-jwt';
import { logAuthEvent } from '../m14-auth/users.repository';
import { deletePosCredentials, upsertPosCredentials } from './pos.repository';
import {
  SumUpApiError,
  buildSumUpAuthUrl,
  exchangeCodeForTokens,
  fetchSumUpUserInfo,
} from './sumup.service';

// ── Konstanten ─────────────────────────────────────────────────────────────

const STATE_KEY_PREFIX = 'sumup:oauth:state:';
const STATE_TTL_SECONDS = 300; // 5 Minuten

// ── Zod-Schemas ────────────────────────────────────────────────────────────

const StartQuerySchema = z.object({
  tenant_id: z.string().uuid({ message: 'tenant_id muss eine gültige UUID sein' }),
});
type StartQuery = z.infer<typeof StartQuerySchema>;

const CallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});
type CallbackQuery = z.infer<typeof CallbackQuerySchema>;

const DisconnectParamsSchema = z.object({
  tenantId: z.string().uuid({ message: 'tenantId muss eine gültige UUID sein' }),
});
type DisconnectParams = z.infer<typeof DisconnectParamsSchema>;

// ── JWT-Auth-Hilfsfunktion ────────────────────────────────────────────────

/**
 * Prüft M14-JWT-Cookie (pp_auth) und gibt Payload zurück.
 * Gibt null zurück bei fehlendem oder ungültigem Cookie.
 *
 * DECISION: Wir nutzen das pp_auth Cookie (analog zu M14 auth.routes.ts),
 * da die Start- und Disconnect-Routen aus der Mitarbeiter-Webapp aufgerufen werden.
 */
function getM14Staff(req: FastifyRequest): { userId: string; role: string } | null {
  const cookie = req.cookies?.pp_auth;
  if (!cookie) return null;

  const result = verifyM14Token(cookie);
  if (!result.ok) return null;

  return { userId: result.payload.sub, role: result.payload.role };
}

// ── Fastify-Plugin ─────────────────────────────────────────────────────────

export async function sumupOauthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /m15/oauth/sumup/start?tenant_id=<uuid>
   *
   * Generiert CSRF-State, speichert tenant_id + state in Redis (TTL 5 Min),
   * redirectet zu SumUp-OAuth-URL.
   *
   * Auth: M14-JWT Cookie (Mitarbeiter-Only)
   */
  app.get<{ Querystring: StartQuery }>(
    '/m15/oauth/sumup/start',
    async (req: FastifyRequest<{ Querystring: StartQuery }>, reply: FastifyReply) => {
      // Auth-Check: Mitarbeiter-Login erforderlich
      const staff = getM14Staff(req);
      if (!staff) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'M14-JWT-Authentifizierung erforderlich.',
        });
      }

      // Query-Validierung
      const parseResult = StartQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: parseResult.error.errors[0]?.message ?? 'Ungültige Query-Parameter',
        });
      }

      const { tenant_id } = parseResult.data;

      // CSRF-State generieren (32 Bytes → 43 Base64URL-Zeichen)
      const stateBytes = randomBytes(32);
      const state = stateBytes
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      // State → tenant_id Mapping in Redis (atomar, TTL 5 Min)
      await app.redis.set(`${STATE_KEY_PREFIX}${state}`, tenant_id, 'EX', STATE_TTL_SECONDS);

      const authUrl = buildSumUpAuthUrl(state);
      return reply.redirect(authUrl, 302);
    },
  );

  /**
   * GET /m15/oauth/sumup/callback?code=<>&state=<>
   *
   * Öffentlicher Callback-Endpoint (SumUp redirect).
   * Validiert CSRF-State, tauscht Code gegen Tokens, speichert Credentials.
   */
  app.get<{ Querystring: CallbackQuery }>(
    '/m15/oauth/sumup/callback',
    async (req: FastifyRequest<{ Querystring: CallbackQuery }>, reply: FastifyReply) => {
      const parseResult = CallbackQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Ungültige Query-Parameter',
        });
      }

      const query = parseResult.data;

      // ── 1. SumUp-Fehler abfangen ─────────────────────────────────────
      if (query.error) {
        return reply.code(400).send({
          error: query.error,
          message: query.error_description ?? 'SumUp OAuth-Fehler',
        });
      }

      // ── 2. Pflichtfelder prüfen ───────────────────────────────────────
      if (!query.state || !query.code) {
        return reply.code(400).send({
          error: 'missing_params',
          message: 'State oder Code fehlen im Callback',
        });
      }

      // ── 3. CSRF-State validieren (atomar GETDEL) ──────────────────────
      const stateKey = `${STATE_KEY_PREFIX}${query.state}`;
      // DECISION: GETDEL ist atomar — verhindert Race-Condition bei parallelen Callbacks.
      // Analog zur Discord-OAuth-Implementierung in auth.routes.ts.
      const tenantId = await app.redis.getdel(stateKey);
      if (!tenantId) {
        return reply.code(400).send({
          error: 'invalid_state',
          message: 'State ungültig oder abgelaufen. Bitte erneut versuchen.',
        });
      }

      // ── 4. Code gegen Tokens tauschen ────────────────────────────────
      let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
      try {
        tokens = await exchangeCodeForTokens(query.code);
      } catch (err) {
        if (err instanceof SumUpApiError) {
          return reply.code(502).send({
            error: 'sumup_error',
            message: 'SumUp Token-Exchange fehlgeschlagen. Bitte erneut versuchen.',
          });
        }
        throw err;
      }

      // ── 5. User-Info abrufen (pos_account_id = merchant_code) ─────────
      let userInfo: Awaited<ReturnType<typeof fetchSumUpUserInfo>>;
      try {
        userInfo = await fetchSumUpUserInfo(tokens.access_token);
      } catch (err) {
        if (err instanceof SumUpApiError) {
          return reply.code(502).send({
            error: 'sumup_error',
            message: 'SumUp User-Info-Abruf fehlgeschlagen.',
          });
        }
        throw err;
      }

      const posAccountId = userInfo.merchant_profile.merchant_code;
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      const scopes = tokens.scope.split(' ').filter(Boolean);

      // ── 6. Credentials in DB speichern ───────────────────────────────
      // DECISION: pos_system='sumup_lite' als Standardannahme für T004.
      // SumUp POS Pro folgt in einem späteren Task (gleiche API, anderer pos_system-Wert).
      await upsertPosCredentials(app.db, {
        tenantId,
        posSystem: 'sumup_lite',
        posAccountId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        scopes,
      });

      // ── 7. Audit-Log ─────────────────────────────────────────────────
      // Nur die ersten 6 Zeichen der account_id loggen (kein vollständiges PII)
      await logAuthEvent(app.db, {
        userId: null, // kein Staff-User-Context im Callback (öffentlicher Endpoint)
        eventType: 'pos_connected',
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          tenant_id: tenantId,
          pos_system: 'sumup_lite',
          pos_account_id_prefix: posAccountId.slice(0, 6),
        },
      });

      // ── 8. Redirect zu Mitarbeiter-Webapp ─────────────────────────────
      // DECISION: Frontend-URL nicht hardcoded — nutze SUMUP_REDIRECT_URI als Basis.
      // Einfachste sichere Lösung: Redirect zur internen Bestätigungs-Seite.
      // TODO T005: Webapp-URL aus Config (z.B. WEBAPP_URL env) konfigurierbar machen.
      const frontendUrl = `https://admin.prozesspilot.net/tenants/${tenantId}?pos_connected=sumup`;
      return reply.redirect(frontendUrl, 302);
    },
  );

  /**
   * POST /m15/sumup/disconnect/:tenantId
   *
   * Trennt die SumUp-Verbindung für einen Tenant.
   * DECISION: Hard-DELETE (spec §8 sagt DELETE). Soft-Delete (active=false)
   * wäre für Audit-Trail besser, aber der Spec sagt explizit DELETE.
   * Wir folgen der Spec; das Audit-Log wird davor geschrieben.
   *
   * Auth: M14-JWT (Mitarbeiter-Only)
   */
  app.post<{ Params: DisconnectParams }>(
    '/m15/sumup/disconnect/:tenantId',
    async (req: FastifyRequest<{ Params: DisconnectParams }>, reply: FastifyReply) => {
      // Auth-Check
      const staff = getM14Staff(req);
      if (!staff) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'M14-JWT-Authentifizierung erforderlich.',
        });
      }

      // Params-Validierung
      const parseResult = DisconnectParamsSchema.safeParse(req.params);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'invalid_params',
          message: parseResult.error.errors[0]?.message ?? 'Ungültige Params',
        });
      }

      const { tenantId } = parseResult.data;

      // Audit-Log VOR dem Delete (damit tenant_id noch bekannt ist)
      await logAuthEvent(app.db, {
        userId: staff.userId,
        eventType: 'pos_disconnected',
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          tenant_id: tenantId,
          pos_system: 'sumup_lite',
          disconnected_by_role: staff.role,
        },
      });

      const { deleted } = await deletePosCredentials(app.db, tenantId, 'sumup_lite');

      if (!deleted) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Keine SumUp-Verbindung für diesen Tenant gefunden.',
        });
      }

      return reply.code(200).send({ ok: true, message: 'SumUp-Verbindung getrennt.' });
    },
  );
}
