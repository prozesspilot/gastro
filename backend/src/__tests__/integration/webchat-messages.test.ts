/**
 * T069 — Integrationstest der Web-Chat-Nachrichten gegen echtes Postgres.
 *
 *   A) FUNKTIONAL (Pool = pp): customer→message, staff→reply, Verlauf chronologisch,
 *      read_at/unread_count, CHECK (body OR beleg).
 *   B) SSE: insertChatMessage emittiert nach Commit ein 'chat.message'-Event an den
 *      Tenant-Kanal (Subscriber-Sink empfängt es).
 *   C) SICHERHEIT (gastro_app, NOBYPASSRLS): Nachrichten sind ohne / unter fremdem
 *      Tenant-Context unsichtbar (RLS).
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 * Hinweis: audit_log ist append-only → frische prozesspilot_test-DB nötig
 * (drop/create/migrate; CI ist ephemer = grün, Memory backend-db-test-fresh-db).
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sseManager } from '../../core/sse/sse.manager';
import {
  createChatSession,
  insertChatMessage,
  listChatMessages,
  listChatsForStaff,
  markCustomerMessagesRead,
} from '../../modules/m-webchat/services/webchat.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_M = '0c0c0c0c-0069-4069-8069-0000000000c1'; // Web-Chat-Messages-Test-Tenant
const STAFF_USER = '0c0c0c0c-0069-4069-8069-000000005a40'; // echter users-Datensatz (FK)

let pool: pg.Pool;
let dbAvailable = false;

async function asGastroApp<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gastro_app');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) {
      throw new Error(`[T069] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    }
    return;
  }

  await pool.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_app') THEN
         CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_owner') THEN
         CREATE ROLE gastro_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
     END $$;`,
  );
  // Nur chat_messages-Grants nötig: die RLS-Tests selektieren chat_messages unter
  // gastro_app; createChatSession/insertChatMessage laufen als pp (Superuser).
  // KEIN ALTER FUNCTION / chat_sessions-Grant hier — die teilt sich
  // webchat-sessions.test.ts. Parallele DDL auf denselben Katalog-Objekten (zwei
  // Integrationsfiles laufen nebenläufig) löst sonst „tuple concurrently updated" aus.
  await pool.query('GRANT SELECT, INSERT, UPDATE ON chat_messages TO gastro_app');

  // Seed (fresh DB). FK-Reihenfolge: messages → sessions → user; tenant zuletzt.
  await pool.query('DELETE FROM chat_messages WHERE tenant_id = $1', [T_M]);
  await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_M]);
  await pool.query('DELETE FROM users WHERE id = $1', [STAFF_USER]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T_M]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T_M, 't069-webchat-msg', 'T069 Web-Chat Wirt', 'wirt-t069@example.com'],
  );
  await pool.query('INSERT INTO users (id, display_name, role) VALUES ($1, $2, $3)', [
    STAFF_USER,
    'T069 Support',
    'support',
  ]);
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM chat_messages WHERE tenant_id = $1', [T_M]).catch(() => {});
    await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_M]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id = $1', [STAFF_USER]).catch(() => {});
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T_M]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T_M]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

const ACTOR = { type: 'staff', id: STAFF_USER } as const;

async function freshSession(): Promise<string> {
  // Genau ein aktiver Link/Mandant → vor jedem Test eine saubere aktive Session.
  await pool.query(
    "UPDATE chat_sessions SET status='revoked', revoked_at=now() WHERE tenant_id=$1 AND status='active'",
    [T_M],
  );
  const { session } = await createChatSession(pool, {
    tenantId: T_M,
    triggerType: 'staff_manual',
    actor: ACTOR,
  });
  return session.id;
}

describe('T069 — Chat-Nachrichten (funktional)', () => {
  it('customer→message, staff→reply: Verlauf chronologisch + Absender korrekt', async () => {
    if (!dbAvailable) return;
    const sessionId = await freshSession();

    await insertChatMessage(pool, {
      tenantId: T_M,
      sessionId,
      senderType: 'customer',
      body: 'Hallo, kurze Frage zu meinem Beleg.',
    });
    await insertChatMessage(pool, {
      tenantId: T_M,
      sessionId,
      senderType: 'staff',
      senderUserId: STAFF_USER,
      body: 'Klar, immer gerne!',
    });

    const msgs = await listChatMessages(pool, { tenantId: T_M, sessionId });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].sender_type).toBe('customer');
    expect(msgs[0].sender_user_id).toBeNull();
    expect(msgs[1].sender_type).toBe('staff');
    expect(msgs[1].sender_user_id).toBe(STAFF_USER);
    // chronologisch (älteste zuerst)
    expect(new Date(msgs[0].created_at).getTime()).toBeLessThanOrEqual(
      new Date(msgs[1].created_at).getTime(),
    );
  });

  it('unread_count + markCustomerMessagesRead (Staff öffnet Thread)', async () => {
    if (!dbAvailable) return;
    const sessionId = await freshSession();
    await insertChatMessage(pool, {
      tenantId: T_M,
      sessionId,
      senderType: 'customer',
      body: 'Noch eine Frage.',
    });

    const before = await listChatsForStaff(pool, T_M);
    const row = before.find((c) => c.id === sessionId);
    expect(row?.unread_count).toBe(1);
    expect(row?.last_message_at).not.toBeNull();

    await markCustomerMessagesRead(pool, { tenantId: T_M, sessionId });
    const after = await listChatsForStaff(pool, T_M);
    expect(after.find((c) => c.id === sessionId)?.unread_count).toBe(0);
  });

  it('CHECK: Nachricht ohne body UND ohne beleg → Fehler', async () => {
    if (!dbAvailable) return;
    const sessionId = await freshSession();
    await expect(
      insertChatMessage(pool, {
        tenantId: T_M,
        sessionId,
        senderType: 'customer',
        body: null,
        belegId: null,
      }),
    ).rejects.toThrow();
  });
});

describe('T069 — SSE-Emit', () => {
  it('insertChatMessage pusht ein chat.message-Event an den Tenant-Kanal', async () => {
    if (!dbAvailable) return;
    const sessionId = await freshSession();
    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T_M, sink);
    try {
      await insertChatMessage(pool, {
        tenantId: T_M,
        sessionId,
        senderType: 'customer',
        body: 'Live-Test-Nachricht',
      });
    } finally {
      sseManager.unsubscribe(T_M, sink);
    }
    const joined = received.join('');
    expect(joined).toContain('event: chat.message');
    expect(joined).toContain('Live-Test-Nachricht');
  });
});

describe('T069 — RLS (gastro_app, NOBYPASSRLS)', () => {
  it('chat_messages ohne / unter fremdem Tenant-Context unsichtbar', async () => {
    if (!dbAvailable) return;
    const sessionId = await freshSession();
    await insertChatMessage(pool, {
      tenantId: T_M,
      sessionId,
      senderType: 'customer',
      body: 'geheim',
    });

    // (a) ohne Context → 0 Zeilen
    const noCtx = await asGastroApp(async (c) => {
      const res = await c.query('SELECT id FROM chat_messages WHERE session_id = $1', [sessionId]);
      return res.rowCount;
    });
    expect(noCtx).toBe(0);

    // (b) falscher Tenant-Context → 0 Zeilen
    const T_OTHER = '0c0c0c0c-0069-4069-8069-00000000b000';
    const wrongCtx = await asGastroApp(async (c) => {
      await c.query("SELECT set_config('app.current_tenant', $1, true)", [T_OTHER]);
      const res = await c.query('SELECT id FROM chat_messages WHERE session_id = $1', [sessionId]);
      return res.rowCount;
    });
    expect(wrongCtx).toBe(0);
  });
});
