/**
 * T068 — Integrationstest der Web-Chat-Sessions gegen echtes Postgres.
 *
 * Zwei Beweis-Ebenen (Lauf-Strategie wie onboarding-wizard.test.ts):
 *   A) FUNKTIONAL (Pool = pp): create → get → idempotent → revoke → create-new
 *      inkl. „genau ein aktiver Link pro Mandant" + GoBD-Audit.
 *   B) SICHERHEIT (SET ROLE gastro_app, NOBYPASSRLS): get_chat_session_by_token()
 *      findet die Session cross-tenant (SECURITY DEFINER), während ein DIREKTES
 *      SELECT ohne Tenant-Context 0 Zeilen liefert (RLS greift) — und der Bypass
 *      nicht aus der Funktion leakt.
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createChatSession,
  getChatSessionByToken,
  revokeChatSession,
} from '../../modules/m-webchat/services/webchat.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_C = '0c0c0c0c-0068-4068-8068-0000000000c1'; // Web-Chat-Test-Tenant
const STAFF = '0c0c0c0c-0068-4068-8068-000000005a40'; // Test-Staff (Audit-Actor)

let pool: pg.Pool;
let dbAvailable = false;

async function asGastroApp<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gastro_app');
    const who = await client.query<{ current_user: string }>('SELECT current_user');
    if (who.rows[0]?.current_user !== 'gastro_app') {
      throw new Error(
        `[T068] SET ROLE gastro_app griff nicht (current_user=${who.rows[0]?.current_user}).`,
      );
    }
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
      throw new Error(
        `[T068] DB unter DATABASE_URL nicht erreichbar — in CI Pflicht. ${String(err)}`,
      );
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
  // Tabellen-Rechte + Funktions-Owner wie in Production (SECURITY DEFINER als
  // gastro_owner, non-superuser → echter Bypass-Pfad über die Owner-ROLLE).
  await pool.query('GRANT SELECT, INSERT, UPDATE ON chat_sessions TO gastro_app');
  await pool.query('GRANT SELECT ON chat_sessions TO gastro_owner');
  await pool.query('ALTER FUNCTION get_chat_session_by_token(text) OWNER TO gastro_owner');

  // Seed Tenant (als Superuser pp, RLS-Bypass). Hinweis: audit_log ist append-only
  // (DB-Trigger) und kann NICHT geleert werden — der Integrationslauf braucht daher
  // eine FRISCHE DB (prozesspilot_test drop/create/migrate; CI ist ephemer = grün,
  // Memory backend-db-test-fresh-db). Auf einer persistenten DB würde DELETE tenants
  // an audit_log (FK RESTRICT) scheitern. Muster wie onboarding-wizard.test.ts.
  await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_C]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T_C]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T_C, 't068-webchat', 'T068 Web-Chat Wirt', 'wirt-t068@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T_C]).catch(() => {});
    await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_C]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T_C]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

const ACTOR = { type: 'staff', id: STAFF } as const;

describe('T068 — Web-Chat-Session-Repository-Lifecycle (funktional)', () => {
  it('create → get → idempotent → revoke → create-new + GoBD-Audit', async () => {
    if (!dbAvailable) return;

    // create
    const first = await createChatSession(pool, {
      tenantId: T_C,
      triggerType: 'staff_manual',
      actor: ACTOR,
    });
    expect(first.created).toBe(true);
    expect(first.session.status).toBe('active');
    expect(first.session.token).toHaveLength(32);
    expect(first.session.expires_at).toBeNull(); // unbefristet (dauerhafter Kanal)

    // get by token (cross-tenant SECURITY DEFINER)
    const fetched = await getChatSessionByToken(pool, first.session.token);
    expect(fetched?.id).toBe(first.session.id);

    // idempotent: zweiter create → dieselbe aktive Session, created=false
    const second = await createChatSession(pool, {
      tenantId: T_C,
      triggerType: 'staff_manual',
      actor: ACTOR,
    });
    expect(second.created).toBe(false);
    expect(second.session.id).toBe(first.session.id);

    // revoke
    const revoked = await revokeChatSession(pool, {
      tenantId: T_C,
      sessionId: first.session.id,
      actor: ACTOR,
    });
    expect(revoked?.status).toBe('revoked');
    expect(revoked?.revoked_at).not.toBeNull();

    // nach Widerruf: neuer create legt eine NEUE aktive Session an (anderer id)
    const third = await createChatSession(pool, {
      tenantId: T_C,
      triggerType: 'staff_manual',
      actor: ACTOR,
    });
    expect(third.created).toBe(true);
    expect(third.session.id).not.toBe(first.session.id);
    expect(third.session.status).toBe('active');

    // GoBD-Audit: created + revoked geschrieben
    const created = await pool.query(
      `SELECT 1 FROM audit_log WHERE tenant_id = $1 AND event_type = 'chat_session.created'`,
      [T_C],
    );
    expect(created.rowCount ?? 0).toBeGreaterThanOrEqual(2);
    const rev = await pool.query(
      `SELECT 1 FROM audit_log WHERE tenant_id = $1 AND event_type = 'chat_session.revoked'`,
      [T_C],
    );
    expect(rev.rowCount ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('unbekannter Token → null', async () => {
    if (!dbAvailable) return;
    const none = await getChatSessionByToken(pool, 'definitiv-kein-gueltiger-token');
    expect(none).toBeNull();
  });

  it('paralleler Create ist race-sicher: genau eine aktive Session, kein 500 (S1/S2)', async () => {
    if (!dbAvailable) return;
    // Ausgangslage: keine aktive Session (vorherige Tests können eine offen gelassen haben).
    await pool.query(
      "UPDATE chat_sessions SET status='revoked', revoked_at=now() WHERE tenant_id=$1 AND status='active'",
      [T_C],
    );
    // Zwei echt nebenläufige Creates (eigene Pool-Connections) — sie rennen gegen den
    // partiellen Unique-Index uq_chat_sessions_active_tenant.
    const [a, b] = await Promise.all([
      createChatSession(pool, { tenantId: T_C, triggerType: 'staff_manual', actor: ACTOR }),
      createChatSession(pool, { tenantId: T_C, triggerType: 'staff_manual', actor: ACTOR }),
    ]);
    // Beide kehren ohne Fehler zurück und zeigen auf DIESELBE Session.
    expect(a.session.id).toBe(b.session.id);
    // Und es existiert genau EINE aktive Session für den Tenant.
    const active = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM chat_sessions WHERE tenant_id=$1 AND status='active'",
      [T_C],
    );
    expect(active.rows[0].n).toBe(1);
  });
});

describe('T068 — RLS + SECURITY DEFINER unter gastro_app (NOBYPASSRLS)', () => {
  it('get_chat_session_by_token() findet die Session cross-tenant (kein Tenant-Context)', async () => {
    if (!dbAvailable) return;
    const { session } = await createChatSession(pool, {
      tenantId: T_C,
      triggerType: 'staff_manual',
      actor: ACTOR,
    });
    const found = await asGastroApp(async (c) => {
      const res = await c.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM get_chat_session_by_token($1)',
        [session.token],
      );
      return res.rows[0];
    });
    expect(found?.id).toBe(session.id);
    expect(found?.tenant_id).toBe(T_C);
  });

  it('DIREKTES SELECT auf chat_sessions unter gastro_app (ohne Context) → 0 Zeilen', async () => {
    if (!dbAvailable) return;
    const { session } = await createChatSession(pool, {
      tenantId: T_C,
      triggerType: 'staff_manual',
      actor: ACTOR,
    });
    const count = await asGastroApp(async (c) => {
      const res = await c.query('SELECT id FROM chat_sessions WHERE token = $1', [session.token]);
      return res.rowCount;
    });
    expect(count).toBe(0);
  });

  it('Bypass leakt nicht: Funktion + danach direktes SELECT in DERSELBEN Transaktion → 0 Zeilen', async () => {
    if (!dbAvailable) return;
    const { session } = await createChatSession(pool, {
      tenantId: T_C,
      triggerType: 'staff_manual',
      actor: ACTOR,
    });
    const count = await asGastroApp(async (c) => {
      await c.query('SELECT id FROM get_chat_session_by_token($1)', [session.token]);
      const res = await c.query('SELECT id FROM chat_sessions WHERE token = $1', [session.token]);
      return res.rowCount;
    });
    expect(count).toBe(0);
  });

  it('Session von Tenant A ist unter FALSCHEM Tenant-Context (B) unsichtbar (S3, RLS)', async () => {
    if (!dbAvailable) return;
    const { session } = await createChatSession(pool, {
      tenantId: T_C,
      triggerType: 'staff_manual',
      actor: ACTOR,
    });
    // Fremder Tenant-Context: Policy tenant_id = current_tenant_id() greift → 0 Zeilen.
    const T_OTHER = '0c0c0c0c-0068-4068-8068-00000000b000';
    const count = await asGastroApp(async (c) => {
      await c.query("SELECT set_config('app.current_tenant', $1, true)", [T_OTHER]);
      const res = await c.query('SELECT id FROM chat_sessions WHERE token = $1', [session.token]);
      return res.rowCount;
    });
    expect(count).toBe(0);
  });
});
