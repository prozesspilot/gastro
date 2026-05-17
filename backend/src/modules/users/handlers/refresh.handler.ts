import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthEventLogger } from '../services/auth-event.logger';
import { AuthService, publicUserView } from '../services/auth.service';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../services/cookie.helper';
import { RefreshTokenRepository } from '../services/refresh-token.repository';
import { UserRepository } from '../services/user.repository';

export async function refreshHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const plain = getRefreshCookie(req);
  if (!plain) {
    await reply.code(401).send({
      ok: false,
      error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh-Cookie fehlt' },
    });
    return;
  }

  const pool = req.server.db;
  const service = new AuthService(
    new UserRepository(pool),
    new RefreshTokenRepository(pool),
    new AuthEventLogger(pool),
  );

  const result = await service.refresh({
    plainToken: plain,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  });

  if (!result.ok) {
    clearRefreshCookie(reply);
    const code = result.code === 'REPLAY' ? 'REPLAY_DETECTED' : 'INVALID_REFRESH';
    await reply.code(401).send({ ok: false, error: { code, message: result.message } });
    return;
  }

  setRefreshCookie(reply, result.refreshPlain);
  await reply.code(200).send({
    ok: true,
    data: {
      access_token: result.accessToken,
      user: publicUserView(result.user),
    },
  });
}
