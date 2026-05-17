/**
 * M14 — Auth-Event-Logger
 * Schreibt in auth_events. Niemals Klartext-Passwort speichern.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type AuthEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_changed'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'permission_denied'
  | 'account_locked'
  | 'refresh_replay_detected'
  | 'token_revoked';

export interface LogAuthEventInput {
  userId: string | null;
  tenantId: string | null;
  eventType: AuthEventType;
  emailAttempted?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown> | null;
}

export class AuthEventLogger {
  constructor(private readonly pool: Pool) {}

  async log(input: LogAuthEventInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_events (
        id, user_id, tenant_id, event_type, email_attempted, ip_address, user_agent, details
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        `aev_${randomUUID()}`,
        input.userId,
        input.tenantId,
        input.eventType,
        input.emailAttempted ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        JSON.stringify(input.details ?? {}),
      ],
    );
  }
}
