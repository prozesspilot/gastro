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
import { createSessionHandler } from './handlers/create-session.handler';
import { getSessionHandler } from './handlers/get-session.handler';
import { premiumHandler } from './handlers/premium.handler';
import { saveStepHandler } from './handlers/save-step.handler';

/** Staff-Endpoints (JWT-Cookie + Tenant-Context). */
export async function wizardStaffRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  app.post('/sessions', createSessionHandler);
}

/** Öffentliche Wizard-Endpoints (Token = Credential, kein Staff-Cookie). */
export async function wizardPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>('/:token', getSessionHandler);
  app.post<{ Params: { token: string; n: string } }>('/:token/step/:n', saveStepHandler);
  app.post<{ Params: { token: string } }>('/:token/complete', completeHandler);
  app.post<{ Params: { token: string } }>('/:token/premium', premiumHandler);
}
