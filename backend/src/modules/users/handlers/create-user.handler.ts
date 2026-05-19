import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hashPassword, validatePasswordStrength } from '../../../core/auth/password';
import { presetPermissions, validatePermissionList } from '../../../core/auth/permissions';
import { AuthEventLogger } from '../services/auth-event.logger';
import { newUserId, UserRepository } from '../services/user.repository';
import { publicUserView } from '../services/auth.service';
import { CreateUserSchema } from '../schemas/user.schema';

function generateTempPassword(): string {
  // 16 Zeichen base64url ≈ 21 Bytes Entropie → > 128 Bit
  return randomBytes(16).toString('base64url').slice(0, 18);
}

export async function createUserHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.authUser) {
    await reply
      .code(401)
      .send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Kein Auth-Kontext' } });
    return;
  }
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    await reply.code(400).send({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: parsed.error.message },
    });
    return;
  }
  const input = parsed.data;
  const isSuperAdminCaller = req.authUser.tenant_id === null;

  // Permissions: aus Preset oder Custom-Liste
  let perms: string[];
  if (input.preset === 'custom') {
    if (!input.permissions || input.permissions.length === 0) {
      await reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'permissions Pflicht bei preset=custom' },
      });
      return;
    }
    const v = validatePermissionList(input.permissions);
    if (!v.ok) {
      await reply
        .code(400)
        .send({
          ok: false,
          error: { code: 'VALIDATION_FAILED', message: v.reason ?? 'Ungültige Permissions' },
        });
      return;
    }
    perms = input.permissions;
  } else {
    const p = presetPermissions(input.preset);
    if (!p) {
      await reply
        .code(400)
        .send({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Unbekanntes Preset' } });
      return;
    }
    perms = p;
  }

  // Nur super_admin darf super_admins anlegen ("*" oder preset=super_admin)
  const wantsSuperAdmin = input.preset === 'super_admin' || perms.includes('*');
  if (wantsSuperAdmin && !isSuperAdminCaller) {
    await reply.code(403).send({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Nur super_admin darf super_admin anlegen' },
    });
    return;
  }

  // tenant_id-Bestimmung:
  // - super_admin-Caller darf input.tenant_id setzen (null = neuer super_admin).
  // - Tenant-Admin: tenant_id wird auf den eigenen erzwungen.
  let tenantId: string | null;
  if (isSuperAdminCaller) {
    tenantId = wantsSuperAdmin ? null : (input.tenant_id ?? null);
    if (!wantsSuperAdmin && tenantId === null) {
      await reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'tenant_id erforderlich (oder preset=super_admin)',
        },
      });
      return;
    }
  } else {
    tenantId = req.authUser.tenant_id;
  }

  // Passwort: temp generieren wenn nicht angegeben
  const tempPassword = input.temporary_password ?? generateTempPassword();
  const strength = validatePasswordStrength(tempPassword);
  if (!strength.ok) {
    await reply.code(400).send({
      ok: false,
      error: { code: 'WEAK_PASSWORD', message: strength.reason ?? 'Passwort zu schwach' },
    });
    return;
  }
  const passwordHash = await hashPassword(tempPassword);

  const repo = new UserRepository(req.server.db);
  try {
    const created = await repo.create({
      id: newUserId(),
      tenantId,
      email: input.email,
      displayName: input.display_name,
      passwordHash,
      passwordMustChange: true,
      permissions: perms,
      preset: input.preset,
      createdBy: req.authUser.sub,
    });
    await new AuthEventLogger(req.server.db).log({
      userId: req.authUser.sub,
      tenantId: req.authUser.tenant_id,
      eventType: 'user_created',
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      details: { created_user_id: created.id, preset: input.preset },
    });
    await reply.code(201).send({
      ok: true,
      data: {
        user: publicUserView(created),
        temporary_password: tempPassword, // einmalig sichtbar
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DB-Fehler';
    if (msg.includes('idx_users_tenant_email') || msg.toLowerCase().includes('duplicate')) {
      await reply.code(409).send({
        ok: false,
        error: { code: 'EMAIL_TAKEN', message: 'Email existiert bereits in diesem Tenant' },
      });
      return;
    }
    throw err;
  }
}
