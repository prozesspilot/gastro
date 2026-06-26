/**
 * T077 — Tests für den geteilten categorize.service.
 * Repository gemockt (keine DB), Categorizer injiziert. Fokus: Outcome-Shape +
 * Actor-Mapping (system/staff) — die Verhaltens-Logik selbst ist zusätzlich über
 * belege-categorize.handler.test.ts (T048) abgedeckt.
 */
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BelegCategorizationResult } from '../services/belege-categorizer';

const { getBelegById, updateBelegCategorization, confirmBelegReview } = vi.hoisted(() => ({
  getBelegById: vi.fn(),
  updateBelegCategorization: vi.fn(),
  confirmBelegReview: vi.fn(),
}));

vi.mock('../../m01-receipt-intake/services/beleg.repository', () => ({
  getBelegById,
  updateBelegCategorization,
  confirmBelegReview,
}));

import { categorizeBelegById, confirmBelegReviewById } from '../services/categorize.service';

const db = {} as unknown as Pool;

function result(over: Partial<BelegCategorizationResult> = {}): BelegCategorizationResult {
  return {
    categoryId: 'wareneinkauf_food',
    categoryLabel: 'Wareneinkauf Lebensmittel',
    skrAccount: '3100',
    skrChart: 'SKR03',
    confidence: 0.95,
    rationale: 'ok',
    engine: 'claude',
    ...over,
  };
}

beforeEach(() => {
  getBelegById.mockReset();
  updateBelegCategorization.mockReset();
  confirmBelegReview.mockReset();
});

describe('categorizeBelegById (T077)', () => {
  it('extracted + sichere KI → ok/categorized', async () => {
    getBelegById.mockResolvedValue({ status: 'extracted', payload: {} });
    updateBelegCategorization.mockResolvedValue({ status: 'categorized' });

    const outcome = await categorizeBelegById(db, 'tenant-1', 'beleg-1', {
      actor: { type: 'staff', id: 'user-1' },
      deps: { categorize: async () => result() },
    });

    expect(outcome).toMatchObject({ ok: true, status: 'categorized' });
    if (outcome.ok) {
      expect(outcome.categorization.requires_review).toBe(false);
      expect(outcome.categorization.category).toBe('wareneinkauf_food');
    }
  });

  it('extracted + Fallback-Engine → ok/requires_review', async () => {
    getBelegById.mockResolvedValue({ status: 'extracted', payload: {} });
    updateBelegCategorization.mockResolvedValue({ status: 'requires_review' });

    const outcome = await categorizeBelegById(db, 'tenant-1', 'beleg-1', {
      actor: { type: 'system', id: null },
      deps: { categorize: async () => result({ engine: 'fallback', confidence: 0 }) },
    });

    expect(outcome).toMatchObject({ ok: true, status: 'requires_review' });
    if (outcome.ok) expect(outcome.categorization.requires_review).toBe(true);
  });

  it('unbekannter Beleg → ok:false / not_found (kein Update)', async () => {
    getBelegById.mockResolvedValue(null);

    const outcome = await categorizeBelegById(db, 'tenant-1', 'beleg-1', {
      actor: { type: 'system', id: null },
      deps: { categorize: async () => result() },
    });

    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    expect(updateBelegCategorization).not.toHaveBeenCalled();
  });

  it('falscher Status → ok:false / invalid_status (kein Update)', async () => {
    getBelegById.mockResolvedValue({ status: 'received', payload: {} });

    const outcome = await categorizeBelegById(db, 'tenant-1', 'beleg-1', {
      actor: { type: 'system', id: null },
      deps: { categorize: async () => result() },
    });

    expect(outcome).toEqual({ ok: false, reason: 'invalid_status', status: 'received' });
    expect(updateBelegCategorization).not.toHaveBeenCalled();
  });

  it('system-Actor → Audit actorType=system, actorId=system-Sentinel', async () => {
    getBelegById.mockResolvedValue({ status: 'extracted', payload: {} });
    updateBelegCategorization.mockResolvedValue({ status: 'categorized' });

    await categorizeBelegById(db, 'tenant-1', 'beleg-1', {
      actor: { type: 'system', id: null },
      deps: { categorize: async () => result() },
    });

    expect(updateBelegCategorization.mock.calls[0][3].audit).toEqual({
      actorType: 'system',
      actorId: 'system',
    });
  });

  it('staff-Actor → Audit actorType=staff, actorId=userId', async () => {
    getBelegById.mockResolvedValue({ status: 'extracted', payload: {} });
    updateBelegCategorization.mockResolvedValue({ status: 'categorized' });

    await categorizeBelegById(db, 'tenant-1', 'beleg-1', {
      actor: { type: 'staff', id: 'user-42' },
      deps: { categorize: async () => result() },
    });

    expect(updateBelegCategorization.mock.calls[0][3].audit).toEqual({
      actorType: 'staff',
      actorId: 'user-42',
    });
  });

  it('T053-Bewirtungs-Schutz: unsichere KI verwirft die Detektor-Bewirtung NICHT', async () => {
    // OCR-Detektor hat bereits category='bewirtung' gesetzt; KI ist unsicher und
    // schlägt etwas anderes vor → der Schutz behält 'bewirtung' (sonst gingen
    // anlass/teilnehmer + die M05-Memo/70%-Logik verloren).
    getBelegById.mockResolvedValue({ status: 'extracted', category: 'bewirtung', payload: {} });
    updateBelegCategorization.mockResolvedValue({ status: 'requires_review' });

    const outcome = await categorizeBelegById(db, 'tenant-1', 'beleg-1', {
      actor: { type: 'system', id: null },
      deps: {
        categorize: async () =>
          result({ categoryId: 'sonstige_aufwand', confidence: 0.4, engine: 'claude' }),
      },
    });

    expect(outcome).toMatchObject({ ok: true, status: 'requires_review' });
    if (outcome.ok) {
      expect(outcome.categorization.category).toBe('bewirtung');
      expect(outcome.categorization.bewirtung_preserved).toBe(true);
    }
    // Persistierte Felder: bewirtung + dessen SKR03-Konto (nicht das KI-Konto).
    const args = updateBelegCategorization.mock.calls[0][3];
    expect(args.category).toBe('bewirtung');
    expect(args.categorization.skr_account).toBe('4650');
  });
});

describe('confirmBelegReviewById (T078)', () => {
  const STAFF = { type: 'staff', id: 'user-9' } as const;

  function reviewBeleg(over: Record<string, unknown> = {}) {
    return {
      status: 'requires_review',
      category: 'wareneinkauf_food',
      payload: { categorization: { category: 'wareneinkauf_food' } },
      ...over,
    };
  }

  it('happy-path requires_review -> categorized (Repo mit staff-Actor aufgerufen)', async () => {
    getBelegById.mockResolvedValue(reviewBeleg());
    confirmBelegReview.mockResolvedValue({ id: 'b1', status: 'categorized' });

    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });

    expect(outcome).toEqual({ ok: true, status: 'categorized' });
    expect(confirmBelegReview).toHaveBeenCalledWith(db, 'tenant-1', 'b1', {
      actorType: 'staff',
      actorId: 'user-9',
    });
  });

  it('invalid_status fuer nicht-requires_review (z. B. categorized = Idempotenz/2. Aufruf)', async () => {
    getBelegById.mockResolvedValue(reviewBeleg({ status: 'categorized' }));
    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });
    expect(outcome).toEqual({ ok: false, reason: 'invalid_status', status: 'categorized' });
    expect(confirmBelegReview).not.toHaveBeenCalled();
  });

  it('not_found fuer unbekannten Beleg', async () => {
    getBelegById.mockResolvedValue(null);
    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });
    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    expect(confirmBelegReview).not.toHaveBeenCalled();
  });

  it('category_required wenn category null', async () => {
    getBelegById.mockResolvedValue(reviewBeleg({ category: null }));
    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });
    expect(outcome).toEqual({ ok: false, reason: 'category_required' });
  });

  it('not_categorized wenn payload.categorization fehlt', async () => {
    getBelegById.mockResolvedValue(reviewBeleg({ payload: {} }));
    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });
    expect(outcome).toEqual({ ok: false, reason: 'not_categorized' });
  });

  it('Bewirtung: happy wenn anlass+teilnehmer gesetzt', async () => {
    getBelegById.mockResolvedValue(
      reviewBeleg({
        category: 'bewirtung',
        payload: {
          categorization: { category: 'bewirtung' },
          extraction: {
            fields: { bewirtung_anlass: 'Geschaeftsessen', bewirtung_teilnehmer: 'Kunde X' },
          },
        },
      }),
    );
    confirmBelegReview.mockResolvedValue({ id: 'b1', status: 'categorized' });
    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });
    expect(outcome).toEqual({ ok: true, status: 'categorized' });
  });

  it('Bewirtung: bewirtung_fields_required wenn anlass ODER teilnehmer leer', async () => {
    getBelegById.mockResolvedValue(
      reviewBeleg({
        category: 'bewirtung_kunden',
        payload: {
          categorization: { category: 'bewirtung' },
          extraction: { fields: { bewirtung_anlass: 'Essen', bewirtung_teilnehmer: '   ' } },
        },
      }),
    );
    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });
    expect(outcome).toEqual({ ok: false, reason: 'bewirtung_fields_required' });
    expect(confirmBelegReview).not.toHaveBeenCalled();
  });

  it('Race: confirmBelegReview liefert null -> not_found', async () => {
    getBelegById.mockResolvedValue(reviewBeleg());
    confirmBelegReview.mockResolvedValue(null);
    const outcome = await confirmBelegReviewById(db, 'tenant-1', 'b1', { actor: STAFF });
    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
  });
});
