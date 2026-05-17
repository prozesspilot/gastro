import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hashPassword, validatePasswordStrength } from '../../../core/auth/password';
import { AuthEventLogger } from '../services/auth-event.logger';
import { publicUserView } from '../services/auth.service';
import { RefreshTokenRepository } from '../services/refresh-token.repository';
import { UserRepository } from '../services/user.repository';
import { ResetPasswordSchema } from '../schemas/user.schema';

export async function resetUserPasswordHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  if (!req.authUser) {
    await reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
    return;
  }
  const parsed = ResetPasswordSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    await reply.code(400).send({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: parsed.error.message },
    });
    return;
  }

  const repo = new UserRepository(req.server.db);
  const target = await repo.findById(req.params.id);
  if (!target) {
    await reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User nicht gefunden' } });
    return;
  }
  const isSuperAdminCaller = req.authUser.tenant_id === null;
  if (!isSuperAdminCaller && target.tenant_id !== req.authUser.tenant_id) {
    await reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User nicht gefunden' } });
    return;
  }

  const tempPassword = parsed.data.temporary_password ?? randomBytes(16).toString('base64url').slice(0, 18);
  const strength = validatePasswordStrength(tempPassword);
  if (!strength.ok) {
    await reply.code(400).send({
      ok: false,
      error: { code: 'WEAK_PASSWORD', message: strength.reason ?? 'Passwort zu schwach' },
    });
    return;
  }
  const passwordHash = await hashPassword(tempPassword);
  const updated = await repo.update(target.id, {
    passwordHash,
    passwordMustChange: true,
    failedAttempts: 0,
    lockedUntil: null,
  });
  // Alle Sessions beenden
  await new RefreshTokenRepository(req.server.db).revokeAllForUser(target.id, 'admin_revoke');
  await new AuthEventLogger(req.server.db).log({
    userId: req.authUser.sub,
    tenantId: req.authUser.tenant_id,
    eventType: 'password_changed',
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    details: { target_user_id: target.id, by_admin: true },
  });
  await reply.code(200).send({
    ok: true,
    data: {
      user: updated ? publicUserView(updated) : null,
      temporary_password: tempPassword,
    },
  });
}
