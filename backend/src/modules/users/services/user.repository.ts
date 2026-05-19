/**
 * M14 — User-Repository (pg, kein ORM)
 *
 * RLS-Hinweis: Wir setzen `app.current_setting('pp.tenant_id', true)` NICHT
 * pauschal, weil Login + super_admin tenant-übergreifend arbeiten müssen.
 * Wo Tenant-Isolation nötig ist, filtern wir explizit per WHERE-Clause.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface UserRow {
  id: string;
  tenant_id: string | null;
  email: string;
  email_lower: string;
  display_name: string;
  password_hash: string;
  password_must_change: boolean;
  permissions: string[];
  preset: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  failed_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

export function newUserId(): string {
  return `usr_${randomUUID()}`;
}

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(emailLower: string, tenantId: string | null): Promise<UserRow | null> {
    // Bei null tenantId wird sowohl nach exakt-null gesucht (super_admin) als
    // auch nach allen Tenants (Login probiert beide Pfade über findByEmailAnyTenant).
    const sql = tenantId
      ? 'SELECT * FROM users WHERE email_lower = $1 AND tenant_id = $2 LIMIT 1'
      : 'SELECT * FROM users WHERE email_lower = $1 AND tenant_id IS NULL LIMIT 1';
    const params = tenantId ? [emailLower, tenantId] : [emailLower];
    const res = await this.pool.query<UserRow>(sql, params);
    return res.rows[0] ?? null;
  }

  /** Login: über alle Tenants suchen (super_admin + Tenant-User). */
  async findByEmailAnyTenant(emailLower: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserRow>(
      'SELECT * FROM users WHERE email_lower = $1 ORDER BY tenant_id NULLS FIRST LIMIT 1',
      [emailLower],
    );
    return res.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserRow>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return res.rows[0] ?? null;
  }

  async listByTenant(tenantId: string | null): Promise<UserRow[]> {
    const sql = tenantId
      ? 'SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM users ORDER BY tenant_id NULLS FIRST, created_at DESC';
    const params = tenantId ? [tenantId] : [];
    const res = await this.pool.query<UserRow>(sql, params);
    return res.rows;
  }

  async create(input: {
    id: string;
    tenantId: string | null;
    email: string;
    displayName: string;
    passwordHash: string;
    passwordMustChange: boolean;
    permissions: string[];
    preset: string | null;
    createdBy: string | null;
  }): Promise<UserRow> {
    const res = await this.pool.query<UserRow>(
      `INSERT INTO users (
        id, tenant_id, email, email_lower, display_name, password_hash,
        password_must_change, permissions, preset, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
      RETURNING *`,
      [
        input.id,
        input.tenantId,
        input.email,
        input.email.toLowerCase(),
        input.displayName,
        input.passwordHash,
        input.passwordMustChange,
        JSON.stringify(input.permissions),
        input.preset,
        input.createdBy,
      ],
    );
    return res.rows[0];
  }

  async update(
    id: string,
    patch: Partial<{
      displayName: string;
      preset: string | null;
      permissions: string[];
      isActive: boolean;
      passwordHash: string;
      passwordMustChange: boolean;
      failedAttempts: number;
      lockedUntil: Date | null;
      lastLoginAt: Date | null;
    }>,
  ): Promise<UserRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (patch.displayName !== undefined) {
      sets.push(`display_name = $${idx++}`);
      params.push(patch.displayName);
    }
    if (patch.preset !== undefined) {
      sets.push(`preset = $${idx++}`);
      params.push(patch.preset);
    }
    if (patch.permissions !== undefined) {
      sets.push(`permissions = $${idx++}::jsonb`);
      params.push(JSON.stringify(patch.permissions));
    }
    if (patch.isActive !== undefined) {
      sets.push(`is_active = $${idx++}`);
      params.push(patch.isActive);
    }
    if (patch.passwordHash !== undefined) {
      sets.push(`password_hash = $${idx++}`);
      params.push(patch.passwordHash);
    }
    if (patch.passwordMustChange !== undefined) {
      sets.push(`password_must_change = $${idx++}`);
      params.push(patch.passwordMustChange);
    }
    if (patch.failedAttempts !== undefined) {
      sets.push(`failed_attempts = $${idx++}`);
      params.push(patch.failedAttempts);
    }
    if (patch.lockedUntil !== undefined) {
      sets.push(`locked_until = $${idx++}`);
      params.push(patch.lockedUntil);
    }
    if (patch.lastLoginAt !== undefined) {
      sets.push(`last_login_at = $${idx++}`);
      params.push(patch.lastLoginAt);
    }
    if (sets.length === 0) {
      return this.findById(id);
    }
    sets.push('updated_at = now()');
    params.push(id);
    const res = await this.pool.query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return res.rows[0] ?? null;
  }

  /** Soft-Delete: nur is_active=false. Echtes Löschen passiert via CASCADE bei Tenant-Drop. */
  async softDelete(id: string): Promise<UserRow | null> {
    return this.update(id, { isActive: false });
  }

  async countSuperAdmins(): Promise<number> {
    const res = await this.pool.query<{ c: string }>(
      'SELECT count(*)::text AS c FROM users WHERE tenant_id IS NULL AND is_active = true',
    );
    return Number(res.rows[0]?.c ?? '0');
  }
}
