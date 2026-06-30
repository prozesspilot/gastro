/**
 * T089/M08 — Unit-Tests für den USt-Split (pure, ohne DB).
 */
import { describe, expect, it } from 'vitest';
import { type BelegForUstSplit, computeUstSplit, deriveBelegRatePercent } from './ust-split';

/** Beleg-Helper: setzt total_gross + extraction.fields-Payload. */
function beleg(
  gross: number | string | null,
  fields: Record<string, unknown> = {},
): BelegForUstSplit {
  return { total_gross: gross, payload: { extraction: { fields } } };
}

function rate(split: ReturnType<typeof computeUstSplit>, r: number) {
  const b = split.by_rate.find((x) => x.rate === r);
  if (!b) throw new Error(`Bucket ${r} fehlt`);
  return b;
}

describe('deriveBelegRatePercent', () => {
  it('bevorzugt expliziten tax_rate', () => {
    expect(deriveBelegRatePercent({ extraction: { fields: { tax_rate: 7 } } })).toBe(7);
  });

  it('nimmt den dominanten Satz aus tax_lines (höchster USt-Betrag)', () => {
    const payload = {
      extraction: {
        fields: {
          tax_lines: [
            { rate: 0.07, base: 100, amount: 7 },
            { rate: 0.19, base: 100, amount: 19 },
          ],
        },
      },
    };
    expect(deriveBelegRatePercent(payload)).toBe(19);
  });

  it('liefert null ohne jede Satz-Info (kein Raten, GoBD)', () => {
    expect(deriveBelegRatePercent({})).toBeNull();
    expect(deriveBelegRatePercent({ extraction: { fields: {} } })).toBeNull();
    expect(deriveBelegRatePercent({ extraction: { fields: { tax_lines: [] } } })).toBeNull();
  });
});

describe('computeUstSplit', () => {
  it('bucketiert 19/7/0 und rechnet Netto/USt korrekt', () => {
    const split = computeUstSplit([
      beleg(119, { tax_rate: 19 }), // net 100, tax 19
      beleg(107, { tax_rate: 7 }), // net 100, tax 7
      beleg(50, { tax_rate: 0 }), // net 50, tax 0
    ]);

    expect(rate(split, 19).count).toBe(1);
    expect(rate(split, 19).net).toBeCloseTo(100, 2);
    expect(rate(split, 19).tax).toBeCloseTo(19, 2);
    expect(rate(split, 19).gross).toBeCloseTo(119, 2);

    expect(rate(split, 7).net).toBeCloseTo(100, 2);
    expect(rate(split, 7).tax).toBeCloseTo(7, 2);

    expect(rate(split, 0).net).toBeCloseTo(50, 2);
    expect(rate(split, 0).tax).toBe(0);

    expect(split.unassignable.count).toBe(0);
  });

  it('sammelt Belege ohne Satz-Info in „nicht zuordenbar" (statt zu raten)', () => {
    const split = computeUstSplit([beleg(100), beleg(200, { tax_lines: [] })]);
    expect(split.unassignable.count).toBe(2);
    expect(split.unassignable.gross).toBeCloseTo(300, 2);
    expect(rate(split, 19).count).toBe(0);
  });

  it('behandelt einen exotischen Satz (z. B. 16 %) als nicht zuordenbar', () => {
    const split = computeUstSplit([beleg(116, { tax_rate: 16 })]);
    expect(split.unassignable.count).toBe(1);
    expect(split.unassignable.gross).toBeCloseTo(116, 2);
  });

  it('reconciled: Σ(by_rate.gross) + unassignable.gross == Brutto-Summe', () => {
    const belege = [
      beleg(119, { tax_rate: 19 }),
      beleg(107, { tax_rate: 7 }),
      beleg(50), // unassignable
    ];
    const split = computeUstSplit(belege);
    const sum = split.by_rate.reduce((acc, b) => acc + b.gross, 0) + split.unassignable.gross;
    expect(sum).toBeCloseTo(119 + 107 + 50, 2);
  });

  it('coerced NUMERIC-Strings (pg-Driver) zu Zahlen', () => {
    const split = computeUstSplit([beleg('119.00', { tax_rate: 19 })]);
    expect(rate(split, 19).gross).toBeCloseTo(119, 2);
  });

  it('liefert alle drei Standard-Sätze auch bei leerer Eingabe', () => {
    const split = computeUstSplit([]);
    expect(split.by_rate.map((b) => b.rate)).toEqual([19, 7, 0]);
    expect(split.by_rate.every((b) => b.count === 0)).toBe(true);
    expect(split.unassignable.count).toBe(0);
  });
});
