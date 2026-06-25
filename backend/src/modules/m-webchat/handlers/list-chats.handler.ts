/**
 * T069 — GET /api/v1/chat/sessions  (Staff)
 *
 * Liste der Chat-Sessions des aktuell gewählten Tenants (x-pp-tenant-id) mit
 * Zähler-Metadaten (last_message_at, unread_count). Auth: m14StaffAuthHook +
 * m14TenantContextHook (von webchat.routes.ts).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { listChatsForStaff } from '../services/webchat.repository';

export async function listChatsHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  const chats = await listChatsForStaff(req.server.db, tenantId);
  return reply.send({ chats });
}
