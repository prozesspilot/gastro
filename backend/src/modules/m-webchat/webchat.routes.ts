/**
 * T068/T069/Phase C — Web-Chat-Widget: Routen.
 *
 * Zwei ENTKOPPELTE Plugins unter demselben Prefix /api/v1/chat:
 *  - chatStaffRoutes:  Session erzeugen/widerrufen, Chat-Liste, Thread lesen,
 *    antworten. m14StaffAuthHook + m14TenantContextHook (Mitarbeiter wählt den
 *    Tenant per x-pp-tenant-id).
 *  - chatPublicRoutes: vom Wirt genutzte Endpoints. KEIN Staff-Cookie — der
 *    Magic-Link-Token (192 Bit) IST die Credential. Tenant wird intern aus der
 *    Session aufgelöst (SECURITY-DEFINER-Lookup).
 *
 * Fastify-Encapsulation: addHook im Staff-Plugin leakt NICHT ins Public-Plugin.
 * Statische Routen (/sessions…) haben Vorrang vor der parametrischen /:token.
 */
import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { chatEventsHandler } from './handlers/chat-events.handler';
import { chatUploadHandler } from './handlers/chat-upload.handler';
import { createChatSessionHandler } from './handlers/create-session.handler';
import { getChatSessionHandler } from './handlers/get-session.handler';
import { listChatsHandler } from './handlers/list-chats.handler';
import { listMessagesHandler } from './handlers/list-messages.handler';
import { revokeChatSessionHandler } from './handlers/revoke-session.handler';
import { sendMessageHandler } from './handlers/send-message.handler';
import { staffReplyHandler } from './handlers/staff-reply.handler';
import { staffThreadHandler } from './handlers/staff-thread.handler';

// Explizites Per-Route-Rate-Limiting (zusätzlich zum globalen 100/min aus app.ts).
// Greift nur mit @fastify/rate-limit (Prod; im Test ignoriert). Verhindert zugleich
// den CodeQL-Missing-Rate-Limiting-Alert (Memory codeql-missing-rate-limiting).
const RL = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
// Beleg-Upload großzügiger: der Wirt schickt evtl. mehrere Fotos am Stück.
const RL_UPLOAD = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

/** Staff-Endpoints (JWT-Cookie + Tenant-Context). */
export async function chatStaffRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.post('/sessions', RL, createChatSessionHandler);
  app.get('/sessions', RL, listChatsHandler);
  app.post<{ Params: { id: string } }>('/sessions/:id/revoke', RL, revokeChatSessionHandler);
  app.get<{ Params: { id: string } }>('/sessions/:id/messages', RL, staffThreadHandler);
  app.post<{ Params: { id: string } }>('/sessions/:id/reply', RL, staffReplyHandler);
}

/** Öffentliche Chat-Endpoints (Token = Credential, kein Staff-Cookie). */
export async function chatPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>('/:token', RL, getChatSessionHandler);
  app.post<{ Params: { token: string } }>('/:token/messages', RL, sendMessageHandler);
  app.get<{ Params: { token: string } }>('/:token/messages', RL, listMessagesHandler);
  app.get<{ Params: { token: string } }>('/:token/events', RL, chatEventsHandler);
  app.post<{ Params: { token: string } }>('/:token/belege', RL_UPLOAD, chatUploadHandler);
}
