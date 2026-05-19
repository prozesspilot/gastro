/**
 * T007/M01 — OCR-Service für die belege-Tabelle.
 *
 * Verantwortung:
 *   1. Belege aus der DB laden (per ID + tenant_id).
 *   2. Pre-Check: Daily-Limit pro Tenant nicht überschritten.
 *   3. Datei aus MinIO ziehen.
 *   4. Google-Vision-Adapter aufrufen (OCR).
 *   5. Felder extrahieren (ocr-field-extractor.ts — Betrag/Datum/Lieferant).
 *   6. Konfidenz kombinieren → Status entscheiden (extracted vs. requires_review).
 *   7. belege.payload + denormalisierte Spalten aktualisieren.
 *   8. ocr_cost_log hochzählen.
 *
 * Was hier NICHT passiert:
 *   * Retry-Logik → liegt in der BullMQ-Worker-Konfiguration.
 *   * Discord-Alert nach finalem Fail → Worker emittiert das nach „attemptsMade === maxAttempts".
 *   * Enqueue beim Upload → upload.handler.ts ruft enqueueOcrJob() auf.
 *
 * Tests setzen Vision-Adapter + S3-Client per Dependency-Injection.
 */

import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';

import type { OcrAdapter, OcrResult } from '../../../core/adapters/ocr/adapter.interface';
import { adapterFactory } from '../../../core/adapters/ocr/factory';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import {
  BEWIRTUNG_REVIEW_THRESHOLD,
  analyze as analyzeBewirtung,
} from '../../m03-categorization/services/bewirtungs-detector';
import {
  getBelegById,
  getOcrCallCountToday,
  incrementOcrCallCount,
  markBelegOcrFailed,
  updateBelegOcrResult,
  updateBelegStatus,
} from './beleg.repository';
import { extractLightFields } from './ocr-field-extractor';

export interface OcrServiceDeps {
  s3?: S3Client;
  ocrAdapter?: OcrAdapter;
}

export interface ProcessBelegResult {
  beleg_id: string;
  status: 'extracted' | 'requires_review' | 'error';
  ocr_confidence: number;
  overall_confidence: number;
  reason?: string;
}

const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Lädt das Original-File aus MinIO als Buffer.
 *
 * Eigener Helper (nicht aus services/storage-download.ts) weil der dort
 * gegen die alte receipts-Tabelle gebaut ist. Hier brauchen wir nur die Bytes.
 */
async function downloadFileBytes(s3: S3Client, key: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: config.MINIO_BUCKET, Key: key }));
  const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new Error(`Storage-Download leer: ${key}`);
  }
  const arr = await body.transformToByteArray();
  return Buffer.from(arr);
}

/**
 * Hauptfunktion: führt OCR auf einem Beleg aus und persistiert das Ergebnis.
 *
 * Wirft bei recoverable-Fehlern (Vision 5xx, S3 Timeout) — der BullMQ-Worker
 * macht dann den Retry. Wirft NICHT bei „Beleg nicht gefunden" oder
 * „Beleg im falschen Status" (gibt stattdessen `status: 'error'` zurück und
 * markiert den Beleg permanent — kein Retry sinnvoll).
 *
 * Wenn der Beleg bereits Status 'extracted' / 'requires_review' / 'error' hat,
 * wird er trotzdem neu prozessiert (Reprocess-Endpoint). Status='extracting'
 * → wir nehmen an, ein anderer Worker arbeitet schon dran, und brechen ab.
 */
export async function processBeleg(
  pool: Pool,
  tenantId: string,
  belegId: string,
  deps: OcrServiceDeps,
): Promise<ProcessBelegResult> {
  const ocrAdapter = deps.ocrAdapter ?? adapterFactory.for('google_vision');
  const s3 = deps.s3;
  if (!s3) {
    throw new Error('OCR-Service: S3-Client fehlt in Dependencies');
  }

  // 1. Beleg laden
  const beleg = await getBelegById(pool, tenantId, belegId);
  if (!beleg) {
    logger.warn({ tenantId, belegId }, '[m01-ocr] Beleg nicht gefunden');
    return {
      beleg_id: belegId,
      status: 'error',
      ocr_confidence: 0,
      overall_confidence: 0,
      reason: 'beleg_not_found',
    };
  }

  // 2. Status-Pre-Check: nur received / requires_review / error / extracted
  //    sind valide Eingangsstati. extracting bedeutet ein anderer Worker
  //    arbeitet bereits → abbrechen ohne Fail.
  if (beleg.status === 'extracting') {
    logger.info({ belegId }, '[m01-ocr] Beleg bereits in extracting — Skip');
    return {
      beleg_id: belegId,
      status: 'error',
      ocr_confidence: 0,
      overall_confidence: 0,
      reason: 'already_extracting',
    };
  }

  // 3. Daily-Cost-Limit prüfen
  // T007 Review-Fix M1: Race-Condition akzeptiert (Pilot-Volumen max 100/Monat,
  // Worker-Concurrency=2). Check + Vision-Call + Increment ist nicht atomar,
  // theoretisch kann Limit um max. Concurrency-Wert überschritten werden.
  // Empfehlung: OCR_DAILY_LIMIT_PER_TENANT mit 10% Sicherheitspuffer setzen
  // (z.B. 900 wenn Hard-Limit 1000). Bei höherer Concurrency später: Pre-Increment.
  const today = await getOcrCallCountToday(pool, tenantId, ocrAdapter.id);
  if (today >= config.OCR_DAILY_LIMIT_PER_TENANT) {
    logger.warn(
      { tenantId, belegId, today, limit: config.OCR_DAILY_LIMIT_PER_TENANT },
      '[m01-ocr] Daily-Limit pro Tenant erreicht — OCR übersprungen',
    );
    await markBelegOcrFailed(
      pool,
      tenantId,
      belegId,
      `OCR-Daily-Limit (${config.OCR_DAILY_LIMIT_PER_TENANT}/Tag) für Tenant erreicht`,
      1,
    );
    return {
      beleg_id: belegId,
      status: 'error',
      ocr_confidence: 0,
      overall_confidence: 0,
      reason: 'daily_limit_reached',
    };
  }

  // 4. Status auf extracting setzen (Lock gegen parallele Worker)
  await updateBelegStatus(pool, tenantId, belegId, 'extracting', {
    actorType: 'system',
    actorId: 'module:M01-OCR',
    reason: 'ocr_started',
  });

  // 5. Datei aus MinIO holen
  let fileBytes: Buffer;
  try {
    fileBytes = await downloadFileBytes(s3, beleg.file_object_key);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), belegId },
      '[m01-ocr] MinIO-Download fehlgeschlagen',
    );
    // Recoverable: re-throw damit BullMQ retried
    throw err;
  }

  // 6. OCR
  let ocr: OcrResult;
  try {
    ocr = await ocrAdapter.extract(fileBytes, { language_hints: ['de'] });
    // Cost-Tracking nur bei erfolgreichem Call hochzählen
    await incrementOcrCallCount(pool, tenantId, belegId, ocrAdapter.id);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), belegId },
      '[m01-ocr] OCR-Call fehlgeschlagen',
    );
    throw err;
  }

  // 7. Felder extrahieren
  const light = extractLightFields(ocr.raw_text);

  // 7b. T008/M03: Bewirtungs-Detection-Hook nach OCR + Field-Extraction.
  //     Pure-Function-Call, kein I/O — Ergebnis landet in payload.bewirtung,
  //     bei is_bewirtung=true setzen wir zusaetzlich category='bewirtung'.
  const bewirtung = analyzeBewirtung({
    rawText: ocr.raw_text,
    supplierName: light.fields.supplier_name ?? null,
  });

  // 8. Gesamt-Konfidenz: gewichtetes Mittel aus OCR-Konfidenz und Feld-Konfidenz.
  //    Beide gehen 50/50 ein.
  const overallConfidence = (ocr.confidence + light.overall_confidence) / 2;

  // 9. Validierung — simple checks (echte Plausibilität kommt in M03)
  const checks = {
    has_supplier: Boolean(light.fields.supplier_name),
    has_date: Boolean(light.fields.document_date),
    has_amount: Boolean(light.fields.total_gross),
    ocr_text_non_empty: ocr.raw_text.trim().length > 0,
  };
  const isValid = checks.has_supplier && checks.has_date && checks.has_amount;

  const issues: Array<{ code: string; field?: string; message: string }> = [];
  if (!checks.has_supplier)
    issues.push({
      code: 'MISSING_FIELD',
      field: 'supplier_name',
      message: 'Lieferant nicht erkannt.',
    });
  if (!checks.has_date)
    issues.push({
      code: 'MISSING_FIELD',
      field: 'document_date',
      message: 'Belegdatum nicht erkannt.',
    });
  if (!checks.has_amount)
    issues.push({
      code: 'MISSING_FIELD',
      field: 'total_gross',
      message: 'Brutto-Betrag nicht erkannt.',
    });
  if (overallConfidence < CONFIDENCE_THRESHOLD) {
    issues.push({
      code: 'LOW_CONFIDENCE',
      field: 'extraction.confidence',
      message: `OCR/Field-Konfidenz ${overallConfidence.toFixed(2)} unter Schwelle ${CONFIDENCE_THRESHOLD}`,
    });
  }

  let newStatus: 'extracted' | 'requires_review' =
    isValid && overallConfidence >= CONFIDENCE_THRESHOLD ? 'extracted' : 'requires_review';

  // T008: Bewirtungs-Detection → wenn match aber Konfidenz <0.7, zwinge
  // requires_review (Mitarbeiter muss Anlass/Teilnehmer bestaetigen vor
  // SKR04-Splitting). Pflichtfeld-Check + Buchungs-Splitting kommt in M03 Phase 2.
  if (bewirtung.is_bewirtung) {
    issues.push({
      code: 'BEWIRTUNG_DETECTED',
      field: 'category',
      message: `Bewirtungs-Beleg erkannt (Konfidenz ${bewirtung.confidence.toFixed(2)}). Anlass + Teilnehmer als Pflichtfelder eintragen.`,
    });
    if (bewirtung.confidence < BEWIRTUNG_REVIEW_THRESHOLD) {
      newStatus = 'requires_review';
    }
  }

  // T008: Optionale Category-Override — nur wenn noch keine gesetzt war.
  // Wenn ein User die category schon explizit gesetzt hat (zukuenftiges
  // Reprocess-Szenario), ueberschreiben wir nichts.
  const categoryForDenorm =
    bewirtung.is_bewirtung && !beleg.category ? 'bewirtung' : beleg.category;

  // 10. Persistieren
  await updateBelegOcrResult(pool, tenantId, belegId, {
    newStatus,
    extraction: {
      engine: ocrAdapter.id,
      engine_version: ocrAdapter.version,
      confidence: overallConfidence,
      raw_text: ocr.raw_text,
      fields: {
        ...light.fields,
        fields_confidence: light.confidence_per_field,
        ocr_confidence: ocr.confidence,
        ...(bewirtung.trinkgeld_cents !== null
          ? { trinkgeld_cents: bewirtung.trinkgeld_cents }
          : {}),
      },
      warnings: bewirtung.tax_split.splitting_required ? ['tax_split_required:7_19'] : [],
    },
    validation: { is_valid: isValid, issues, checks },
    denormalized: {
      supplier_name: light.fields.supplier_name ?? null,
      document_date: light.fields.document_date ?? null,
      total_gross: light.fields.total_gross ?? null,
      currency: light.fields.currency ?? null,
      category: categoryForDenorm,
    },
    audit: { actorType: 'system', actorId: 'module:M01-OCR' },
    bewirtung: bewirtung.is_bewirtung
      ? {
          confidence: bewirtung.confidence,
          indicators: bewirtung.indicators,
          tax_split: bewirtung.tax_split,
          trinkgeld_cents: bewirtung.trinkgeld_cents,
          matched_positions: bewirtung.matched_positions,
        }
      : undefined,
  });

  return {
    beleg_id: belegId,
    status: newStatus,
    ocr_confidence: ocr.confidence,
    overall_confidence: overallConfidence,
  };
}
