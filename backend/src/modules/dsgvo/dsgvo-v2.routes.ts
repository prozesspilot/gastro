/**
 * T010/M12 — Neue DSGVO-Routen unter /api/v1/dsgvo (Two-Step + JWT + Rate-Limit).
 *
 * Liegt parallel zu modules/dsgvo/routes.ts (alt). Die alten Routen bleiben
 * fuer Backwards-Compat erhalten, sind aber als „pre-Reboot" markiert und
 * werden in einer separaten Cleanup-Task aufgeloest.
 *
 * Pfade:
 *   POST /api/v1/dsgvo/auskunft               → Auskunfts-Antrag stellen (gf only)
 *   GET  /api/v1/dsgvo/auskunft/:id           → Status-Check + Signed-URL
 *   POST /api/v1/dsgvo/loeschung              → Loeschungs-Antrag (Two-Step)
 *   POST /api/v1/dsgvo/loeschung/confirm      → Token-Confirm (OEFFENTLICH)
 *
 * Auth-Strategie:
 *   * /auskunft + /auskunft/:id + /loeschung: m14StaffAuthHook + Tenant-Context
 *   * /loeschung/confirm: KEIN Auth (Subject hat keinen Login) — Sicherheit
 *     liegt im Token (Redis, TTL 30min, single-use).
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { auskunftStatusHandler } from './handlers-v2/auskunft-status.handler';
import { auskunftHandler } from './handlers-v2/auskunft.handler';
import { loeschungConfirmHandler } from './handlers-v2/loeschung-confirm.handler';
import { loeschungHandler } from './handlers-v2/loeschung.handler';

export async function dsgvoV2Routes(app: FastifyInstance): Promise<void> {
  // OEFFENTLICHER Endpoint zuerst (KEIN Auth-Hook!)
  app.post('/loeschung/confirm', loeschungConfirmHandler);

  // Geschuetzte Endpoints in eigener Sub-Plugin-Registrierung,
  // damit Hooks nur dort greifen.
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', m14StaffAuthHook);
    protectedApp.addHook('preHandler', m14TenantContextHook);

    protectedApp.post('/auskunft', auskunftHandler);
    protectedApp.get<{ Params: { id: string } }>('/auskunft/:id', auskunftStatusHandler);
    protectedApp.post('/loeschung', loeschungHandler);
  });
}
