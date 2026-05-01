/**
 * M01 — Validator-Tests
 *
 * Deckt alle 6 Checks aus M01 §10 mit je einem Positiv- und einem
 * Negativ-Case ab.
 */

import { describe, expect, it, vi } from 'vitest';
import { validate } from '../services/validator';

function makeDb(duplicateCount = 0): import('pg').Pool {
  return {
    query: vi.fn(async (sql: string) => {
      if (/COUNT\(\*\)/i.test(sql)) {
        return { rows: [{ count: String(duplicateCount) }] };
      }
      return { rows: [] };
    }),
  } as unknown as import('pg').Pool;
}

const baseCtx = {
  customerId: 'cust_test',
  receiptId:  'rcp_test',
  profile:    { routing: { supported_currencies: ['EUR'] } },
};

describe('validator — totals_match', () => {
  it('valid: gross = net + Σ tax (Toleranz 0.02)', async () => {
    // 100 + 19 + 20.04 + 1.40 = 140.44
    const res = await validate(makeDb(), {
      total_gross: 140.44,
      total_net:   120.04,
      tax_lines:   [
        { rate: 0.19, base: 100.00, amount: 19.00 },
        { rate: 0.07, base:  20.04, amount:  1.40 },
      ],
      supplier_name: 'X', document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.totals_match).toBe(true);
    expect(res.is_valid).toBe(true);
  });

  it('invalid: Δ = 0.05 > Toleranz', async () => {
    const res = await validate(makeDb(), {
      total_gross: 140.49, // statt 140.44, Δ=0.05
      total_net:   120.04,
      tax_lines:   [
        { rate: 0.19, base: 100.00, amount: 19.00 },
        { rate: 0.07, base:  20.04, amount:  1.40 },
      ],
      supplier_name: 'X', document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.totals_match).toBe(false);
    expect(res.is_valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'TOTALS_MISMATCH')).toBe(true);
  });
});

describe('validator — tax_lines_consistent', () => {
  it('valid: amount = base × rate (Toleranz 0.02)', async () => {
    const res = await validate(makeDb(), {
      total_gross: 119, total_net: 100,
      tax_lines: [{ rate: 0.19, base: 100, amount: 19 }],
      supplier_name: 'X', document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.tax_lines_consistent).toBe(true);
  });

  it('invalid: 100 × 0.19 ≠ 19.50', async () => {
    const res = await validate(makeDb(), {
      total_gross: 119.50, total_net: 100,
      tax_lines: [{ rate: 0.19, base: 100, amount: 19.50 }],
      supplier_name: 'X', document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.tax_lines_consistent).toBe(false);
  });
});

describe('validator — supplier_known', () => {
  it('valid: supplier_name vorhanden', async () => {
    const res = await validate(makeDb(), {
      supplier_name: 'Metro AG', total_gross: 100, document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.supplier_known).toBe(true);
  });

  it('valid: nur supplier_vat_id vorhanden', async () => {
    const res = await validate(makeDb(), {
      supplier_vat_id: 'DE123456789', total_gross: 100, document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.supplier_known).toBe(true);
  });

  it('invalid: weder name noch vat_id', async () => {
    const res = await validate(makeDb(), {
      total_gross: 100, document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.supplier_known).toBe(false);
    expect(res.is_valid).toBe(false);
  });
});

describe('validator — document_date_plausible', () => {
  it('valid: heutiges Datum', async () => {
    const res = await validate(makeDb(), {
      supplier_name: 'X', total_gross: 100, document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.document_date_plausible).toBe(true);
  });

  it('invalid: vor 6 Jahren', async () => {
    const past = new Date();
    past.setFullYear(past.getFullYear() - 6);
    const res = await validate(makeDb(), {
      supplier_name: 'X', total_gross: 100, document_date: past.toISOString().slice(0, 10), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.document_date_plausible).toBe(false);
  });
});

describe('validator — duplicate', () => {
  it('valid: kein Duplikat in DB', async () => {
    const res = await validate(makeDb(0), {
      supplier_name: 'X', supplier_vat_id: 'DE123456789', document_number: 'RE-1',
      total_gross: 100, document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.duplicate).toBe(false);
    expect(res.is_valid).toBe(true);
  });

  it('invalid: gleiche USt-ID + Belegnummer existiert bereits', async () => {
    const res = await validate(makeDb(1), {
      supplier_name: 'X', supplier_vat_id: 'DE123456789', document_number: 'RE-1',
      total_gross: 100, document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.duplicate).toBe(true);
    expect(res.is_valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'DUPLICATE_RECEIPT')).toBe(true);
  });
});

describe('validator — currency_supported', () => {
  it('valid: EUR in supported_currencies (Default)', async () => {
    const res = await validate(makeDb(), {
      supplier_name: 'X', total_gross: 100, document_date: today(), currency: 'EUR',
    }, baseCtx);
    expect(res.checks.currency_supported).toBe(true);
  });

  it('invalid: USD nicht in supported_currencies', async () => {
    const res = await validate(makeDb(), {
      supplier_name: 'X', total_gross: 100, document_date: today(), currency: 'USD',
    }, baseCtx);
    expect(res.checks.currency_supported).toBe(false);
  });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
