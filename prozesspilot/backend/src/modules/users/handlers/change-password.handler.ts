import type { FastifyReply, FastifyRequest } from 'fastify';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../../../core/auth/password';
import { AuthEventLogger } from '../services/auth-event.logger';
import { RefreshTokenRepository } from '../services/refresh-token.repository';
import { UserRepository } from '../services/user.repository';
import { ChangePasswordSchema } from '../schemas/login.schema';

export async function changePasswordHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.authUser) {
    await reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
    return;
  }
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    await reply.code(400).send({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Aktuelles + neues Passwort erforderlich' },
    });
    return;
  }
  const strength = validatePasswordStrength(parsed.data.new_password);
  if (!strength.ok) {
    await reply.code(400).send({
      ok: false,
      error: { code: 'WEAK_PASSWORD', message: strength.reason ?? 'Passwort zu schwach' },
    });
    return;
  }

  const pool = req.server.db;
  const users = new UserRepository(pool);
  const user = await users.findById(req.authUser.sub);
  if (!user) {
    await reply.code(401).send({ ok: false, error: { code: 'USER_GONE', message: 'User nicht aktiv' } });
    return;
  }

  const ok = await verifyPassword(parsed.data.current_password, user.password_hash);
  if (!ok) {
    await reply.code(401).send({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Aktuelles Passwort falsch' },
    });
    return;
  }

  const newHash = await hashPassword(parsed.data.new_password);
  await users.update(user.id, { passwordHash: newHash, passwordMustChange: false });

  // Sicherheit: alle anderen Sessions invalidieren (außer ggf. die aktuelle —
  // aber Cookie wird beim Refresh ohnehin rotiert, daher: alle revoken).
  const refreshTokens = new RefreshTokenRepository(pool);
  await refreshTokens.revokeAllForUser(user.id, 'password_changed');

  await new AuthEventLogger(pool).log({
    userId: user.id,
    tenantId: user.tenant_id,
    eventType: 'password_changed',
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  });

  await reply.code(200).send({ ok: true, data: { password_changed: true } });
}
