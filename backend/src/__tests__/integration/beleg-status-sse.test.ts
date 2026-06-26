/**
 * T074 — Integrationstest: Beleg-Statuswechsel pushen ein `beleg.status`-SSE-Event
 * an den Tenant-Kanal (damit der Wirt den Fortschritt im Web-Chat-Widget live sieht).
 *
 * Geprüft gegen echtes Postgres (Statuswechsel laufen in echten BEGIN/COMMIT-Tx):
 *   A) updateBelegStatus → 'extracting' pusht `beleg.status` mit EXAKT {beleg_id,status}.
 *   B) updateBelegOcrResult → 'extracted' pusht das Event und enthält KEINE PII
 *      (raw_text/Lieferant aus dem Payload tauchen im Stream NICHT auf).
 *   C) updateBelegCategorization → 'categorized' pusht das Event.
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 * Hinweis: audit_log ist append-only → frische prozesspilot_test-DB nötig
 * (CI ist ephemer = grün; lokal räumen before/afterAll auf).
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sseManager } from '../../core/sse/sse.manager';
import {
  insertBeleg,
  updateBelegCategorization,
  updateBelegOcrResult,
  updateBelegStatus,
} from '../../modules/m01-receipt-intake/services/beleg.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T = '0c0c0c0c-0074-4074-8074-000000000c01'; // T074-Test-Tenant

let pool: pg.Pool;
let dbAvailable = false;

/** Liest die data-JSON aus genau einem SSE-Chunk (`event: …\ndata: {…}\n\n`). */
function parseSseData(chunk: string): Record<string, unknown> {
  const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) throw new Error(`Keine data-Zeile im SSE-Chunk: ${JSON.stringify(chunk)}`);
  return JSON.parse(dataLine.slice('data: '.length));
}

/** Legt einen frischen Beleg an (eigener sha256 je Test → kein UNIQUE-Konflikt). */
async function freshBeleg(sha: string): Promise<string> {
  const { beleg } = await insertBeleg(pool, {
    tenantId: T,
    sourceChannel: 'web_chat',
    fileObjectKey: `test/t074-${sha.slice(0, 8)}.jpg`,
    fileMimeType: 'image/jpeg',
    fileSizeBytes: 1234,
    fileSha256: sha,
    uploadedByUserId: null,
    originalFilename: 't074-beleg.jpg',
  });
  return beleg.id;
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) {
      throw new Error(`[T074] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    }
    return;
  }

  // Seed (fresh DB). FK: belege/audit_log → tenants. Reihenfolge: Kinder zuerst.
  await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T, 't074-beleg-status', 'T074 Web-Chat Wirt', 'wirt-t074@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T]).catch(() => {});
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T074 — beleg.status SSE-Emit', () => {
  it('updateBelegStatus → extracting pusht beleg.status mit exakt {beleg_id,status}', async () => {
    if (!dbAvailable) return;
    const belegId = await freshBeleg('a'.repeat(64));

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      await updateBelegStatus(pool, T, belegId, 'extracting');
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    // Genau ein Event nach genau einem Statuswechsel.
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('event: beleg.status');
    // EXAKT {beleg_id,status} — keine zusätzlichen (PII-)Felder.
    expect(parseSseData(received[0])).toEqual({ beleg_id: belegId, status: 'extracting' });
  });

  it('updateBelegOcrResult → extracted pusht das Event OHNE PII (kein raw_text/Lieferant)', async () => {
    if (!dbAvailable) return;
    const belegId = await freshBeleg('b'.repeat(64));
    const SECRET_RAW = 'GEHEIM-PII-LIEFERANT-Mustermann-GmbH';

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      await updateBelegOcrResult(pool, T, belegId, {
        newStatus: 'extracted',
        extraction: {
          engine: 'google_vision',
          engine_version: 'test',
          confidence: 0.99,
          raw_text: SECRET_RAW,
          fields: { supplier_name: SECRET_RAW, total_gross: 42.5 },
          warnings: [],
        },
        validation: { is_valid: true, issues: [], checks: {} },
        denormalized: { supplier_name: SECRET_RAW, total_gross: 42.5 },
        audit: { actorType: 'system', actorId: 'module:M01-OCR' },
      });
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    expect(received).toHaveLength(1);
    expect(parseSseData(received[0])).toEqual({ beleg_id: belegId, status: 'extracted' });
    // PII-Garantie: nichts aus dem Extraktions-Payload landet im Wirt-Stream.
    expect(received[0]).not.toContain(SECRET_RAW);
    expect(received[0]).not.toContain('supplier');
    expect(received[0]).not.toContain('raw_text');
  });

  it('updateBelegCategorization → categorized pusht das Event', async () => {
    if (!dbAvailable) return;
    const belegId = await freshBeleg('c'.repeat(64));

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      await updateBelegCategorization(pool, T, belegId, {
        newStatus: 'categorized',
        category: 'wareneinkauf_food',
        categorization: {
          engine: 'test',
          category: 'wareneinkauf_food',
          category_label: 'Wareneinkauf Food',
          skr_account: '5100',
          skr_chart: 'SKR03',
          confidence: 0.91,
          rationale: 'test',
          categorized_at: '2026-06-26T00:00:00.000Z',
        },
        audit: { actorType: 'system', actorId: 'module:M03' },
      });
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    expect(received).toHaveLength(1);
    expect(parseSseData(received[0])).toEqual({ beleg_id: belegId, status: 'categorized' });
  });
});
