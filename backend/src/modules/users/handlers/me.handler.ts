import type { FastifyReply, FastifyRequest } from 'fastify';
import { publicUserView } from '../services/auth.service';
import { UserRepository } from '../services/user.repository';

export async function meHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.authUser) {
    await reply
      .code(401)
      .send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
    return;
  }
  const repo = new UserRepository(req.server.db);
  const user = await repo.findById(req.authUser.sub);
  if (!user || !user.is_active) {
    await reply
      .code(401)
      .send({ ok: false, error: { code: 'USER_GONE', message: 'User nicht aktiv' } });
    return;
  }
  await reply.code(200).send({ ok: true, data: { user: publicUserView(user) } });
}
