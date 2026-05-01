/**
 * D3 — HMAC-Middleware (ersetzt den Stub aus D1)
 *
 * Registriert als preHandler-Hook auf allen /api/v1/*-Routen.
 * Liest den rohen Request-Body, prüft Timestamp und Signatur.
 *
 * Im Dev-Modus (PP_AUTH_DISABLED=1) wird die Prüfung übersprungen.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { logger } from '../logger';
import { verifyHmac } from './hmac';

/**
 * Fastify speichert den geparsten Body in req.body, aber wir brauchen den
 * ROHEN Buffer für die Signaturberechnung. Er wird über einen
 * addContentTypeParser-Hook in app.ts in req.rawBody abgelegt.
 * Bei GET/HEAD ohne Body nehmen wir einen leeren Buffer.
 */
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export async function hmacMiddleware(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Dev-Bypass — in Production wirft config bereits einen Fehler beim Start
  if (config.PP_AUTH_DISABLED) {
    return;
  }

  const result = verifyHmac({
    secret:         config.PP_HMAC_SECRET,
    maxSkewSeconds: config.PP_HMAC_TIMESTAMP_SKEW,
    method:         req.method,
    url:            req.url,
    timestamp:      req.headers['x-pp-timestamp'] as string | undefined,
    signature:      req.headers['x-pp-signature'] as string | undefined,
    rawBody:        req.rawBody ?? Buffer.alloc(0),
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
