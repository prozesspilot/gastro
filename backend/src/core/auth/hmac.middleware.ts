/**
 * D3 — HMAC-Middleware mit Triple-Auth (Bearer + Cookie + HMAC)
 *
 * Registriert als preHandler-Hook auf allen /api/v1/*-Routen.
 *
 * Auth-Reihenfolge:
 *   1. PP_AUTH_DISABLED=1 → immer durchlassen (Dev-Bypass)
 *   2. Authorization: Bearer <token> vorhanden → JWT-Pfad (Mobile / API-Clients)
 *      - Gültiger Token: req.authUser setzen, HMAC überspringen
 *      - Ungültiger/abgelaufener Token: 401, KEIN HMAC-Fallback
 *        (Security: verhindert Bypass-Versuche durch kaputte Bearer-Header)
 *   3. Cookie pp_auth vorhanden → M14-Cookie-Pfad (Mitarbeiter-Webapp-Sessions)
 *      - Gültiger M14-JWT: req.m14Staff setzen + req.authUser synthetisch
 *      - Ungültiger: 401, KEIN HMAC-Fallback (gleicher Security-Grund)
 *   4. Weder Bearer noch Cookie → HMAC-Pfad (n8n → Backend, Service-to-Service)
 *
 * Spec: M14 §5.6 — HMAC für n8n, Bearer für API-Clients, Cookie für Webapp.
 *
 * Im Dev-Modus (PP_AUTH_DISABLED=1) wird die Prüfung übersprungen.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyM14Token } from '../../modules/m14-auth/m14-jwt';
import { config } from '../config';
import { logger } from '../logger';
import { verifyHmac } from './hmac';
import { verifyAccessToken } from './jwt';
import type { AccessTokenPayload } from './jwt';
import type { M14Staff } from './m14-staff-auth';

/**
 * Fastify speichert den geparsten Body in req.body, aber wir brauchen den
 * ROHEN Buffer für die Signaturberechnung. Er wird über einen
 * addContentTypeParser-Hook in app.ts in req.rawBody abgelegt.
 * Bei GET/HEAD ohne Body nehmen wir einen leeren Buffer.
 */
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
    // DECISION: authUser deklariert hier und in jwt.middleware.ts — beide
    // module-augmentations mergen sich in TypeScript zu einem Interface.
    authUser?: AccessTokenPayload;
    // M14 Staff-Auth (Cookie-Pfad) — siehe m14-staff-auth.ts
    m14Staff?: M14Staff;
  }
}

/** Extrahiert den Bearer-Token aus dem Authorization-Header. Gibt null zurück wenn kein Bearer-Header vorhanden. */
function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function hmacMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Dev-Bypass — in Production wirft config bereits einen Fehler beim Start
  if (config.PP_AUTH_DISABLED) {
    return;
  }

  // ── Bearer-Pfad (Mobile / API-Clients → Backend) ────────────────────────
  const bearerToken = extractBearer(req);
  if (bearerToken !== null) {
    const jwtResult = verifyAccessToken(bearerToken);
    if (jwtResult.ok) {
      req.authUser = jwtResult.payload;
      // Bearer gültig: HMAC überspringen
      return;
    }
    // Bearer vorhanden aber ungültig/abgelaufen → 401, KEIN HMAC-Fallback.
    // Security: verhindert dass Angreifer mit kaputtem Bearer-Header auf die
    // HMAC-Verifikation zurückfallen und so den Auth-Mechanismus umgehen.
    const code = jwtResult.code === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
    logger.warn(
      { code, url: req.url, method: req.method },
      `Bearer-Auth fehlgeschlagen: ${jwtResult.message}`,
    );
    await reply.code(401).send({
      ok: false,
      error: { code, message: jwtResult.message },
    });
    return;
  }

  // ── Cookie-Pfad (Mitarbeiter-Webapp → Backend) ──────────────────────────
  // M14: pp_auth ist ein HttpOnly-JWT-Cookie, das nach erfolgreichem Login
  // (Discord-OAuth oder Notfall-Login) gesetzt wird. Webapp sendet es via
  // `credentials: include` automatisch mit; Bearer-Header ist nicht möglich,
  // da httpOnly-Cookies nicht aus JS lesbar sind.
  const cookieToken = req.cookies?.pp_auth;
  if (cookieToken) {
    const m14Result = verifyM14Token(cookieToken);
    if (m14Result.ok) {
      const payload = m14Result.payload;
      req.m14Staff = {
        userId: payload.sub,
        role: payload.role,
        displayName: payload.display_name,
      };
      // Synthetischer authUser für Routen, die das Interface lesen.
      // Staff sind tenant-agnostisch (sehen alle Mandanten), daher tenant_id=null.
      req.authUser = {
        sub: payload.sub,
        tenant_id: null,
        permissions: [],
        preset: null,
        iat: payload.iat,
        exp: payload.exp,
        jti: payload.jti,
      };
      return;
    }
    // Cookie vorhanden aber ungültig → 401, KEIN HMAC-Fallback.
    const code = m14Result.code === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
    logger.warn(
      { code, url: req.url, method: req.method },
      `Cookie-Auth fehlgeschlagen: ${m14Result.message}`,
    );
    await reply.code(401).send({
      ok: false,
      error: { code, message: m14Result.message },
    });
    return;
  }

  // ── HMAC-Pfad (n8n → Backend, Service-to-Service) ───────────────────────
  const result = verifyHmac({
    secret: config.PP_HMAC_SECRET,
    maxSkewSeconds: config.PP_HMAC_TIMESTAMP_SKEW,
    method: req.method,
    url: req.url,
    timestamp: req.headers['x-pp-timestamp'] as string | undefined,
    signature: req.headers['x-pp-signature'] as string | undefined,
    rawBody: req.rawBody ?? Buffer.alloc(0),
  });

  if (!result.ok) {
    logger.warn(
      { code: result.code, url: req.url, method: req.method },
      `HMAC-Auth fehlgeschlagen: ${result.message}`,
    );
    await reply.code(401).send({
      ok: false,
      error: { code: result.code, message: result.message },
    });
  }
}
