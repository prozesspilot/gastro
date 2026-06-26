/**
 * T077 — Tests für den geteilten categorize.service.
 * Repository gemockt (keine DB), Categorizer injiziert. Fokus: Outcome-Shape +
 * Actor-Mapping (system/staff) — die Verhaltens-Logik selbst ist zusätzlich über
 * belege-categorize.handler.test.ts (T048) abgedeckt.
 */
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BelegCategorizationResult } from '../services/belege-categorizer';

const { getBelegById, updateBelegCategorization } = vi.hoisted(() => ({
  getBelegById: vi.fn(),
  updateBelegCategorization: vi.fn(),
}));

vi.mock('../../m01-receipt-intake/services/beleg.repository', () => ({
  getBelegById,
  updateBelegCategorization,
}));

import { categorizeBelegById } from '../services/categorize.service';

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
});
