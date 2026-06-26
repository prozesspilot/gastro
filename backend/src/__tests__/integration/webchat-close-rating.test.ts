/**
 * T075 — Integrationstest „Chat beenden + Sterne-Bewertung" gegen echtes Postgres.
 *
 * Funktionaler Lifecycle (Pool = pp, RLS-Bypass): close(customer/staff) → rate →
 * Doppel-Bewertung blockiert → Bewertung nur auf beendeter Session → GoBD-Audit
 * (chat_session.closed/.rated) → die SECURITY-DEFINER-Funktion liefert die neuen
 * Spalten (rating/closed_by) zurück → Staff-Liste enthält rating.
 *
 * BEWUSST KEIN `ALTER FUNCTION ... OWNER` hier: dieses DDL macht ausschließlich
 * webchat-sessions.test.ts. Bei parallelen Integrationsläufen (vitest, gleiche DB)
 * würde ein zweiter ALTER „tuple concurrently updated" auslösen (Memory).
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeChatSession,
  createChatSession,
  getChatSessionByToken,
  listChatsForStaff,
  rateChatSession,
} from '../../modules/m-webchat/services/webchat.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_CR = '0c0c0c0c-0075-4075-8075-0000000000c1'; // T075-Test-Tenant
const STAFF = '0c0c0c0c-0075-4075-8075-000000005a40'; // Test-Staff (Audit-Actor)

const STAFF_ACTOR = { type: 'staff', id: STAFF } as const;
const CUSTOMER_ACTOR = { type: 'customer', id: null } as const;

let pool: pg.Pool;
let dbAvailable = false;

/** Stellt sicher, dass GENAU eine frische aktive Session existiert. */
async function freshSession() {
  await pool.query(
    "UPDATE chat_sessions SET status='revoked', revoked_at=now() WHERE tenant_id=$1 AND status='active'",
    [T_CR],
  );
  const { session } = await createChatSession(pool, {
    tenantId: T_CR,
    triggerType: 'staff_manual',
    actor: STAFF_ACTOR,
  });
  return session;
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
        `[T075] DB unter DATABASE_URL nicht erreichbar — in CI Pflicht. ${String(err)}`,
      );
    }
    return;
  }

  // Frische DB nötig (audit_log append-only) — Memory backend-db-test-fresh-db.
  await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_CR]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T_CR]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T_CR, 't075-webchat', 'T075 Web-Chat Wirt', 'wirt-t075@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T_CR]).catch(() => {});
    await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_CR]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T_CR]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T075 — Chat beenden + Bewertung (funktional)', () => {
  it('close(customer) → rate → DEFINER-Fn + Staff-Liste + GoBD-Audit', async () => {
    if (!dbAvailable) return;
    const session = await freshSession();

    // Beenden durch den Wirt.
    const closed = await closeChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      closedBy: 'customer',
      actor: CUSTOMER_ACTOR,
    });
    expect(closed?.status).toBe('closed');
    expect(closed?.closed_by).toBe('customer');
    expect(closed?.closed_at).not.toBeNull();
    expect(closed?.rating).toBeNull();

    // Bewertung 1–5 + Kommentar.
    const rated = await rateChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      rating: 5,
      comment: 'Top Service',
      actor: CUSTOMER_ACTOR,
    });
    expect(rated?.rating).toBe(5);
    expect(rated?.rating_comment).toBe('Top Service');
    expect(rated?.rated_at).not.toBeNull();

    // Die SECURITY-DEFINER-Funktion liefert die neuen Spalten zurück (sonst sähe
    // das Widget die Bewertung nicht).
    const fetched = await getChatSessionByToken(pool, session.token);
    expect(fetched?.status).toBe('closed');
    expect(fetched?.rating).toBe(5);
    expect(fetched?.closed_by).toBe('customer');

    // Staff-Liste enthält die Bewertung.
    const list = await listChatsForStaff(pool, T_CR);
    expect(list.find((c) => c.id === session.id)?.rating).toBe(5);

    // GoBD-Audit: closed + rated geschrieben.
    const closedEv = await pool.query(
      `SELECT 1 FROM audit_log WHERE tenant_id = $1 AND entity_id = $2 AND event_type = 'chat_session.closed'`,
      [T_CR, session.id],
    );
    expect(closedEv.rowCount ?? 0).toBeGreaterThanOrEqual(1);
    const ratedEv = await pool.query(
      `SELECT payload_after FROM audit_log WHERE tenant_id = $1 AND entity_id = $2 AND event_type = 'chat_session.rated'`,
      [T_CR, session.id],
    );
    expect(ratedEv.rowCount ?? 0).toBeGreaterThanOrEqual(1);
    // Kein PII im Audit: nur die Zahl, KEIN Kommentar.
    expect(ratedEv.rows[0].payload_after).toMatchObject({ rating: 5 });
    expect(JSON.stringify(ratedEv.rows[0].payload_after)).not.toContain('Top Service');
  });

  it('Doppel-Bewertung wird blockiert (rating IS NULL-Gate)', async () => {
    if (!dbAvailable) return;
    const session = await freshSession();
    await closeChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      closedBy: 'customer',
      actor: CUSTOMER_ACTOR,
    });
    const first = await rateChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      rating: 4,
      actor: CUSTOMER_ACTOR,
    });
    expect(first?.rating).toBe(4);
    const second = await rateChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      rating: 1,
      actor: CUSTOMER_ACTOR,
    });
    expect(second).toBeNull();
  });

  it('Bewertung einer AKTIVEN Session ist nicht möglich (null)', async () => {
    if (!dbAvailable) return;
    const session = await freshSession();
    const r = await rateChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      rating: 5,
      actor: CUSTOMER_ACTOR,
    });
    expect(r).toBeNull();
  });

  it('close(staff) setzt closed_by=staff; erneutes close ist no-op (null)', async () => {
    if (!dbAvailable) return;
    const session = await freshSession();
    const closed = await closeChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      closedBy: 'staff',
      actor: STAFF_ACTOR,
    });
    expect(closed?.closed_by).toBe('staff');
    // Bereits geschlossen → kein weiterer Übergang.
    const again = await closeChatSession(pool, {
      tenantId: T_CR,
      sessionId: session.id,
      closedBy: 'staff',
      actor: STAFF_ACTOR,
    });
    expect(again).toBeNull();
  });
});
