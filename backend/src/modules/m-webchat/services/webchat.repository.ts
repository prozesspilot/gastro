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
import { sseManager } from '../../../core/sse/sse.manager';
import {
  type ChatSenderType,
  type DbChatMessage,
  type DbChatSession,
  type StaffChatListItem,
  toPublicChatMessage,
} from '../webchat.types';

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

    // Race-sicher: zwischen dem SELECT oben und dem INSERT kann ein paralleler
    // Create (Doppel-Klick) bereits eine aktive Session angelegt haben → der
    // partielle Unique-Index uq_chat_sessions_active_tenant greift. ON CONFLICT
    // DO NOTHING + Re-Select statt eines 23505-Fehlers (500). So hält die
    // Idempotenz-Zusage auch im Race, ohne die harte „ein aktiver Link"-Garantie
    // aufzuweichen.
    const token = generateChatToken();
    const inserted = await client.query<DbChatSession>(
      `INSERT INTO chat_sessions (tenant_id, token, trigger_type, trigger_reference_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) WHERE status = 'active' DO NOTHING
       RETURNING *`,
      [input.tenantId, token, input.triggerType, input.triggerReferenceId ?? null],
    );

    if (inserted.rows[0]) {
      const session = inserted.rows[0];
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
    }

    // Konflikt: parallel wurde bereits eine aktive Session angelegt → diese laden
    // (kein zweiter Audit-Event, da kein neuer Datensatz entstand).
    const raced = await client.query<DbChatSession>(
      "SELECT * FROM chat_sessions WHERE tenant_id = $1 AND status = 'active' LIMIT 1",
      [input.tenantId],
    );
    await client.query('COMMIT');
    const racedSession = raced.rows[0];
    if (!racedSession) {
      throw new Error('chat_session: aktive Session nach ON CONFLICT nicht auffindbar');
    }
    return { session: racedSession, created: false };
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

// ---------------------------------------------------------------------------
// Chat-Nachrichten (T069, Migration 125)
// ---------------------------------------------------------------------------

export interface InsertChatMessageInput {
  tenantId: string;
  sessionId: string;
  senderType: ChatSenderType;
  /** Nur bei sender_type='staff' gesetzt. */
  senderUserId?: string | null;
  body?: string | null;
  /** Verknüpfter Beleg (Foto-Upload), gesetzt in T070. */
  belegId?: string | null;
}

/**
 * Schreibt eine Chat-Nachricht (Transaktion + RLS-Context) und bumpt
 * last_activity_at der Session. NACH dem Commit wird das Live-Event über den
 * SSE-Manager an die Subscriber des Tenant-Kanals gepusht (Wirt /:token/events +
 * Staff /events).
 *
 * Bewusst KEIN Audit-Log pro Nachricht: Chat-Inhalte sind Support-Kommunikation
 * (kein GoBD-Geschäftsvorfall) und würden sonst PII (den Nachrichtentext) ins
 * audit_log schreiben (CLAUDE.md §6.6/§9 — keine PII in Logs).
 */
export async function insertChatMessage(
  pool: Pool,
  input: InsertChatMessageInput,
): Promise<DbChatMessage> {
  const client = await pool.connect();
  let message: DbChatMessage;
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);
    const res = await client.query<DbChatMessage>(
      `INSERT INTO chat_messages
         (tenant_id, session_id, sender_type, sender_user_id, body, beleg_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.tenantId,
        input.sessionId,
        input.senderType,
        input.senderUserId ?? null,
        input.body ?? null,
        input.belegId ?? null,
      ],
    );
    message = res.rows[0];
    await client.query('UPDATE chat_sessions SET last_activity_at = now() WHERE id = $1', [
      input.sessionId,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  // Live-Zustellung (best-effort, in-memory) NACH dem Commit, damit Subscriber
  // nur committete Nachrichten sehen.
  sseManager.emit(input.tenantId, 'chat.message', toPublicChatMessage(message));
  return message;
}

/** Liest den Nachrichtenverlauf einer Session (chronologisch, älteste zuerst). */
export async function listChatMessages(
  pool: Pool,
  input: { tenantId: string; sessionId: string },
): Promise<DbChatMessage[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);
    const res = await client.query<DbChatMessage>(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [input.sessionId],
    );
    await client.query('COMMIT');
    return res.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Lädt eine Session per id im Tenant-Context (RLS-gescopet) — null wenn fremd/unbekannt. */
export async function getChatSessionById(
  pool: Pool,
  input: { tenantId: string; sessionId: string },
): Promise<DbChatSession | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);
    const res = await client.query<DbChatSession>('SELECT * FROM chat_sessions WHERE id = $1', [
      input.sessionId,
    ]);
    await client.query('COMMIT');
    return res.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Markiert ungelesene Customer-Nachrichten als gelesen (Staff öffnet den Thread). */
export async function markCustomerMessagesRead(
  pool: Pool,
  input: { tenantId: string; sessionId: string },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);
    await client.query(
      `UPDATE chat_messages SET read_at = now()
        WHERE session_id = $1 AND sender_type = 'customer' AND read_at IS NULL`,
      [input.sessionId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Staff-Übersicht: alle Chat-Sessions des (gewählten) Tenants mit Zähler-Metadaten. */
export async function listChatsForStaff(
  pool: Pool,
  tenantId: string,
): Promise<StaffChatListItem[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);
    const res = await client.query<StaffChatListItem>(
      `SELECT s.id,
              s.status,
              s.created_at,
              s.last_activity_at,
              (SELECT max(m.created_at) FROM chat_messages m WHERE m.session_id = s.id)
                AS last_message_at,
              (SELECT count(*) FROM chat_messages m
                 WHERE m.session_id = s.id AND m.sender_type = 'customer' AND m.read_at IS NULL)::int
                AS unread_count
         FROM chat_sessions s
        ORDER BY s.last_activity_at DESC`,
    );
    await client.query('COMMIT');
    return res.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
