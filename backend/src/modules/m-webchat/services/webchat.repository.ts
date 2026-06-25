/**
 * T068/Phase C — Web-Chat-Widget: DB-Layer (Chat-Sessions + Magic-Link).
 *
 * RLS-Muster (wie wizard.repository.ts / beleg.repository.ts): jede schreibende
 * Operation läuft in einem expliziten BEGIN/COMMIT mit
 * `set_config('app.current_tenant', …, true)` (T041: Key MUSS app.current_tenant
 * sein). Der öffentliche Token-Lookup ist tenant-übergreifend und läuft über die
 * SECURITY-DEFINER-Funktion get_chat_session_by_token (Migration 124).
 */
import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { type AuditActor, logAuditEvent } from '../../../core/audit/audit-log';
import type { DbChatSession } from '../webchat.types';

/** 32 Zeichen Base64URL = 192 Bit Entropie (wie Wizard-Token, Spec §6.1). */
export function generateChatToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Tenant-Context für RLS setzen (T041: Key MUSS app.current_tenant sein). */
async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

export interface TenantContact {
  display_name: string;
  legal_name: string | null;
  contact_email: string | null;
}

/** Liest Kontakt-Felder des (eigenen) Tenants — für die Einladungs-Mail. */
export async function getTenantContact(
  pool: Pool,
  tenantId: string,
): Promise<TenantContact | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);
    const res = await client.query<TenantContact>(
      'SELECT display_name, legal_name, contact_email FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId],
    );
    await client.query('COMMIT');
    return res.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface CreateChatSessionInput {
  tenantId: string;
  /** Auslöser-Kontext: 'staff_manual' | 'beleg_review' | 'reminder' | … */
  triggerType: string;
  triggerReferenceId?: string | null;
  /** Audit-Actor: Staff-User-ID (manuell) oder { type:'system', id:null }. */
  actor: AuditActor;
}

export interface CreateChatSessionResult {
  session: DbChatSession;
  /** false = es gab bereits eine aktive Session (idempotent zurückgegeben). */
  created: boolean;
}

/**
 * Legt eine neue Chat-Session an — oder gibt die bereits existierende aktive
 * Session des Mandanten zurück (idempotent). Garantie „genau ein aktiver Link
 * pro Mandant" ist zusätzlich per partiellem Unique-Index (Migration 124)
 * hart abgesichert.
 */
export async function createChatSession(
  pool: Pool,
  input: CreateChatSessionInput,
): Promise<CreateChatSessionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    // Idempotenz: existiert bereits eine aktive Session → zurückgeben statt
    // Unique-Verletzung (uq_chat_sessions_active_tenant).
    const existing = await client.query<DbChatSession>(
      "SELECT * FROM chat_sessions WHERE tenant_id = $1 AND status = 'active' LIMIT 1",
      [input.tenantId],
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { session: existing.rows[0], created: false };
    }

    const token = generateChatToken();
    const res = await client.query<DbChatSession>(
      `INSERT INTO chat_sessions (tenant_id, token, trigger_type, trigger_reference_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.tenantId, token, input.triggerType, input.triggerReferenceId ?? null],
    );
    const session = res.rows[0];

    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'chat_session',
      entityId: session.id,
      eventType: 'chat_session.created',
      actor: input.actor,
      payloadAfter: { trigger_type: input.triggerType },
    });

    await client.query('COMMIT');
    return { session, created: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Cross-Tenant-Lookup über den Magic-Link-Token (SECURITY DEFINER). */
export async function getChatSessionByToken(
  pool: Pool,
  token: string,
): Promise<DbChatSession | null> {
  const res = await pool.query<DbChatSession>('SELECT * FROM get_chat_session_by_token($1)', [
    token,
  ]);
  return res.rows[0] ?? null;
}

export interface RevokeChatSessionInput {
  tenantId: string;
  sessionId: string;
  actor: AuditActor;
}

/** Widerruft eine (aktive) Chat-Session: status='revoked'. RLS-tenant-gescopet. */
export async function revokeChatSession(
  pool: Pool,
  input: RevokeChatSessionInput,
): Promise<DbChatSession | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    const res = await client.query<DbChatSession>(
      `UPDATE chat_sessions
          SET status = 'revoked', revoked_at = now(), last_activity_at = now()
        WHERE id = $1 AND status <> 'revoked'
        RETURNING *`,
      [input.sessionId],
    );
    const session = res.rows[0];
    if (!session) {
      await client.query('ROLLBACK').catch(() => undefined);
      return null;
    }

    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'chat_session',
      entityId: session.id,
      eventType: 'chat_session.revoked',
      actor: input.actor,
    });

    await client.query('COMMIT');
    return session;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
