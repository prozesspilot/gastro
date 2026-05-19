/**
 * M14 — Auth-Service: zentrale Geschäftslogik für Login, Refresh, Logout.
 * Wird von den Handlern verwendet, getrennt von HTTP-Concerns.
 */

import type { Pool } from 'pg';
import { signAccessToken } from '../../../core/auth/jwt';
import { verifyPassword } from '../../../core/auth/password';
import { config } from '../../../core/config';
import { AuthEventLogger } from './auth-event.logger';
import { isCurrentlyLocked, registerFailedLogin, resetOnSuccess } from './lockout.service';
import {
  generateRefreshTokenPlain,
  newFamilyId,
  RefreshTokenRepository,
  type RefreshTokenRow,
} from './refresh-token.repository';
import { UserRepository, type UserRow } from './user.repository';

export interface LoginContext {
  email: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export type LoginResult =
  | {
      ok: true;
      accessToken: string;
      refreshPlain: string;
      user: UserRow;
    }
  | {
      ok: false;
      code: 'INVALID_CREDENTIALS' | 'LOCKED' | 'DISABLED';
      message: string;
      unlockAt?: Date;
    };

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly events: AuthEventLogger,
  ) {}

  async login(ctx: LoginContext): Promise<LoginResult> {
    const emailLower = ctx.email.toLowerCase();
    const user = await this.users.findByEmailAnyTenant(emailLower);

    if (!user) {
      await this.events.log({
        userId: null,
        tenantId: null,
        eventType: 'login_failed',
        emailAttempted: emailLower,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        details: { reason: 'unknown_user' },
      });
      return { ok: false, code: 'INVALID_CREDENTIALS', message: 'Login fehlgeschlagen' };
    }

    if (!user.is_active) {
      await this.events.log({
        userId: user.id,
        tenantId: user.tenant_id,
        eventType: 'login_failed',
        emailAttempted: emailLower,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        details: { reason: 'disabled' },
      });
      return { ok: false, code: 'DISABLED', message: 'Login fehlgeschlagen' };
    }

    const lockState = isCurrentlyLocked({
      failedAttempts: user.failed_attempts,
      lockedUntil: user.locked_until,
    });
    if (lockState.isLocked) {
      await this.events.log({
        userId: user.id,
        tenantId: user.tenant_id,
        eventType: 'login_failed',
        emailAttempted: emailLower,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        details: { reason: 'locked', unlock_at: lockState.unlockAt },
      });
      return {
        ok: false,
        code: 'LOCKED',
        message: 'Konto vorübergehend gesperrt',
        unlockAt: lockState.unlockAt ?? undefined,
      };
    }

    const passOk = await verifyPassword(ctx.password, user.password_hash);
    if (!passOk) {
      const next = registerFailedLogin({
        failedAttempts: user.failed_attempts,
        lockedUntil: user.locked_until,
      });
      await this.users.update(user.id, {
        failedAttempts: next.nextFailedAttempts,
        lockedUntil: next.nextLockedUntil,
      });
      await this.events.log({
        userId: user.id,
        tenantId: user.tenant_id,
        eventType: next.justLocked ? 'account_locked' : 'login_failed',
        emailAttempted: emailLower,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        details: { failed_attempts: next.nextFailedAttempts, locked_until: next.nextLockedUntil },
      });
      return { ok: false, code: 'INVALID_CREDENTIALS', message: 'Login fehlgeschlagen' };
    }

    // Erfolgreich
    const reset = resetOnSuccess();
    await this.users.update(user.id, {
      failedAttempts: reset.failedAttempts,
      lockedUntil: reset.lockedUntil,
      lastLoginAt: new Date(),
    });

    const accessToken = signAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      permissions: user.permissions,
      preset: user.preset,
    });

    const refreshPlain = generateRefreshTokenPlain();
    const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL_SECONDS * 1000);
    await this.refreshTokens.create({
      userId: user.id,
      plainToken: refreshPlain,
      familyId: newFamilyId(),
      expiresAt,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    });

    await this.events.log({
      userId: user.id,
      tenantId: user.tenant_id,
      eventType: 'login_success',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { ok: true, accessToken, refreshPlain, user };
  }

  async refresh(ctx: {
    plainToken: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<
    | { ok: true; accessToken: string; refreshPlain: string; user: UserRow }
    | { ok: false; code: 'INVALID' | 'EXPIRED' | 'REPLAY' | 'USER_GONE'; message: string }
  > {
    const row = await this.refreshTokens.findByPlainToken(ctx.plainToken);
    if (!row) {
      return { ok: false, code: 'INVALID', message: 'Refresh-Token unbekannt' };
    }

    // Replay-Detection: bereits revoked? → ALLE Tokens der Familie revoken.
    if (row.revoked_at !== null) {
      await this.refreshTokens.revokeFamily(row.family_id, 'replay_detected');
      await this.events.log({
        userId: row.user_id,
        tenantId: null,
        eventType: 'refresh_replay_detected',
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        details: { family_id: row.family_id },
      });
      return { ok: false, code: 'REPLAY', message: 'Replay erkannt — Session beendet' };
    }

    if (row.expires_at <= new Date()) {
      return { ok: false, code: 'EXPIRED', message: 'Refresh-Token abgelaufen' };
    }

    const user = await this.users.findById(row.user_id);
    if (!user || !user.is_active) {
      await this.refreshTokens.revoke(row.id, 'user_gone');
      return { ok: false, code: 'USER_GONE', message: 'User nicht aktiv' };
    }

    // Alte Token revoken, neue ausstellen (gleiche family_id).
    await this.refreshTokens.revoke(row.id, 'rotation');

    const newPlain = generateRefreshTokenPlain();
    const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL_SECONDS * 1000);
    await this.refreshTokens.create({
      userId: user.id,
      plainToken: newPlain,
      familyId: row.family_id,
      expiresAt,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    });

    const accessToken = signAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      permissions: user.permissions,
      preset: user.preset,
    });

    return { ok: true, accessToken, refreshPlain: newPlain, user };
  }

  async logout(ctx: {
    plainToken: string | null;
    userId: string | null;
    tenantId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    if (ctx.plainToken) {
      const row = await this.refreshTokens.findByPlainToken(ctx.plainToken);
      if (row && row.revoked_at === null) {
        await this.refreshTokens.revoke(row.id, 'logout');
      }
    }
    if (ctx.userId) {
      await this.events.log({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        eventType: 'logout',
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }
  }
}

export function publicUserView(user: UserRow): {
  id: string;
  email: string;
  display_name: string;
  tenant_id: string | null;
  permissions: string[];
  preset: string | null;
  is_active: boolean;
  password_must_change: boolean;
  last_login_at: Date | null;
  created_at: Date;
} {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    tenant_id: user.tenant_id,
    permissions: user.permissions,
    preset: user.preset,
    is_active: user.is_active,
    password_must_change: user.password_must_change,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
  };
}
