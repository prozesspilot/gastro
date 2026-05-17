import type { FastifyReply, FastifyRequest } from 'fastify';
import { presetPermissions, validatePermissionList } from '../../../core/auth/permissions';
import { AuthEventLogger } from '../services/auth-event.logger';
import { publicUserView } from '../services/auth.service';
import { UserRepository } from '../services/user.repository';
import { UpdateUserSchema } from '../schemas/user.schema';

export async function updateUserHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  if (!req.authUser) {
    await reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
    return;
  }
  const parsed = UpdateUserSchema.safeParse(req.body);
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

  const patch: Parameters<UserRepository['update']>[1] = {};
  if (parsed.data.display_name !== undefined) patch.displayName = parsed.data.display_name;
  if (parsed.data.is_active !== undefined) patch.isActive = parsed.data.is_active;
  if (parsed.data.locked_until === null) patch.lockedUntil = null;
  if (parsed.data.failed_attempts === 0) patch.failedAttempts = 0;

  if (parsed.data.preset !== undefined) {
    patch.preset = parsed.data.preset;
    if (parsed.data.preset !== 'custom') {
      const p = presetPermissions(parsed.data.preset);
      if (!p) {
        await reply.code(400).send({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Unbekanntes Preset' } });
        return;
      }
      patch.permissions = p;
    }
  }
  if (parsed.data.permissions !== undefined) {
    const v = validatePermissionList(parsed.data.permissions);
    if (!v.ok) {
      await reply.code(400).send({ ok: false, error: { code: 'VALIDATION_FAILED', message: v.reason ?? 'Ungültige Permissions' } });
      return;
    }
    // Wildcard "*" nur durch super_admin-Caller
    if (parsed.data.permissions.includes('*') && !isSuperAdminCaller) {
      await reply.code(403).send({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Nur super_admin darf "*" vergeben' },
      });
      return;
    }
    patch.permissions = parsed.data.permissions;
  }

  // Schutz: super_admin darf sich nicht selbst deaktivieren wenn er der letzte ist.
  if (target.tenant_id === null && patch.isActive === false) {
    const remaining = await repo.countSuperAdmins();
    if (remaining <= 1 && target.is_active) {
      await reply.code(409).send({
        ok: false,
        error: { code: 'LAST_SUPER_ADMIN', message: 'Letzter aktiver super_admin kann nicht deaktiviert werden' },
      });
      return;
    }
  }

  const updated = await repo.update(target.id, patch);
  if (!updated) {
    await reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User nicht gefunden' } });
    return;
  }
  await new AuthEventLogger(req.server.db).log({
    userId: req.authUser.sub,
    tenantId: req.authUser.tenant_id,
    eventType: 'user_updated',
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    details: { target_user_id: updated.id },
  });
  await reply.code(200).send({ ok: true, data: { user: publicUserView(updated) } });
}
