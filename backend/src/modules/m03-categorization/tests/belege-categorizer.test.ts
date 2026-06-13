/**
 * T048/F2 — Tests für den Pilot-belege-Categorizer.
 * Mock-Anthropic-Client (kein echter API-Call).
 */

import { describe, expect, it } from 'vitest';
import { type AnthropicLikeClient, categorizeBeleg } from '../services/belege-categorizer';

function clientReturning(input: {
  category_id: string;
  confidence: number;
  rationale: string;
}): AnthropicLikeClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', name: 'categorize_beleg', input }],
      }),
    },
  };
}

const throwingClient: AnthropicLikeClient = {
  messages: {
    create: async () => {
      throw new Error('api down');
    },
  },
};

describe('belege-categorizer (T048/F2)', () => {
  it('ordnet via Claude eine Kategorie + SKR03-Konto zu (categorized-Pfad)', async () => {
    const client = clientReturning({
      category_id: 'wareneinkauf_food',
      confidence: 0.95,
      rationale: 'Lebensmittel-Großhändler',
    });
    const r = await categorizeBeleg({ supplierName: 'METRO', totalGross: 120 }, { client });
    expect(r.engine).toBe('claude');
    expect(r.categoryId).toBe('wareneinkauf_food');
    expect(r.categoryLabel).toBe('Wareneinkauf Lebensmittel');
    expect(r.skrAccount).toBe('3100');
    expect(r.skrChart).toBe('SKR03');
    expect(r.confidence).toBeCloseTo(0.95);
  });

  it('respektiert den SKR04-Kontenrahmen', async () => {
    const client = clientReturning({
      category_id: 'bewirtung',
      confidence: 0.9,
      rationale: 'Restaurant',
    });
    const r = await categorizeBeleg(
      { supplierName: 'Café Central' },
      { client, skrChart: 'SKR04' },
    );
    expect(r.categoryId).toBe('bewirtung');
    expect(r.skrAccount).toBe('6640');
  });

  it('fällt auf Fallback (confidence 0) zurück bei API-Fehler', async () => {
    const r = await categorizeBeleg({ supplierName: 'X' }, { client: throwingClient });
    expect(r.engine).toBe('fallback');
    expect(r.confidence).toBe(0);
    expect(r.categoryId).toBe('sonstige_aufwand');
  });

  it('fällt auf Fallback zurück bei ungültiger KI-Kategorie', async () => {
    const client = clientReturning({
      category_id: 'gibts_nicht',
      confidence: 0.99,
      rationale: 'x',
    });
    const r = await categorizeBeleg({ supplierName: 'X' }, { client });
    expect(r.engine).toBe('fallback');
    expect(r.confidence).toBe(0);
    expect(r.categoryId).toBe('sonstige_aufwand');
  });
});
