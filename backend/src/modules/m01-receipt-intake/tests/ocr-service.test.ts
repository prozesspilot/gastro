/**
 * T007/M01 — Tests für ocr.service.processBeleg().
 *
 * Strategie:
 *   * S3-Client + OCR-Adapter werden gemockt (Dependency-Injection).
 *   * Repository-Funktionen werden via vi.mock auf das Modul umgebogen —
 *     wir prüfen die Aufrufe, nicht die DB.
 *
 * Deckt ab:
 *   - Happy-Path: received → extracting → extracted (hohe Konfidenz)
 *   - Low-Confidence-Path → requires_review
 *   - Daily-Limit überschritten → markBelegOcrFailed, kein OCR-Call
 *   - Beleg nicht gefunden → status='error' (kein retry sinnvoll)
 *   - Beleg bereits in 'extracting' → Skip ohne Fail
 *   - OCR-Adapter wirft → re-throws (Worker-Retry-Hook)
 */

import type { S3Client } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrAdapter, OcrResult } from '../../../core/adapters/ocr/adapter.interface';
import { processBeleg } from '../services/ocr.service';

// Repository komplett mocken — wir verifizieren Aufrufe statt DB-State.
vi.mock('../services/beleg.repository', () => ({
  getBelegById: vi.fn(),
  getOcrCallCountToday: vi.fn(),
  incrementOcrCallCount: vi.fn(async () => ({ call_count: 1, day: '2026-05-19' })),
  markBelegOcrFailed: vi.fn(),
  updateBelegOcrResult: vi.fn(),
  updateBelegStatus: vi.fn(),
}));

// Wir importieren die Mocks NACH dem vi.mock-Call, damit TypeScript sie sieht.
import {
  getBelegById,
  getOcrCallCountToday,
  incrementOcrCallCount,
  markBelegOcrFailed,
  updateBelegOcrResult,
  updateBelegStatus,
} from '../services/beleg.repository';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const BELEG_UUID = '550e8400-e29b-41d4-a716-446655440001';

function makeBeleg(overrides: Record<string, unknown> = {}) {
  return {
    id: BELEG_UUID,
    tenant_id: TENANT_UUID,
    status: 'received',
    file_object_key: `${TENANT_UUID}/originals/2026/05/abc.jpg`,
    file_mime_type: 'image/jpeg',
    file_size_bytes: 1024,
    file_sha256: 'a'.repeat(64),
    payload: {},
    supplier_name: null,
    document_date: null,
    total_gross: null,
    currency: 'EUR',
    category: null,
    source_channel: 'manual_upload',
    source_external_id: null,
    received_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeMockS3(): S3Client {
  return {
    send: vi.fn(async () => ({
      Body: {
        transformToByteArray: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      },
    })),
  } as unknown as S3Client;
}

function makeMockOcrAdapter(result: Partial<OcrResult> & { raw_text: string }): OcrAdapter {
  return {
    id: 'google_vision',
    version: 'v1-test',
    extract: vi.fn(
      async (): Promise<OcrResult> => ({
        raw_text: result.raw_text,
        confidence: result.confidence ?? 0.95,
        blocks: result.blocks ?? [],
        words: result.words ?? [],
        page_count: result.page_count ?? 1,
      }),
    ),
  };
}

const noopDb = {} as unknown as import('pg').Pool;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: Daily-Limit nicht erreicht
  (getOcrCallCountToday as ReturnType<typeof vi.fn>).mockResolvedValue(0);
});

describe('ocr.service.processBeleg', () => {
  it('Happy-Path: vollständiger Beleg → status=extracted', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());

    const rawText = `Pizzeria Bella Italia
Datum: 28.04.2026
Gesamtbetrag: 142,85 EUR`;
    const adapter = makeMockOcrAdapter({ raw_text: rawText, confidence: 0.95 });

    const result = await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    expect(result.status).toBe('extracted');
    expect(result.overall_confidence).toBeGreaterThan(0.6);
    // Status-Übergang received → extracting wurde geschrieben
    expect(updateBelegStatus).toHaveBeenCalledWith(
      noopDb,
      TENANT_UUID,
      BELEG_UUID,
      'extracting',
      expect.any(Object),
    );
    expect(updateBelegOcrResult).toHaveBeenCalledTimes(1);
    expect(incrementOcrCallCount).toHaveBeenCalledTimes(1);
    expect(markBelegOcrFailed).not.toHaveBeenCalled();
  });

  it('Low-Confidence: leerer OCR-Text → requires_review', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());

    const adapter = makeMockOcrAdapter({ raw_text: '', confidence: 0.1 });

    const result = await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    expect(result.status).toBe('requires_review');
    expect(updateBelegOcrResult).toHaveBeenCalled();
    const call = (updateBelegOcrResult as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].newStatus).toBe('requires_review');
    expect(call[3].validation.is_valid).toBe(false);
  });

  it('Daily-Limit erreicht: kein OCR-Call, Beleg auf error', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());
    (getOcrCallCountToday as ReturnType<typeof vi.fn>).mockResolvedValue(1000);

    const adapter = makeMockOcrAdapter({ raw_text: 'irrelevant' });

    const result = await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    expect(result.status).toBe('error');
    expect(result.reason).toBe('daily_limit_reached');
    expect(adapter.extract).not.toHaveBeenCalled();
    expect(markBelegOcrFailed).toHaveBeenCalled();
    expect(incrementOcrCallCount).not.toHaveBeenCalled();
  });

  it('Beleg nicht gefunden → status=error mit reason', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const adapter = makeMockOcrAdapter({ raw_text: 'irrelevant' });

    const result = await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    expect(result.status).toBe('error');
    expect(result.reason).toBe('beleg_not_found');
    expect(adapter.extract).not.toHaveBeenCalled();
    expect(updateBelegStatus).not.toHaveBeenCalled();
  });

  it('Beleg bereits in extracting → Skip ohne Fail', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBeleg({ status: 'extracting' }),
    );

    const adapter = makeMockOcrAdapter({ raw_text: 'irrelevant' });

    const result = await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    expect(result.status).toBe('error');
    expect(result.reason).toBe('already_extracting');
    expect(adapter.extract).not.toHaveBeenCalled();
    expect(updateBelegStatus).not.toHaveBeenCalled();
  });

  it('OCR-Adapter wirft → Exception propagiert (BullMQ-Retry)', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());

    const adapter: OcrAdapter = {
      id: 'google_vision',
      version: 'v1-test',
      extract: vi.fn(async () => {
        throw new Error('Vision 503 Service Unavailable');
      }),
    };

    await expect(
      processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
        s3: makeMockS3(),
        ocrAdapter: adapter,
      }),
    ).rejects.toThrow('Vision 503');

    // Status wurde auf extracting gesetzt — BullMQ retried, Folge-Lauf hebt es
    expect(updateBelegStatus).toHaveBeenCalledWith(
      noopDb,
      TENANT_UUID,
      BELEG_UUID,
      'extracting',
      expect.any(Object),
    );
    expect(incrementOcrCallCount).not.toHaveBeenCalled();
  });

  it('fehlender S3-Client → wirft Exception (Bootstrap-Fehler)', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());

    const adapter = makeMockOcrAdapter({ raw_text: 'foo' });

    await expect(
      // s3 explizit undefined
      processBeleg(noopDb, TENANT_UUID, BELEG_UUID, { ocrAdapter: adapter }),
    ).rejects.toThrow('S3-Client');
  });

  // ── T008-Review-Fix #5: Integration-Tests fuer requires_review-Force-Logik ──

  it('T008: Bewirtungs-Beleg mit hoher Konfidenz (>=0.7) bleibt extracted', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());

    // Beleg mit 3 Bewirtungs-Indikatoren → confidence = 0.75
    const rawText = `Pizzeria Bella Italia
Datum: 28.04.2026
Tisch 5, Gedeck 2 Personen
Pizza Margherita      8,50 EUR
Pasta Carbonara      12,00 EUR
Wein (Glas)           5,00 EUR
Trinkgeld:            2,50 EUR
Gesamtbetrag:        28,00 EUR`;
    const adapter = makeMockOcrAdapter({ raw_text: rawText, confidence: 0.95 });

    const result = await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    // Bei hoher Bewirtungs-Konfidenz (>=0.7) bleibt der Status 'extracted'
    expect(result.status).toBe('extracted');

    const call = (updateBelegOcrResult as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].newStatus).toBe('extracted');
    // payload.bewirtung wurde befuellt
    expect(call[3].bewirtung).toBeDefined();
    expect(call[3].bewirtung.confidence).toBeGreaterThanOrEqual(0.7);
    // category wurde auf 'bewirtung' gesetzt
    expect(call[3].denormalized.category).toBe('bewirtung');
  });

  it('T008: Bewirtungs-Beleg mit mittlerer Konfidenz (0.5..0.7) erzwingt requires_review', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());

    // Nur 2 von 4 Bewirtungs-Indikatoren (supplier + context) → confidence = 0.5.
    // Aber: ein vollstaendiger Beleg (Lieferant + Datum + Betrag) hat hohe
    // overall OCR-Konfidenz → ohne Bewirtungs-Override waere status=extracted.
    const rawText = `Restaurant Adler
01.05.2026
Tisch reserviert
Gesamtbetrag: 50,00 EUR`;
    const adapter = makeMockOcrAdapter({ raw_text: rawText, confidence: 0.95 });

    const result = await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    expect(result.status).toBe('requires_review');

    const call = (updateBelegOcrResult as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].newStatus).toBe('requires_review');
    expect(call[3].bewirtung).toBeDefined();
    expect(call[3].bewirtung.confidence).toBeGreaterThanOrEqual(0.5);
    expect(call[3].bewirtung.confidence).toBeLessThan(0.7);
    // category trotzdem auf 'bewirtung' (Detection war positiv, nur unsicher)
    expect(call[3].denormalized.category).toBe('bewirtung');
    // Validation-Issue enthaelt BEWIRTUNG_DETECTED
    const issues = call[3].validation.issues as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'BEWIRTUNG_DETECTED')).toBe(true);
  });

  it('T008: Non-Bewirtungs-Beleg setzt warnings nicht (Splitting-Warning-Guard)', async () => {
    (getBelegById as ReturnType<typeof vi.fn>).mockResolvedValue(makeBeleg());

    // Metro-Beleg: 7% UND 19% im Text, ABER kein Bewirtungs-Kontext.
    // Vor dem Fix war das ein false-positive Splitting-Warning.
    const rawText = `Metro Cash & Carry
01.05.2026
Mehl 25kg (7% MwSt)         20,00 EUR
Reinigungsmittel (19% MwSt)  5,00 EUR
Gesamtbetrag:               25,00 EUR`;
    const adapter = makeMockOcrAdapter({ raw_text: rawText, confidence: 0.95 });

    await processBeleg(noopDb, TENANT_UUID, BELEG_UUID, {
      s3: makeMockS3(),
      ocrAdapter: adapter,
    });

    const call = (updateBelegOcrResult as ReturnType<typeof vi.fn>).mock.calls[0];
    // Kein Bewirtungs-Match → bewirtung-payload bleibt undefined
    expect(call[3].bewirtung).toBeUndefined();
    // Warnings darf KEIN tax_split_required:7_19 enthalten (Bewirtungs-spezifisch)
    expect(call[3].extraction.warnings).not.toContain('tax_split_required:7_19');
  });
});
