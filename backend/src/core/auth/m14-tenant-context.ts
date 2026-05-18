/**
 * M14 Tenant-Context Hook (M7)
 *
 * Fastify preHandler-Hook: liest X-PP-Tenant-ID aus dem Request-Header,
 * validiert Format (UUID) und setzt `req.tenantId` für alle nachfolgenden
 * Handler.
 *
 * Verwendung in belege.routes.ts (und anderen Staff-Routen):
 *   import { m14TenantContextHook } from '../../core/auth/m14-tenant-context';
 *   app.addHook('preHandler', m14TenantContextHook);
 *
 * DECISION: Eigener Hook statt inline-Duplikation in 3 Handlern.
 * req.tenantId wird via Module-Augmentation (unten) in den FastifyRequest-Typ gemischt.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

// ── Module-Augmentation ────────────────────────────────────────────────────
// DECISION: tenant-context.ts (D5/HMAC-Routes) deklariert tenantId: string (required).
// Dieser Hook ist für JWT-Auth-Routen (m01 belege.routes.ts). Wir nutzen dieselbe
// Deklaration aus tenant-context.ts — keine erneute Augmentation nötig.
// tenantId wird nach dem Hook immer gesetzt (required), Handler verwenden req.tenantId!

// ── Konstanten ─────────────────────────────────────────────────────────────

const TENANT_HEADER = 'x-pp-tenant-id' as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fastify preHandler-Hook: validiert X-PP-Tenant-ID + setzt req.tenantId.
 * Muss NACH m14StaffAuthHook eingehängt werden.
 */
export async function m14TenantContextHook(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const headerValue = req.headers[TENANT_HEADER];

  if (!headerValue || typeof headerValue !== 'string') {
    return reply.code(400).send({
      error: 'missing_tenant_header',
      message: `Header ${TENANT_HEADER} fehlt oder ist kein String`,
    });
  }

  if (!UUID_PATTERN.test(headerValue)) {
    return reply.code(400).send({
      error: 'invalid_tenant_header',
      message: 'X-PP-Tenant-ID muss eine gültige UUID (Version 4) sein',
    });
  }

  req.tenantId = headerValue;
}
