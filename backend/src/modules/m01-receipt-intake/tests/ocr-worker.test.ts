/**
 * T007 — Tests für die OCR-Worker-Job-Processor-Factory.
 *
 * Wir testen NUR den Job-Processor (nicht das BullMQ-Lifecycle), denn der
 * BullMQ-Worker-Setup braucht Redis. Der Processor delegiert an
 * ocr.service.processBeleg() und wandelt das Ergebnis in OcrJobResult.
 *
 * Deckt ab:
 *   - Happy-Path: processBeleg ergibt 'extracted' → JobResult.status='extracted'
 *   - Service wirft (Recoverable) → Job-Processor wirft (BullMQ retried)
 *   - attemptsMade wird korrekt in den Log-Output gegeben (verbal-prüfung
 *     entfällt — wir vergewissern uns dass die Funktion nicht crasht)
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable Config-Mock: T077-Auto-Kategorisieren ist auf CLAUDE_API_KEY gegated.
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: { CLAUDE_API_KEY: '', OCR_MAX_ATTEMPTS: 3 },
}));
vi.mock('../../../core/config', () => ({ config: mockConfig }));

vi.mock('../services/ocr.service', () => ({
  processBeleg: vi.fn(),
}));

// T077: Auto-Kategorisieren nach OCR (geteilter Service).
vi.mock('../../m03-categorization/services/categorize.service', () => ({
  categorizeBelegById: vi.fn(),
}));

import { buildOcrJobProcessor } from '../../../workers/ocr-worker';
import { categorizeBelegById } from '../../m03-categorization/services/categorize.service';
import { processBeleg } from '../services/ocr.service';

const TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const BELEG_UUID = '550e8400-e29b-41d4-a716-446655440001';

const db = {} as unknown as Pool;
const s3 = {} as unknown as S3Client;

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.CLAUDE_API_KEY = '';
});

describe('buildOcrJobProcessor', () => {
  it('Happy-Path: delegiert an processBeleg, mappt status durch', async () => {
    (processBeleg as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'extracted',
      ocr_confidence: 0.95,
      overall_confidence: 0.82,
    });

    const processor = buildOcrJobProcessor({ db, s3 });
    const result = await processor({
      id: 'ocr:test',
      data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'upload' },
      attemptsMade: 0,
    });

    expect(result.status).toBe('extracted');
    expect(result.overall_confidence).toBeCloseTo(0.82);
    expect(processBeleg).toHaveBeenCalledWith(db, TENANT_UUID, BELEG_UUID, { s3 });
  });

  it('requires_review wird durchgereicht', async () => {
    (processBeleg as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'requires_review',
      ocr_confidence: 0.5,
      overall_confidence: 0.4,
    });

    const processor = buildOcrJobProcessor({ db, s3 });
    const result = await processor({
      id: 'ocr:test',
      data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'reprocess' },
      attemptsMade: 1,
    });

    expect(result.status).toBe('requires_review');
  });

  it('processBeleg wirft → Processor wirft (BullMQ-Retry-Hook)', async () => {
    (processBeleg as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Vision 503 Service Unavailable'),
    );

    const processor = buildOcrJobProcessor({ db, s3 });

    await expect(
      processor({
        id: 'ocr:test',
        data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'upload' },
        attemptsMade: 0,
      }),
    ).rejects.toThrow('Vision 503');
  });

  it('Fehler-Status (z. B. daily_limit_reached) wird durchgereicht — kein Throw', async () => {
    // processBeleg gibt status='error' zurück (final, kein Retry sinnvoll).
    // Der Job muss SUCCESS sein, damit BullMQ ihn nicht retried.
    (processBeleg as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'error',
      ocr_confidence: 0,
      overall_confidence: 0,
      reason: 'daily_limit_reached',
    });

    const processor = buildOcrJobProcessor({ db, s3 });
    const result = await processor({
      id: 'ocr:test',
      data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'upload' },
      attemptsMade: 0,
    });

    expect(result.status).toBe('error');
    expect(result.reason).toBe('daily_limit_reached');
  });
});

describe('T077 — Auto-Kategorisieren nach OCR', () => {
  const cat = categorizeBelegById as ReturnType<typeof vi.fn>;

  function extractedBeleg() {
    (processBeleg as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'extracted',
      ocr_confidence: 0.95,
      overall_confidence: 0.82,
    });
  }

  it('triggert categorizeBelegById nach extracted + gesetztem CLAUDE_API_KEY (actor=system)', async () => {
    mockConfig.CLAUDE_API_KEY = 'sk-test';
    extractedBeleg();
    cat.mockResolvedValue({ ok: true, status: 'categorized', categorization: {} });

    const processor = buildOcrJobProcessor({ db, s3 });
    const result = await processor({
      id: 'ocr:test',
      data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'upload' },
      attemptsMade: 0,
    });

    expect(result.status).toBe('extracted');
    expect(cat).toHaveBeenCalledTimes(1);
    expect(cat).toHaveBeenCalledWith(db, TENANT_UUID, BELEG_UUID, {
      actor: { type: 'system', id: null },
    });
  });

  it('ohne CLAUDE_API_KEY → KEIN Auto-Kategorisieren (Beleg bleibt extracted)', async () => {
    mockConfig.CLAUDE_API_KEY = '';
    extractedBeleg();

    const processor = buildOcrJobProcessor({ db, s3 });
    await processor({
      id: 'ocr:test',
      data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'upload' },
      attemptsMade: 0,
    });

    expect(cat).not.toHaveBeenCalled();
  });

  it('bei Status ≠ extracted (requires_review) → KEIN Auto-Kategorisieren', async () => {
    mockConfig.CLAUDE_API_KEY = 'sk-test';
    (processBeleg as ReturnType<typeof vi.fn>).mockResolvedValue({
      beleg_id: BELEG_UUID,
      status: 'requires_review',
      ocr_confidence: 0.5,
      overall_confidence: 0.4,
    });

    const processor = buildOcrJobProcessor({ db, s3 });
    await processor({
      id: 'ocr:test',
      data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'upload' },
      attemptsMade: 0,
    });

    expect(cat).not.toHaveBeenCalled();
  });

  it('Categorize-Fehler bricht den OCR-Job NICHT ab (best-effort)', async () => {
    mockConfig.CLAUDE_API_KEY = 'sk-test';
    extractedBeleg();
    cat.mockRejectedValue(new Error('Claude 529 overloaded'));

    const processor = buildOcrJobProcessor({ db, s3 });
    const result = await processor({
      id: 'ocr:test',
      data: { tenantId: TENANT_UUID, belegId: BELEG_UUID, reason: 'upload' },
      attemptsMade: 0,
    });

    // Job bleibt erfolgreich (kein Throw) → BullMQ retried NICHT.
    expect(result.status).toBe('extracted');
    expect(cat).toHaveBeenCalledTimes(1);
  });
});
