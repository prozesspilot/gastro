import type { FastifyReply, FastifyRequest } from 'fastify';
import { publicUserView } from '../services/auth.service';
import { UserRepository } from '../services/user.repository';

export async function listUsersHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.authUser) {
    await reply
      .code(401)
      .send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
    return;
  }
  const repo = new UserRepository(req.server.db);
  // super_admin (tenant_id null + permissions *) sieht alle.
  const isSuperAdmin = req.authUser.tenant_id === null;
  const users = await repo.listByTenant(isSuperAdmin ? null : req.authUser.tenant_id);
  await reply.code(200).send({
    ok: true,
    data: { users: users.map(publicUserView) },
  });
}
