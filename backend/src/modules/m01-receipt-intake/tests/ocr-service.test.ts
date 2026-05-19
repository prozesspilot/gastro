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
});
