/**
 * M01 — Belege-Routen
 *
 * Registrierung in app.ts VOR dem HMAC-Block:
 *   await app.register(belegeRoutes, { prefix: '/api/v1/belege' });
 *
 * Endpoints:
 *   POST /api/v1/belege/upload      — Multipart-Upload
 *   GET  /api/v1/belege             — Paginierte Liste
 *   GET  /api/v1/belege/:id         — Detail + Signed-URL
 *
 * Auth: M14-JWT-Cookie (pp_auth) auf allen Routen.
 * Tenant-Isolation: X-PP-Tenant-ID Header (Pflicht).
 *
 * DECISION: Separates Plugin (nicht in m01ReceiptIntakeRoutes), weil:
 *   1. m01ReceiptIntakeRoutes ist HMAC-geschützt (alt-API für n8n)
 *   2. Belege-Routes sind JWT-geschützt (Mitarbeiter-Webapp)
 *   3. Prefix ist /api/v1/belege, nicht /api/v1/receipts
 *
 * M7: m14TenantContextHook als preHandler registriert — löst Duplikation in
 *   den drei Handlern auf. Handler lesen req.tenantId! statt Header zu parsen.
 */

import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
import { detailHandler } from './handlers/detail.handler';
import { listHandler } from './handlers/list.handler';
import { uploadHandler } from './handlers/upload.handler';

export async function belegeRoutes(app: FastifyInstance): Promise<void> {
  // Alle Routen: Auth-Check + Tenant-Context (reihenfolge: Auth zuerst, dann Tenant)
  app.addHook('preHandler', m14StaffAuthHook);
  app.addHook('preHandler', m14TenantContextHook);

  // Multipart-Upload
  // DECISION: content-type-Parser für multipart ist global in app.ts registriert.
  // Rate-Limit: 30 Uploads pro Minute pro IP (Pilot: 1 Tenant, 100 Belege/Monat).
  app.post('/upload', uploadHandler);

  // Liste (paginiert, optional gefiltert nach status)
  app.get('/', listHandler);

  // Detail + Signed-URL
  app.get('/:id', detailHandler);
}
