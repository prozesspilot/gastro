/**
 * T021 — Bewirtungs-Detektor-Worker (M03 Event-Consumer)
 *
 * Konsumiert Events vom gastro:receipts Redis-Stream (Consumer Group
 * 'm03-bewirtung-detector'). Fuer jeden 'gastro.receipt.extracted'-Event:
 *
 *   1. Tenant-Setting pruefen: modules_enabled enthaelt 'M03'?
 *      → Nein: XACK + Skip (kein Fehler, Tenant hat M03 deaktiviert)
 *   2. analyzeBewirtung(rawText, supplierName) aufrufen (pure function)
 *   3. Ergebnis in belege.payload.bewirtung + ggf. category + status persistieren
 *
 * Feature-Flag: Wird nur gestartet wenn ENABLE_EVENT_DRIVEN_M03=1 in ENV.
 *
 * Lifecycle:
 *   startBewirtungDetectorWorker(deps) — erzeugt + startet den Worker
 *   stopBewirtungDetectorWorker()      — graceful shutdown (Tests + SIGTERM)
 */

import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { createConsumerGroup, startWorker } from '../core/events/consumer';
import type { RawStreamMessage } from '../core/events/types';
import { STREAMS } from '../core/events/types';
import { logger } from '../core/logger';
import { updateBelegBewirtung } from '../modules/m01-receipt-intake/services/beleg.repository';
import {
  BEWIRTUNG_REVIEW_THRESHOLD,
  analyze as analyzeBewirtung,
} from '../modules/m03-categorization/services/bewirtungs-detector';

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface BewirtungDetectorDeps {
  db: Pool;
  redis: Redis;
}

// ── Tenant-Setting-Check ─────────────────────────────────────────────────────

/**
 * Prueft ob M03 fuer den Tenant aktiviert ist.
 * Direkte Query ohne RLS — gastro_app hat SELECT-Recht auf tenant_settings.
 * DECISION (T021): Kein set_config(tenant_id) noetig, weil wir per tenant_id
 * filtern und tenant_settings-RLS nur INSERT/UPDATE abschottet, nicht SELECT.
 */
async function isM03EnabledForTenant(db: Pool, tenantId: string): Promise<boolean> {
  const result = await db.query<{ enabled: boolean }>(
    `SELECT modules_enabled @> '["M03"]'::jsonb AS enabled
       FROM tenant_settings
      WHERE tenant_id = $1`,
    [tenantId],
  );
  return result.rows[0]?.enabled ?? false;
}

// ── Event-Payload-Parser ─────────────────────────────────────────────────────

interface ReceiptExtractedPayload {
  beleg_id: string;
  tenant_id: string;
  raw_text: string;
  supplier_name: string | null;
}

function parseEventPayload(fields: RawStreamMessage): ReceiptExtractedPayload | null {
  if (fields.type !== 'gastro.receipt.extracted') return null;
  try {
    const payload = JSON.parse(fields.payload) as unknown;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as Record<string, unknown>).beleg_id !== 'string' ||
      typeof (payload as Record<string, unknown>).tenant_id !== 'string' ||
      typeof (payload as Record<string, unknown>).raw_text !== 'string'
    ) {
      return null;
    }
    const p = payload as Record<string, unknown>;
    return {
      beleg_id: p.beleg_id as string,
      tenant_id: p.tenant_id as string,
      raw_text: p.raw_text as string,
      supplier_name: typeof p.supplier_name === 'string' ? p.supplier_name : null,
    };
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

/**
 * Exportiert fuer Unit-Tests — kein Redis/Worker-Boilerplate noetig.
 */
export function buildBewirtungEventHandler(deps: BewirtungDetectorDeps) {
  return async function handleReceiptExtracted(
    messageId: string,
    fields: RawStreamMessage,
  ): Promise<void> {
    // Ignoriere unbekannte Event-Typen (Future-proof)
    if (fields.type !== 'gastro.receipt.extracted') {
      logger.debug(
        { messageId, type: fields.type },
        '[bewirtung-worker] Unbekannter Event-Typ — Skip',
      );
      return;
    }

    const payload = parseEventPayload(fields);
    if (!payload) {
      logger.warn({ messageId }, '[bewirtung-worker] Payload-Parse fehlgeschlagen — Skip');
      return;
    }

    const {
      beleg_id: belegId,
      tenant_id: tenantId,
      raw_text: rawText,
      supplier_name: supplierName,
    } = payload;

    // 1. Tenant-Check: M03 aktiviert?
    const m03Enabled = await isM03EnabledForTenant(deps.db, tenantId);
    if (!m03Enabled) {
      logger.debug(
        { belegId, tenantId },
        '[bewirtung-worker] M03 nicht aktiviert fuer Tenant — Skip',
      );
      return;
    }

    // 2. Bewirtungs-Detektion (pure function, kein I/O)
    const bewirtung = analyzeBewirtung({ rawText, supplierName });

    // DSGVO-HINWEIS: raw_text wird NIEMALS geloggt — er kann Betrags- und
    // Lieferanten-Daten enthalten, aber auch Kommentartext. Der Detector
    // analysiert ihn, wir loggen nur das Result.
    logger.info(
      {
        belegId,
        tenantId,
        is_bewirtung: bewirtung.is_bewirtung,
        confidence: bewirtung.confidence,
      },
      '[bewirtung-worker] Bewirtungs-Detection abgeschlossen',
    );

    // 3. Ergebnis persistieren
    let newCategory: string | null = null;
    let newStatus: 'extracted' | 'requires_review' | undefined;

    if (bewirtung.is_bewirtung) {
      newCategory = 'bewirtung';
      if (bewirtung.confidence < BEWIRTUNG_REVIEW_THRESHOLD) {
        newStatus = 'requires_review';
      }
    }

    await updateBelegBewirtung(deps.db, tenantId, belegId, {
      bewirtung: {
        is_bewirtung: bewirtung.is_bewirtung,
        confidence: bewirtung.confidence,
        indicators: bewirtung.indicators,
        matched_positions: bewirtung.matched_positions,
        trinkgeld_cents: bewirtung.trinkgeld_cents,
        tax_split: bewirtung.tax_split,
      },
      category: newCategory,
      newStatus,
    });

    logger.info(
      { belegId, tenantId, newCategory, newStatus },
      '[bewirtung-worker] Bewirtungs-Ergebnis persistiert',
    );
  };
}

// ── Worker Lifecycle ──────────────────────────────────────────────────────────

const CONSUMER_GROUP = 'm03-bewirtung-detector';
const CONSUMER_NAME = 'worker-1';

let stopController: AbortController | null = null;
let workerPromise: Promise<void> | null = null;

/**
 * Startet den Bewirtungs-Detektor-Worker.
 * Nur aufrufen wenn ENABLE_EVENT_DRIVEN_M03=1.
 */
export async function startBewirtungDetectorWorker(deps: BewirtungDetectorDeps): Promise<void> {
  if (stopController) {
    logger.warn('[bewirtung-worker] Worker bereits gestartet');
    return;
  }

  // Consumer Group erstellen (idempotent — BUSYGROUP-Error wird ignoriert)
  await createConsumerGroup(deps.redis, STREAMS.receipts, CONSUMER_GROUP);

  stopController = new AbortController();
  const handler = buildBewirtungEventHandler(deps);

  workerPromise = startWorker(
    deps.redis,
    STREAMS.receipts,
    CONSUMER_GROUP,
    CONSUMER_NAME,
    handler,
    stopController.signal,
  );

  logger.info({ stream: STREAMS.receipts, group: CONSUMER_GROUP }, '[bewirtung-worker] Gestartet');
}

/**
 * Graceful shutdown. Wird vom SIGTERM-Handler in server.ts aufgerufen.
 */
export async function stopBewirtungDetectorWorker(): Promise<void> {
  if (!stopController) return;
  stopController.abort();
  stopController = null;
  if (workerPromise) {
    await workerPromise.catch(() => undefined);
    workerPromise = null;
  }
  logger.info('[bewirtung-worker] Gestoppt');
}
