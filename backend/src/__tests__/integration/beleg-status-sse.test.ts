/**
 * T074 — Integrationstest: Beleg-Statuswechsel pushen ein `beleg.status`-SSE-Event
 * an den Tenant-Kanal (damit der Wirt den Fortschritt im Web-Chat-Widget live sieht).
 *
 * Geprüft gegen echtes Postgres (Statuswechsel laufen in echten BEGIN/COMMIT-Tx).
 * Alle 6 Status-Writer sind abgedeckt — die 4 nullable-Writer (if-updated-Gate) plus
 * die 2 unbedingt emittierenden (confirmBelegReview, markBelegExported mit rowCount-Gate):
 *   A) updateBelegStatus → 'extracting' pusht `beleg.status` mit EXAKT {beleg_id,status}.
 *   B) updateBelegOcrResult → 'extracted' pusht das Event und enthält KEINE PII
 *      (raw_text/Lieferant aus dem Payload tauchen im Stream NICHT auf).
 *   C) updateBelegCategorization → 'categorized' pusht das Event.
 *   D) markBelegOcrFailed → 'error' pusht das Event (terminaler Status).
 *   E) confirmBelegReview → 'categorized' pusht das Event (Staff-Freigabe; unbedingter Emit).
 *   F) markBelegExported → 'exported' pusht das Event (letzter Wirt-sichtbarer Schritt).
 *   G) NEGATIV/updateBelegStatus: nicht-existenter Beleg → früher `return null` VOR dem
 *      UPDATE → KEIN Event (zusätzlich vom `if (updated)`-Guard abgesichert).
 *   H) NEGATIV/markBelegExported: nicht-existenter Beleg → rowCount 0 → KEIN Event
 *      (beweist das rowCount-Gate gegen Phantom-Emit beim unbedingten Exporter-Pfad).
 * Die Reihenfolge „Emit NACH COMMIT" ist zusätzlich durch die Code-Platzierung
 * garantiert — jeder Emit steht hinter `await client.query('COMMIT')`.
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 * audit_log ist append-only (BEFORE-DELETE-Trigger) → Cleanup läuft als Superuser
 * in einer Tx mit `SET LOCAL app.bypass_rls/app.audit_maintenance = 'on'`
 * (kanonischer Pattern aus tests/migrations/schema.test.ts) → Test ist lokal
 * RE-RUNNABLE, nicht nur in der ephemeren CI-DB grün.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sseManager } from '../../core/sse/sse.manager';
import {
  confirmBelegReview,
  insertBeleg,
  markBelegOcrFailed,
  updateBelegCategorization,
  updateBelegOcrResult,
  updateBelegStatus,
} from '../../modules/m01-receipt-intake/services/beleg.repository';
import { markBelegExported } from '../../modules/m05-lexoffice/services/belege-lexware-exporter';

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

/**
 * Räumt audit_log für den Test-Tenant. audit_log hat einen append-only
 * BEFORE-DELETE-Trigger (060_audit_log.sql), der ohne Maintenance-Flag wirft.
 * Daher als Superuser (pp) in einer Tx mit gesetzten GUCs löschen — exakt der
 * Pattern aus tests/migrations/schema.test.ts. Best-effort.
 */
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
  await purgeAuditLog(); // append-only Trigger → Maintenance-Mode nötig
  await pool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T, 't074-beleg-status', 'T074 Web-Chat Wirt', 'wirt-t074@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM belege WHERE tenant_id = $1', [T]).catch(() => {});
    await purgeAuditLog();
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

  it('markBelegOcrFailed → error pusht das Event (terminaler Status)', async () => {
    if (!dbAvailable) return;
    const belegId = await freshBeleg('d'.repeat(64));

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      await markBelegOcrFailed(pool, T, belegId, 'boom', 3);
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    expect(received).toHaveLength(1);
    expect(parseSseData(received[0])).toEqual({ beleg_id: belegId, status: 'error' });
  });

  it('confirmBelegReview → categorized pusht das Event (Staff-Freigabe)', async () => {
    if (!dbAvailable) return;
    const belegId = await freshBeleg('f'.repeat(64));
    // Gate von confirmBelegReview: Beleg muss zuerst in requires_review sein.
    // Dieser Statuswechsel emittiert selbst — passiert aber VOR dem subscribe.
    await updateBelegStatus(pool, T, belegId, 'requires_review');

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      const res = await confirmBelegReview(pool, T, belegId, {
        actorType: 'staff',
        actorId: 'module:M03-test',
      });
      expect(res).not.toBeNull();
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    expect(received).toHaveLength(1);
    expect(parseSseData(received[0])).toEqual({ beleg_id: belegId, status: 'categorized' });
  });

  it('markBelegExported → exported pusht das Event (letzter Wirt-sichtbarer Schritt)', async () => {
    if (!dbAvailable) return;
    const belegId = await freshBeleg('e'.repeat(64));

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      await markBelegExported(
        pool,
        T,
        belegId,
        'lexware-ext-t074',
        'https://app.lexoffice.de/voucher/t074',
        'module:M05-test',
      );
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    expect(received).toHaveLength(1);
    expect(parseSseData(received[0])).toEqual({ beleg_id: belegId, status: 'exported' });
  });

  it('NEGATIV/markBelegExported: nicht-existenter Beleg → rowCount 0 → KEIN Event', async () => {
    if (!dbAvailable) return;
    // markBelegExported emittiert UNBEDINGT (kein if-updated), aber gegated über
    // rowCount === 1. Ein UPDATE auf eine nicht-existente id trifft 0 Rows → kein Emit.
    const MISSING = '0c0c0c0c-0074-4074-8074-0000000eeeee';

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      await markBelegExported(pool, T, MISSING, 'x', null, 'module:M05-test');
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    expect(received).toHaveLength(0);
  });

  it('NEGATIV/updateBelegStatus: nicht-existenter Beleg → null → KEIN Event', async () => {
    if (!dbAvailable) return;
    // updateBelegStatus findet 0 Rows im Vorab-SELECT → früher `return null` VOR dem
    // UPDATE, also gar kein Emit. (Der `if (updated)`-Guard fängt denselben Fall
    // zusätzlich ab.) Beweist: ein nicht-committeter Statuswechsel pusht nie ein Event.
    const MISSING = '0c0c0c0c-0074-4074-8074-0000000fffff';

    const received: string[] = [];
    const sink = {
      write: (chunk: string): boolean => {
        received.push(chunk);
        return true;
      },
    };
    sseManager.subscribe(T, sink);
    try {
      const res = await updateBelegStatus(pool, T, MISSING, 'extracting');
      expect(res).toBeNull();
    } finally {
      sseManager.unsubscribe(T, sink);
    }

    expect(received).toHaveLength(0);
  });
});
