/**
 * M09 Lieferanten-Kommunikation — Fastify-Routen:
 *
 *   POST /api/v1/communications/build     → CommDraft oder { skip: true }
 *   POST /api/v1/communications/send      → sendet & persistiert
 *   GET  /api/v1/communications           → Liste mit Filter
 *
 * Webhook (öffentlich, kein HMAC):
 *   POST /webhooks/email/inbound          → Inbound-Webhook (Mailgun/Postmark)
 */

import type { FastifyInstance } from 'fastify';
import { buildBuildHandler } from './handlers/build.handler';
import { buildSendHandler } from './handlers/send.handler';
import { buildInboundHandler } from './handlers/inbound.handler';
import { buildListHandler } from './handlers/list.handler';

/** Registriert unter /communications (innerhalb /api/v1, mit HMAC-Auth) */
export async function m09CommunicationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/build', buildBuildHandler());
  app.post('/send', buildSendHandler());
  app.get('/', buildListHandler());
}

/** Registriert unter /webhooks (ohne HMAC-Auth — eigene Signaturprüfung) */
export async function m09InboundWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/email/inbound', buildInboundHandler());
}
