import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthEventLogger } from '../services/auth-event.logger';
import { publicUserView } from '../services/auth.service';
import { RefreshTokenRepository } from '../services/refresh-token.repository';
import { UserRepository } from '../services/user.repository';

export async function deleteUserHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  if (!req.authUser) {
    await reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
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
  // Schutz: letzten super_admin schützen
  if (target.tenant_id === null && target.is_active) {
    const remaining = await repo.countSuperAdmins();
    if (remaining <= 1) {
      await reply.code(409).send({
        ok: false,
        error: { code: 'LAST_SUPER_ADMIN', message: 'Letzter aktiver super_admin kann nicht deaktiviert werden' },
      });
      return;
    }
  }
  // Schutz: nicht sich selbst löschen
  if (target.id === req.authUser.sub) {
    await reply.code(409).send({
      ok: false,
      error: { code: 'SELF_DELETE', message: 'Self-Delete nicht erlaubt' },
    });
    return;
  }

  const updated = await repo.softDelete(target.id);
  // Alle Sessions des deaktivierten Users beenden
  await new RefreshTokenRepository(req.server.db).revokeAllForUser(target.id, 'admin_revoke');
  await new AuthEventLogger(req.server.db).log({
    userId: req.authUser.sub,
    tenantId: req.authUser.tenant_id,
    eventType: 'user_deleted',
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    details: { target_user_id: target.id },
  });
  if (!updated) {
    await reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User nicht gefunden' } });
    return;
  }
  await reply.code(200).send({ ok: true, data: { user: publicUserView(updated) } });
}
