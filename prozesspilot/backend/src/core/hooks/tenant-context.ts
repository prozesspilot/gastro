/**
 * D5 — Tenant-Kontext-Hook
 *
 * Liest die Mandanten-UUID aus dem Header x-pp-tenant-id und macht sie
 * als req.tenantId verfügbar. Alle /api/v1-Routen müssen diesen Header senden.
 *
 * In einer späteren Phase (nach D3-Erweiterung) wird die Tenant-ID direkt
 * aus dem HMAC-API-Key abgeleitet — dieser Header entfällt dann.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

// Typerweiterung für req.tenantId
declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

export async function tenantContextHook(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const raw = req.headers['x-pp-tenant-id'];
  const tenantId = Array.isArray(raw) ? raw[0] : raw;

  const parsed = uuidSchema.safeParse(tenantId);
  if (!parsed.success) {
    await reply.code(400).send({
      ok: false,
      error: {
        code:    'MISSING_TENANT',
        message: 'Header x-pp-tenant-id muss eine gültige UUID enthalten.',
      },
    });
    return;
  }

  req.tenantId = parsed.data;
}
