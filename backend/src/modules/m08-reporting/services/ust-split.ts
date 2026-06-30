/**
 * T089/M08 — USt-Split (19 % / 7 % / 0 %) für die Steuerberater-Übergabe.
 *
 * Leitet pro Beleg aus den Extraction-Feldern (`payload.extraction.fields`) den
 * Umsatzsteuersatz ab und bucketiert Brutto/Netto/USt nach Satz. Konsistent zur
 * Buchungs-Logik in M05 (`belege-voucher-builder.ts` `computeTaxRatePercent`):
 *   1. expliziter `tax_rate` (vom Mitarbeiter korrigiert) hat Vorrang,
 *   2. sonst der **dominante** Satz aus `tax_lines` (höchster USt-Betrag).
 *
 * GoBD-Defensive (Task T089): anders als der Voucher-Builder raten wir hier
 * NICHT auf 19 % zurück, wenn gar keine Satz-Info vorliegt. Solche Belege landen
 * in `unassignable` ("nicht zuordenbar") — für den Steuerberater transparent,
 * statt eine falsche Steuer zu suggerieren.
 *
 * Reconciliation: Wir bucketieren je Beleg mit EINEM Satz auf das volle
 * `total_gross` (kein Per-Position-Split). Damit gilt:
 *   Σ(by_rate.gross) + unassignable.gross == gross_sum des Monats.
 * Ein Position-genauer Mehrsatz-Split (z. B. Beleg mit 19%- und 7%-Zeilen) ist
 * eine spätere Verfeinerung — er bräuchte verlässliche Positions-`tax_lines`.
 */

/** Standard-USt-Sätze in Prozent, feste Reihenfolge für Report/Tabelle. */
export const STANDARD_VAT_RATES = [19, 7, 0] as const;

interface TaxLine {
  rate: number;
  base: number;
  amount: number;
}

/** Minimaler Beleg-Input: Brutto + die für die Satz-Ableitung nötigen Felder. */
export interface BelegForUstSplit {
  total_gross: number | string | null;
  payload: Record<string, unknown>;
}

export interface UstRateBucket {
  /** Satz in Prozent (19, 7, 0). */
  rate: number;
  gross: number;
  net: number;
  tax: number;
  count: number;
}

export interface UstSplit {
  /** Immer 19/7/0 in dieser Reihenfolge (auch mit count 0 — Vollständigkeit). */
  by_rate: UstRateBucket[];
  /** Belege ohne eindeutigen Satz — bewusst nicht geraten. */
  unassignable: { gross: number; count: number };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function coerceNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Liest die Extraction-Felder eines Belegs defensiv aus dem JSONB-`payload`.
 * Unbekannte/fehlende Strukturen → leeres Objekt (kein Wurf).
 */
function extractionFields(payload: Record<string, unknown>): {
  tax_rate?: number;
  tax_lines?: TaxLine[];
} {
  const extraction = (payload as { extraction?: { fields?: unknown } }).extraction;
  const fields = extraction?.fields;
  if (!fields || typeof fields !== 'object') return {};
  const f = fields as { tax_rate?: unknown; tax_lines?: unknown };
  const out: { tax_rate?: number; tax_lines?: TaxLine[] } = {};
  if (typeof f.tax_rate === 'number' && Number.isFinite(f.tax_rate)) out.tax_rate = f.tax_rate;
  if (Array.isArray(f.tax_lines)) {
    out.tax_lines = f.tax_lines.filter(
      (l): l is TaxLine => !!l && typeof l === 'object' && typeof (l as TaxLine).rate === 'number',
    );
  }
  return out;
}

/**
 * Ermittelt den USt-Satz (in Prozent) eines Belegs oder `null`, wenn keine
 * eindeutige Satz-Info vorliegt (→ "nicht zuordenbar").
 */
export function deriveBelegRatePercent(payload: Record<string, unknown>): number | null {
  const fields = extractionFields(payload);
  if (typeof fields.tax_rate === 'number') return round2(fields.tax_rate);
  const lines = fields.tax_lines ?? [];
  if (lines.length === 0) return null; // keine Info → nicht raten (GoBD)
  // Dominanter Satz = höchster USt-Betrag (wie Voucher-Builder).
  const sorted = [...lines].sort((a, b) => b.amount - a.amount);
  return round2(sorted[0].rate * 100);
}

/**
 * Aggregiert eine Beleg-Liste in den USt-Split. Pure Funktion (keine DB/IO).
 */
export function computeUstSplit(belege: BelegForUstSplit[]): UstSplit {
  const buckets = new Map<number, { gross: number; net: number; tax: number; count: number }>();
  for (const rate of STANDARD_VAT_RATES) buckets.set(rate, { gross: 0, net: 0, tax: 0, count: 0 });
  const unassignable = { gross: 0, count: 0 };

  for (const beleg of belege) {
    const gross = coerceNum(beleg.total_gross);
    const rate = deriveBelegRatePercent(beleg.payload);

    // Nur die Standard-Sätze 19/7/0 sind eindeutig zuordenbar. Kein Satz (null)
    // ODER ein exotischer Satz (z. B. 16 % Übergangsregel) → "nicht zuordenbar".
    const bucket = rate === null ? undefined : buckets.get(rate);
    if (rate === null || !bucket) {
      unassignable.gross += gross;
      unassignable.count += 1;
      continue;
    }

    const net = rate === 0 ? gross : gross / (1 + rate / 100);
    bucket.gross += gross;
    bucket.net += net;
    bucket.tax += gross - net;
    bucket.count += 1;
  }

  return {
    by_rate: STANDARD_VAT_RATES.map((rate) => {
      const b = buckets.get(rate) ?? { gross: 0, net: 0, tax: 0, count: 0 };
      return {
        rate,
        gross: round2(b.gross),
        net: round2(b.net),
        tax: round2(b.tax),
        count: b.count,
      };
    }),
    unassignable: { gross: round2(unassignable.gross), count: unassignable.count },
  };
}
