import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthEventLogger } from '../services/auth-event.logger';
import { AuthService } from '../services/auth.service';
import { clearRefreshCookie, getRefreshCookie } from '../services/cookie.helper';
import { RefreshTokenRepository } from '../services/refresh-token.repository';
import { UserRepository } from '../services/user.repository';

export async function logoutHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const pool = req.server.db;
  const service = new AuthService(
    new UserRepository(pool),
    new RefreshTokenRepository(pool),
    new AuthEventLogger(pool),
  );

  await service.logout({
    plainToken: getRefreshCookie(req),
    userId: req.authUser?.sub ?? null,
    tenantId: req.authUser?.tenant_id ?? null,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  });

  clearRefreshCookie(reply);
  await reply.code(200).send({ ok: true, data: { logged_out: true } });
}
