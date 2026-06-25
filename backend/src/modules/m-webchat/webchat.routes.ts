/**
 * T068/Phase C — Web-Chat-Widget: Routen.
 *
 * Zwei ENTKOPPELTE Plugins unter demselben Prefix /api/v1/chat:
 *  - chatStaffRoutes:  Session erzeugen/widerrufen. m14StaffAuthHook +
 *    m14TenantContextHook (der Mitarbeiter wählt den Tenant per x-pp-tenant-id).
 *  - chatPublicRoutes: vom Wirt genutzte Endpoints. KEIN Staff-Cookie — der
 *    Magic-Link-Token (192 Bit) IST die Credential. Tenant wird intern aus der
 *    Session aufgelöst (SECURITY-DEFINER-Lookup).
 *
 * Fastify-Encapsulation: addHook im Staff-Plugin leakt NICHT ins Public-Plugin.
 * Keine Route-Kollision: POST /sessions(/:id/revoke) vs. GET /:token.
 *
 * Nachrichten (T069) + Beleg-Upload (T070) hängen sich an dieselben Plugins.
 */
import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { createChatSessionHandler } from './handlers/create-session.handler';
import { getChatSessionHandler } from './handlers/get-session.handler';
import { revokeChatSessionHandler } from './handlers/revoke-session.handler';

// Explizites Per-Route-Rate-Limiting (zusätzlich zum globalen 100/min aus app.ts).
// Token-Brücke + Staff-Session-Aktionen sind sensibel (DB-Writes, Mail-Trigger);
// 30/min ist großzügig und blockt Abuse. Greift nur mit @fastify/rate-limit
// (Prod; im Test ignoriert). Verhindert zugleich den CodeQL-Missing-Rate-Limiting-Alert.
const RL = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

/** Staff-Endpoints (JWT-Cookie + Tenant-Context). */
export async function chatStaffRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.post('/sessions', RL, createChatSessionHandler);
  app.post<{ Params: { id: string } }>('/sessions/:id/revoke', RL, revokeChatSessionHandler);
}

/** Öffentliche Chat-Endpoints (Token = Credential, kein Staff-Cookie). */
export async function chatPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>('/:token', RL, getChatSessionHandler);
}
