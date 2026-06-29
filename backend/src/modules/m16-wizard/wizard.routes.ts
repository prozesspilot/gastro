/**
 * T016/Phase B — Onboarding-Wizard: Routen.
 *
 * Zwei ENTKOPPELTE Plugins unter demselben Prefix /api/v1/wizard:
 *  - wizardStaffRoutes:  staff-getriggerte Session-Erstellung. m14StaffAuthHook
 *    + m14TenantContextHook (der Mitarbeiter wählt den Tenant per x-pp-tenant-id).
 *  - wizardPublicRoutes: vom Wirt genutzte Endpoints. KEIN Staff-Cookie —
 *    der Magic-Link-Token (192 Bit) IST die Credential. Tenant wird intern aus
 *    der Session aufgelöst (SECURITY-DEFINER-Lookup).
 *
 * Fastify-Encapsulation: addHook im Staff-Plugin leakt NICHT ins Public-Plugin,
 * weil jedes app.register einen eigenen Encapsulation-Context bildet.
 */
import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { completeHandler } from './handlers/complete.handler';
import { connectLexwareHandler } from './handlers/connect-lexware.handler';
import { connectSumupHandler } from './handlers/connect-sumup.handler';
import { createSessionHandler } from './handlers/create-session.handler';
import { getSessionHandler } from './handlers/get-session.handler';
import { premiumHandler } from './handlers/premium.handler';
import { saveStepHandler } from './handlers/save-step.handler';

// T067: explizites Per-Route-Rate-Limiting (zusätzlich zum globalen 100/min aus
// app.ts). Die öffentliche Token-Brücke + Staff-Session-Erstellung sind sensibel
// (DB-Writes, externe OAuth-/Mail-Trigger); 30/min ist für legitime Nutzung
// (7-Schritt-Flow) großzügig und blockt Abuse. Greift nur, wenn @fastify/rate-limit
// registriert ist (Prod; im Test ignoriert).
const RL = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

/** Staff-Endpoints (JWT-Cookie + Tenant-Context). */
export async function wizardStaffRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.post('/sessions', RL, createSessionHandler);
}

/** Öffentliche Wizard-Endpoints (Token = Credential, kein Staff-Cookie). */
export async function wizardPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>('/:token', RL, getSessionHandler);
  app.post<{ Params: { token: string; n: string } }>('/:token/step/:n', RL, saveStepHandler);
  app.post<{ Params: { token: string } }>('/:token/complete', RL, completeHandler);
  app.post<{ Params: { token: string } }>('/:token/premium', RL, premiumHandler);
  // T067: öffentliche SumUp-OAuth-Brücke (Wizard-Schritt 6).
  app.post<{ Params: { token: string } }>('/:token/oauth/sumup/start', RL, connectSumupHandler);
  // T084: Lexware-Office-API-Key hinterlegen (Wizard-Schritt 3). Kein OAuth (Lexware
  // hat keins) — direkter API-Key-Eintrag mit Live-Check.
  app.post<{ Params: { token: string } }>('/:token/connect/lexware', RL, connectLexwareHandler);
}
