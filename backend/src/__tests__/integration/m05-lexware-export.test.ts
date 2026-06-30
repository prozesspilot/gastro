/**
 * T023 — Integrationstest für den M05-Lexware-Export-Service (`exportBelegToLexware`)
 * gegen echtes Postgres. Der Kern-Service war bislang nur indirekt (über gemockte
 * Handler) abgedeckt — die SQL-/Idempotenz-/Retry-Logik lief nie gegen die echte DB.
 *
 * Test-Hooks des Exporters (siehe `ExporterDeps`):
 *   - `lexofficeClient`: injizierter Fake statt aus booking_credentials gebaut →
 *     kein echter Lexware-Call, deterministische createVoucher-Ergebnisse/Fehler.
 *   - `s3`: Fake-S3; der Anhang-Upload ist best-effort (Fehler ⇒ trotzdem 'pushed').
 *   - `fetchImpl`: Discord-Alert-fetch (env-gegated über DISCORD_OPS_WEBHOOK_URL;
 *     im Test i.d.R. unkonfiguriert → nicht aufgerufen, daher nicht asserted).
 *
 * Backoff-Retries: BEWUSST mit ECHTEN (kurzen) Wartezeiten statt vi.useFakeTimers().
 * Fake-Timer kollidieren mit der echten DB-I/O des Exporters (recordExport zwischen
 * den Versuchen) und können in CI hängen. Real sind es nur 1 s (1 Retry) bzw.
 * 1 s + 4 s (Final-Fail) — deterministisch; die betroffenen Tests setzen ein
 * großzügiges Timeout.
 *
 * In CI ist die DB Pflicht (REQUIRE_DB); lokal ohne DB wird sauber übersprungen.
 */

import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  LexofficeApiError,
  type LexofficeClient,
} from '../../core/adapters/booking/lexoffice/lexoffice.client';
import type { LexofficeCreateResponse } from '../../core/adapters/booking/lexoffice/lexoffice.types';
import {
  insertBeleg,
  updateBelegCategorization,
} from '../../modules/m01-receipt-intake/services/beleg.repository';
import { exportBelegToLexware } from '../../modules/m05-lexoffice/services/belege-lexware-exporter';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T = '0a23a23a-0023-4023-8023-000000000a23'; // T023-Test-Tenant
const ACTOR = 'module:T023-test';

let pool: pg.Pool;
let dbAvailable = false;

/** createVoucher-Erfolgsantwort (nur `id` wird vom Exporter genutzt). */
function createResponse(id: string): LexofficeCreateResponse {
  return { id, resourceUri: `uri/${id}`, createdDate: '', updatedDate: '', version: 1 };
}

/**
 * Fake-Lexoffice-Client. Nur die vom Exporter/CategoryMapper genutzten Methoden.
 * `listCategories: []` → der CategoryMapper findet kein Mapping und fällt sauber
 * auf die SONSTIGE-Kategorie zurück (kein lexoffice_category_map-Seed nötig).
 */
function makeFakeClient(createVoucher: LexofficeClient['createVoucher']): LexofficeClient {
  return {
    createVoucher,
    uploadVoucherFile: vi.fn(async () => undefined),
    listCategories: vi.fn(async () => []),
  } as unknown as LexofficeClient;
}

/** Fake-S3, dessen Download echte Bytes liefert (Anhang-Pfad wird ausgeführt). */
function makeFakeS3(opts: { fail?: boolean } = {}): S3Client {
  return {
    send: vi.fn(async (cmd: unknown) => {
      if (!(cmd instanceof GetObjectCommand)) throw new Error('unexpected S3 command');
      if (opts.fail) throw new Error('s3 down');
      return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } };
    }),
  } as unknown as S3Client;
}

let belegCounter = 0;
/** Legt einen frischen, KATEGORISIERTEN Beleg an (Export-Gate erfüllt). */
async function categorizedBeleg(): Promise<string> {
  belegCounter++;
  const sha = belegCounter.toString(16).padStart(64, '0');
  const { beleg } = await insertBeleg(pool, {
    tenantId: T,
    sourceChannel: 'manual_upload',
    fileObjectKey: `test/t023-${belegCounter}.jpg`,
    fileMimeType: 'image/jpeg',
    fileSizeBytes: 1234,
    fileSha256: sha,
    uploadedByUserId: null,
    originalFilename: 't023.jpg',
  });
  await updateBelegCategorization(pool, T, beleg.id, {
    newStatus: 'categorized',
    category: 'wareneinkauf_food',
    categorization: {
      engine: 'test',
      category: 'wareneinkauf_food',
      category_label: 'Wareneinkauf Food',
      skr_account: '5100',
      skr_chart: 'SKR03',
      confidence: 0.95,
      rationale: 'test',
      categorized_at: '2026-06-30T00:00:00.000Z',
    },
    audit: { actorType: 'system', actorId: 'module:T023' },
  });
  return beleg.id;
}

async function getBelegStatus(belegId: string): Promise<string | null> {
  const res = await pool.query<{ status: string }>(
    'SELECT status FROM belege WHERE id = $1 AND tenant_id = $2',
    [belegId, T],
  );
  return res.rows[0]?.status ?? null;
}

async function countExportLog(belegId: string, status?: string): Promise<number> {
  const res = status
    ? await pool.query(
        'SELECT count(*)::int AS n FROM export_log WHERE beleg_id = $1 AND status = $2',
        [belegId, status],
      )
    : await pool.query('SELECT count(*)::int AS n FROM export_log WHERE beleg_id = $1', [belegId]);
  return (res.rows[0] as { n: number }).n;
}

async function purgeAuditLog(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    await client.query("SET LOCAL app.audit_maintenance = 'on'");
    await client.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]);
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    client.release();
  }
}

async function cleanup(): Promise<void> {
  await pool.query('DELETE FROM export_log WHERE tenant_id = $1', [T]).catch(() => {});
  await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T]).catch(() => {});
  await purgeAuditLog();
  await pool.query('DELETE FROM tenants WHERE id = $1', [T]).catch(() => {});
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) throw new Error(`[T023] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    return;
  }
  await cleanup();
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T, 't023-export', 'T023 Export-Test', 'export-t023@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) await cleanup();
  await pool?.end().catch(() => {});
});

describe('T023 — exportBelegToLexware gegen echte DB', () => {
  it('Happy-Path: pusht den Beleg, setzt status=exported und schreibt export_log', async () => {
    if (!dbAvailable) return;
    const belegId = await categorizedBeleg();
    const client = makeFakeClient(vi.fn(async () => createResponse('voucher-happy')));

    const res = await exportBelegToLexware(T, belegId, ACTOR, {
      pool,
      s3: makeFakeS3(),
      lexofficeClient: client,
    });

    expect(res.status).toBe('pushed');
    expect(res.external_id).toBe('voucher-happy');
    expect(res.attempts).toBe(1);
    expect(await getBelegStatus(belegId)).toBe('exported');
    expect(await countExportLog(belegId, 'pushed')).toBe(1);
  });

  it('Idempotenz: ein bereits gepushter Beleg liefert beim 2. Aufruf skipped (kein Doppel-Push)', async () => {
    if (!dbAvailable) return;
    const belegId = await categorizedBeleg();
    const createVoucher = vi.fn(async () => createResponse('voucher-idem'));
    const client = makeFakeClient(createVoucher);
    const deps = { pool, s3: makeFakeS3(), lexofficeClient: client };

    const first = await exportBelegToLexware(T, belegId, ACTOR, deps);
    const second = await exportBelegToLexware(T, belegId, ACTOR, deps);

    expect(first.status).toBe('pushed');
    expect(second.status).toBe('skipped');
    expect(second.external_id).toBe('voucher-idem');
    // createVoucher wurde nur EINMAL aufgerufen — der 2. Lauf greift den Idempotenz-Skip.
    expect(createVoucher).toHaveBeenCalledTimes(1);
  });

  it('Status-Gate: ein nicht kategorisierter Beleg wird abgewiesen (not_categorized, kein Voucher)', async () => {
    if (!dbAvailable) return;
    // Frischer Beleg ohne updateBelegCategorization → status 'received', keine payload.categorization.
    const { beleg } = await insertBeleg(pool, {
      tenantId: T,
      sourceChannel: 'manual_upload',
      fileObjectKey: 'test/t023-uncat.jpg',
      fileMimeType: 'image/jpeg',
      fileSizeBytes: 10,
      fileSha256: 'f'.repeat(64),
      uploadedByUserId: null,
      originalFilename: 'uncat.jpg',
    });
    const createVoucher = vi.fn(async () => createResponse('nope'));

    const res = await exportBelegToLexware(T, beleg.id, ACTOR, {
      pool,
      s3: makeFakeS3(),
      lexofficeClient: makeFakeClient(createVoucher),
    });

    expect(res.status).toBe('failed');
    expect(res.error).toBe('not_categorized');
    expect(createVoucher).not.toHaveBeenCalled();
    expect(await getBelegStatus(beleg.id)).toBe('received');
  });

  it('4xx: kein Retry — ein 400 vom Client führt sofort zu failed (attempts=1)', async () => {
    if (!dbAvailable) return;
    const belegId = await categorizedBeleg();
    const createVoucher = vi.fn(async () => {
      throw new LexofficeApiError(400, 'Lexoffice 400 — bad request');
    });

    const res = await exportBelegToLexware(T, belegId, ACTOR, {
      pool,
      s3: makeFakeS3(),
      lexofficeClient: makeFakeClient(createVoucher),
      fetchImpl: vi.fn(async () => new Response(null, { status: 204 })),
    });

    expect(res.status).toBe('failed');
    expect(res.attempts).toBe(1);
    expect(createVoucher).toHaveBeenCalledTimes(1); // KEIN Retry bei 4xx
    expect(await getBelegStatus(belegId)).toBe('categorized'); // Status unverändert
  });

  it('5xx: Retry-dann-Erfolg — erster Versuch 500, zweiter pusht (attempts=2)', async () => {
    if (!dbAvailable) return;
    const belegId = await categorizedBeleg();
    let calls = 0;
    const createVoucher = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new LexofficeApiError(500, 'Lexoffice 5xx — temporär');
      return createResponse('voucher-retry');
    });

    const res = await exportBelegToLexware(T, belegId, ACTOR, {
      pool,
      s3: makeFakeS3(),
      lexofficeClient: makeFakeClient(createVoucher),
    });

    expect(res.status).toBe('pushed');
    expect(res.attempts).toBe(2);
    expect(createVoucher).toHaveBeenCalledTimes(2);
    expect(await getBelegStatus(belegId)).toBe('exported');
  }, 20_000);

  it('Final-Fail: dauerhaft 500 → nach 3 Versuchen failed (attempts=3)', async () => {
    if (!dbAvailable) return;
    const belegId = await categorizedBeleg();
    const createVoucher = vi.fn(async () => {
      throw new LexofficeApiError(500, 'Lexoffice 5xx — dauerhaft');
    });

    const res = await exportBelegToLexware(T, belegId, ACTOR, {
      pool,
      s3: makeFakeS3(),
      lexofficeClient: makeFakeClient(createVoucher),
      fetchImpl: vi.fn(async () => new Response(null, { status: 204 })),
    });

    expect(res.status).toBe('failed');
    expect(res.attempts).toBe(3);
    expect(createVoucher).toHaveBeenCalledTimes(3);
    expect(await getBelegStatus(belegId)).toBe('categorized');
  }, 20_000);

  it('Anhang best-effort: schlägt der S3-Download fehl, gilt der Beleg trotzdem als pushed', async () => {
    if (!dbAvailable) return;
    const belegId = await categorizedBeleg();
    const client = makeFakeClient(vi.fn(async () => createResponse('voucher-noattach')));

    const res = await exportBelegToLexware(T, belegId, ACTOR, {
      pool,
      s3: makeFakeS3({ fail: true }), // Download wirft → Anhang-Pfad schlägt fehl
      lexofficeClient: client,
    });

    expect(res.status).toBe('pushed');
    expect(await getBelegStatus(belegId)).toBe('exported');
  });
});
