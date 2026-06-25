/**
 * T070 — Integrationstest: Beleg-Upload über die geteilte Pipeline (echtes Postgres).
 *
 * Deckt BEIDE Eingänge ab (DRY-Beweis):
 *   - web_chat (Wirt): source_channel='web_chat', Audit-Actor 'customer', Beleg als
 *     Chat-Bubble verknüpft (chat_messages.beleg_id).
 *   - manual_upload (Staff, M01-Refactor): source_channel='manual_upload', Actor 'staff'.
 *   - Idempotenz (SHA256), Validierung (leer/MIME) ohne DB-Write.
 *
 * S3 wird gefaked (uploadObject ruft nur client.send), OCR-Queue gemockt (kein Redis).
 * Frische prozesspilot_test-DB nötig (audit_log append-only). CI ephemer = grün.
 */
import type { S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createChatSession,
  insertChatMessage,
  listChatMessages,
} from '../../modules/m-webchat/services/webchat.repository';
import { processBelegUpload } from '../../modules/m01-receipt-intake/services/beleg-upload.service';
import { softDeleteBeleg } from '../../modules/m01-receipt-intake/services/beleg.repository';

vi.mock('../../core/queue/ocr-queue', () => ({ enqueueOcrJob: vi.fn(async () => undefined) }));

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_U = '0c0c0c0c-0070-4070-8070-0000000000c1';
const STAFF_U = '0c0c0c0c-0070-4070-8070-000000005a40';

let pool: pg.Pool;
let dbAvailable = false;

// Fake-S3: uploadObject() ruft nur client.send(PutObjectCommand) → resolve.
const fakeS3 = { send: vi.fn(async () => ({})) } as unknown as S3Client;
const silentLogger = { warn: () => {}, info: () => {}, error: () => {} };

/** Gültige PNG-Magic-Bytes + Salt → eindeutiger SHA256 je Aufruf. */
function pngBuffer(salt: string): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.from(`png-${salt}-${'x'.repeat(16)}`)]);
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) throw new Error(`[T070] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    return;
  }
  // Alles als pp (Superuser, RLS-Bypass) — kein gastro_app/Grant nötig.
  await pool.query('DELETE FROM chat_messages WHERE tenant_id = $1', [T_U]);
  await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_U]);
  await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T_U]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T_U]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T_U, 't070-upload', 'T070 Upload Wirt', 'wirt-t070@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM chat_messages WHERE tenant_id = $1', [T_U]).catch(() => {});
    await pool.query('DELETE FROM chat_sessions WHERE tenant_id = $1', [T_U]).catch(() => {});
    await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T_U]).catch(() => {});
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T_U]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T_U]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

const deps = () => ({ db: pool, s3: fakeS3, logger: silentLogger });

describe('T070 — Web-Chat-Upload (Wirt) → belege-Pfad', () => {
  it('web_chat: source_channel + Audit-Actor customer + Chat-Bubble verknüpft', async () => {
    if (!dbAvailable) return;
    const { session } = await createChatSession(pool, {
      tenantId: T_U,
      triggerType: 'staff_manual',
      actor: { type: 'staff', id: STAFF_U },
    });

    const result = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'web_chat',
      fileBuffer: pngBuffer('chat'),
      filename: 'beleg.png',
      uploadedByUserId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isDuplicate).toBe(false);

    // Beleg liegt mit source_channel='web_chat' in der belege-Tabelle.
    const beleg = await pool.query<{ source_channel: string; status: string }>(
      'SELECT source_channel, status FROM belege WHERE id = $1',
      [result.beleg.id],
    );
    expect(beleg.rows[0].source_channel).toBe('web_chat');

    // Audit-Actor ist 'customer' (Wirt, kein Account).
    const audit = await pool.query<{ actor: { type: string; id: string | null } }>(
      `SELECT actor FROM audit_log WHERE entity_id = $1 AND event_type = 'beleg.uploaded'`,
      [result.beleg.id],
    );
    expect(audit.rows[0].actor.type).toBe('customer');
    expect(audit.rows[0].actor.id).toBeNull();

    // Als Chat-Bubble verknüpft (wie es der Handler macht).
    await insertChatMessage(pool, {
      tenantId: T_U,
      sessionId: session.id,
      senderType: 'customer',
      body: null,
      belegId: result.beleg.id,
    });
    const msgs = await listChatMessages(pool, { tenantId: T_U, sessionId: session.id });
    const bubble = msgs.find((m) => m.beleg_id === result.beleg.id);
    expect(bubble).toBeDefined();
    expect(bubble?.body).toBeNull();
    expect(fakeS3.send).toHaveBeenCalled();
  });

  it('manual_upload (M01-Refactor): source_channel + Audit-Actor staff', async () => {
    if (!dbAvailable) return;
    const result = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'manual_upload',
      fileBuffer: pngBuffer('staff'),
      filename: 'staff.png',
      uploadedByUserId: STAFF_U,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const beleg = await pool.query<{ source_channel: string }>(
      'SELECT source_channel FROM belege WHERE id = $1',
      [result.beleg.id],
    );
    expect(beleg.rows[0].source_channel).toBe('manual_upload');
    const audit = await pool.query<{ actor: { type: string; id: string | null } }>(
      `SELECT actor FROM audit_log WHERE entity_id = $1 AND event_type = 'beleg.uploaded'`,
      [result.beleg.id],
    );
    expect(audit.rows[0].actor.type).toBe('staff');
    expect(audit.rows[0].actor.id).toBe(STAFF_U);
  });

  it('Idempotenz: gleiche Bytes zweimal → zweiter Upload isDuplicate, gleiche Beleg-ID', async () => {
    if (!dbAvailable) return;
    const buf = pngBuffer('dup');
    const first = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'web_chat',
      fileBuffer: buf,
      filename: 'dup.png',
      uploadedByUserId: null,
    });
    const second = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'web_chat',
      fileBuffer: buf,
      filename: 'dup.png',
      uploadedByUserId: null,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.isDuplicate).toBe(true);
    expect(second.beleg.id).toBe(first.beleg.id);
  });

  it('Validierung: leere Datei → 400, unbekanntes Format → 415 (kein DB-Write)', async () => {
    if (!dbAvailable) return;
    const empty = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'web_chat',
      fileBuffer: Buffer.alloc(0),
      filename: 'x',
      uploadedByUserId: null,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe(400);

    const badMime = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'web_chat',
      fileBuffer: Buffer.from('das ist kein bild'),
      filename: 'x.txt',
      uploadedByUserId: null,
    });
    expect(badMime.ok).toBe(false);
    if (!badMime.ok) expect(badMime.code).toBe(415);
  });

  it('Undelete: soft-gelöscht + gleiche Bytes erneut → isUndeleted, gleiche ID, reaktiviert', async () => {
    if (!dbAvailable) return;
    const buf = pngBuffer('undelete');
    const first = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'web_chat',
      fileBuffer: buf,
      filename: 'u.png',
      uploadedByUserId: null,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Soft-Delete, dann gleiche Bytes erneut → Reaktivierung statt zweitem Insert
    // (UNIQUE tenant_id+file_sha256). Genau der refactorte Undelete-Pfad.
    await softDeleteBeleg(pool, T_U, first.beleg.id, STAFF_U, 'test');
    const again = await processBelegUpload(deps(), {
      tenantId: T_U,
      sourceChannel: 'web_chat',
      fileBuffer: buf,
      filename: 'u.png',
      uploadedByUserId: null,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.isUndeleted).toBe(true);
    expect(again.beleg.id).toBe(first.beleg.id);

    const row = await pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM belege WHERE id = $1',
      [first.beleg.id],
    );
    expect(row.rows[0].deleted_at).toBeNull();
  });
});
