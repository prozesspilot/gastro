import type { FastifyReply, FastifyRequest } from 'fastify';
import { publicUserView } from '../services/auth.service';
import { UserRepository } from '../services/user.repository';

export async function getUserHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  if (!req.authUser) {
    await reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
    return;
  }
  const repo = new UserRepository(req.server.db);
  const user = await repo.findById(req.params.id);
  if (!user) {
    await reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User nicht gefunden' } });
    return;
  }
  // Tenant-Isolation: Tenant-Admin sieht keine User aus anderen Tenants.
  const isSuperAdmin = req.authUser.tenant_id === null;
  if (!isSuperAdmin && user.tenant_id !== req.authUser.tenant_id) {
    await reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User nicht gefunden' } });
    return;
  }
  await reply.code(200).send({ ok: true, data: { user: publicUserView(user) } });
}
