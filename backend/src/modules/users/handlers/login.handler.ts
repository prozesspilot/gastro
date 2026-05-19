import type { FastifyReply, FastifyRequest } from 'fastify';
import { LoginSchema } from '../schemas/login.schema';
import { AuthEventLogger } from '../services/auth-event.logger';
import { AuthService, publicUserView } from '../services/auth.service';
import { setRefreshCookie } from '../services/cookie.helper';
import { RefreshTokenRepository } from '../services/refresh-token.repository';
import { UserRepository } from '../services/user.repository';

export async function loginHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    await reply.code(400).send({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Email + Passwort erforderlich' },
    });
    return;
  }

  const pool = req.server.db;
  const service = new AuthService(
    new UserRepository(pool),
    new RefreshTokenRepository(pool),
    new AuthEventLogger(pool),
  );

  const result = await service.login({
    email: parsed.data.email,
    password: parsed.data.password,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  });

  if (!result.ok) {
    // Spec §6.2: OWASP-konform generischer Fehler. Lock-Status mit 423 raussignalisieren,
    // damit das Frontend ggf. "Konto gesperrt" zeigen kann.
    if (result.code === 'LOCKED') {
      await reply.code(423).send({
        ok: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Konto vorübergehend gesperrt',
          details: { unlock_at: result.unlockAt },
        },
      });
      return;
    }
    await reply.code(401).send({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Login fehlgeschlagen' },
    });
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
