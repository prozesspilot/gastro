/**
 * M14 — Refresh-Token-Repository
 *
 * Spec §5.5: Token-Rotation mit Replay-Detection. Bei Refresh wird der alte
 * Token revoked, ein neuer in derselben family_id ausgestellt. Wer einen
 * bereits revoked Token einreicht → alle Tokens dieser Familie revoken.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  issued_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
  user_agent: string | null;
  ip_address: string | null;
}

export function newRefreshTokenId(): string {
  return `rft_${randomUUID()}`;
}

export function newFamilyId(): string {
  return `fam_${randomUUID()}`;
}

export function generateRefreshTokenPlain(): string {
  // 64 Bytes = 512 Bit, base64url-codiert ≈ 86 Zeichen
  return randomBytes(64).toString('base64url');
}

export function hashRefreshToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export class RefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: {
    userId: string;
    plainToken: string;
    familyId: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<RefreshTokenRow> {
    const id = newRefreshTokenId();
    const tokenHash = hashRefreshToken(input.plainToken);
    const res = await this.pool.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (
        id, user_id, token_hash, family_id, expires_at, user_agent, ip_address
      ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        id,
        input.userId,
        tokenHash,
        input.familyId,
        input.expiresAt,
        input.userAgent,
        input.ipAddress,
      ],
    );
    return res.rows[0];
  }

  async findByPlainToken(plain: string): Promise<RefreshTokenRow | null> {
    const hash = hashRefreshToken(plain);
    const res = await this.pool.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`,
      [hash],
    );
    return res.rows[0] ?? null;
  }

  async revoke(id: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoke_reason = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [id, reason],
    );
  }

  async revokeFamily(familyId: string, reason: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoke_reason = $2
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId, reason],
    );
    return res.rowCount ?? 0;
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoke_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason],
    );
    return res.rowCount ?? 0;
  }
}
