/**
 * T009/M05 — Tests fuer Voucher-Builder (belege-Schema).
 *
 * Pure-Function-Tests: input → output.
 */

import { describe, expect, it } from 'vitest';
import { buildBelegVoucher } from '../services/belege-voucher-builder';

const FAKE_CATEGORY_ID = '00000000-0000-4000-8000-000000004980';

function makeBeleg(overrides: Partial<Parameters<typeof buildBelegVoucher>[0]['beleg']> = {}) {
  return {
    id: 'b-001',
    supplier_name: 'Test GmbH',
    document_date: '2026-05-19',
    total_gross: 119,
    currency: 'EUR',
    category: null,
    payload: {},
    ...overrides,
  };
}

describe('buildBelegVoucher — minimal', () => {
  it('baut Voucher mit Defaults wenn payload leer', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg(),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.type).toBe('purchaseinvoice');
    expect(v.voucherNumber).toBe('b-001');
    expect(v.voucherDate).toBe('2026-05-19');
    expect(v.totalGrossAmount).toBe(119);
    // 19% Default → 19 EUR Tax bei 119 Brutto
    expect(v.totalTaxAmount).toBeCloseTo(19);
    expect(v.useCollectiveContact).toBe(true);
    expect(v.voucherItems).toHaveLength(1);
    expect(v.voucherItems[0].categoryId).toBe(FAKE_CATEGORY_ID);
  });

  it('coerced total_gross als pg-NUMERIC-String zu number (Review-Fix)', () => {
    // pg liefert NUMERIC(12,2) als String — buildBelegVoucher muss das robust
    // zu number coercen, sonst landet ein String im Voucher-Betrag.
    const v = buildBelegVoucher({
      beleg: makeBeleg({ total_gross: '119.00' }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.totalGrossAmount).toBe(119);
    expect(typeof v.totalGrossAmount).toBe('number');
    expect(v.totalTaxAmount).toBeCloseTo(19);
  });

  it('fällt bei ungültigem total_gross-String auf payload/0 zurück', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({ total_gross: 'abc', payload: { extraction: { fields: { total_gross: 50 } } } }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.totalGrossAmount).toBe(50);
  });

  it('nutzt document_number aus payload wenn vorhanden', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({
        payload: { extraction: { fields: { document_number: 'RE-2026-1042' } } },
      }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.voucherNumber).toBe('RE-2026-1042');
  });

  it('nutzt explizite tax_rate aus payload statt Default', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({
        total_gross: 107,
        payload: { extraction: { fields: { tax_rate: 7 } } },
      }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.voucherItems[0].taxRatePercent).toBe(7);
    expect(v.totalTaxAmount).toBeCloseTo(7);
  });

  it('berechnet TaxAmount aus dominanter tax_lines wenn tax_rate nicht gesetzt', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({
        total_gross: 1190,
        payload: {
          extraction: {
            fields: {
              tax_lines: [
                { rate: 0.07, base: 100, amount: 7 },
                { rate: 0.19, base: 1000, amount: 190 },
              ],
            },
          },
        },
      }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.voucherItems[0].taxRatePercent).toBe(19); // dominant
  });
});

describe('buildBelegVoucher — Bewirtung', () => {
  it('Memo enthaelt Bewirtungs-Anlass + Teilnehmer wenn gesetzt', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({
        category: 'bewirtung',
        payload: {
          extraction: {
            fields: {
              bewirtung_anlass: 'Geschaeftsessen Almaz',
              bewirtung_teilnehmer: 'Max Mueller, Anna Schmidt',
            },
          },
        },
      }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.memo).toContain('Anlass: Geschaeftsessen Almaz');
    expect(v.memo).toContain('Teilnehmer: Max Mueller');
    expect(v.memo).toContain('Kategorie: bewirtung');
  });

  it('Memo enthaelt Beleg-ID immer als Praefix', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg(),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.memo).toMatch(/^ProzessPilot b-001/);
  });
});

describe('buildBelegVoucher — Kontakt', () => {
  it('useCollectiveContact=true wenn kein contactId', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg(),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.useCollectiveContact).toBe(true);
    expect(v.contactId).toBeUndefined();
  });

  it('useCollectiveContact=false wenn contactId gesetzt', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg(),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
      contactId: '11111111-1111-4111-8111-111111111111',
    });
    expect(v.useCollectiveContact).toBe(false);
    expect(v.contactId).toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('buildBelegVoucher — Edge-Cases', () => {
  it('total_gross=null → 0', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({ total_gross: null }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.totalGrossAmount).toBe(0);
  });

  it('document_date=null → heute', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({ document_date: null }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.voucherDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Date-Objekt als document_date wird zu ISO-String', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg({ document_date: new Date('2026-05-15T10:00:00Z') }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.voucherDate).toBe('2026-05-15');
  });
});

describe('buildBelegVoucher — Memo-Length-Limit (Review-Fix #7)', () => {
  it('truncated auf 250 Zeichen wenn Teilnehmer-Liste sehr lang', () => {
    const longTeilnehmer = Array.from({ length: 30 }, (_, i) => `Person${i} Lastname${i}`).join(
      ', ',
    );
    const v = buildBelegVoucher({
      beleg: makeBeleg({
        category: 'bewirtung',
        payload: {
          extraction: {
            fields: {
              bewirtung_anlass: 'Geschaeftsessen mit sehr langer Beschreibung der Anlass-Details',
              bewirtung_teilnehmer: longTeilnehmer,
            },
          },
        },
      }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.memo).toBeDefined();
    expect((v.memo ?? '').length).toBeLessThanOrEqual(250);
    expect(v.memo).toMatch(/…$/); // Ellipsis am Ende signalisiert Truncate
  });

  it('Memo unter Limit wird NICHT truncated (kein Ellipsis)', () => {
    const v = buildBelegVoucher({
      beleg: makeBeleg(),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect(v.memo).toBeDefined();
    expect((v.memo ?? '').length).toBeLessThan(250);
    expect((v.memo ?? '').endsWith('…')).toBe(false);
  });

  it('Beleg-ID-Praefix bleibt auch bei Truncate erhalten', () => {
    const longTeilnehmer = 'x'.repeat(500);
    const v = buildBelegVoucher({
      beleg: makeBeleg({
        category: 'bewirtung',
        payload: {
          extraction: {
            fields: {
              bewirtung_anlass: 'Anlass',
              bewirtung_teilnehmer: longTeilnehmer,
            },
          },
        },
      }),
      lexofficeCategoryId: FAKE_CATEGORY_ID,
    });
    expect((v.memo ?? '').startsWith('ProzessPilot b-001')).toBe(true);
  });
});
