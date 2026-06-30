/**
 * T089/M08 — Unit-Tests für den Steuerberater-Mail-Body-Generator (pure).
 */
import { describe, expect, it } from 'vitest';
import type { MonthlyAggregates } from './aggregator';
import { buildHandoverMail } from './handover-mail.builder';

function totals(overrides: Partial<MonthlyAggregates> = {}): MonthlyAggregates {
  return {
    period: { year: 2026, month: 5 },
    totals: { receipts_count: 47, gross_sum: 4234.17, largest_single: 1234.56 },
    by_category: [],
    top_suppliers: [],
    ust_split: {
      by_rate: [
        { rate: 19, gross: 1190.0, net: 1000.0, tax: 190.0, count: 20 },
        { rate: 7, gross: 107.0, net: 100.0, tax: 7.0, count: 5 },
        { rate: 0, gross: 0, net: 0, tax: 0, count: 0 },
      ],
      unassignable: { gross: 0, count: 0 },
    },
    comparison_prev_month: { gross_sum: 3780.0, delta_percent: 12.0 },
    receipts_without_date: 0,
    ...overrides,
  };
}

describe('buildHandoverMail', () => {
  it('Betreff enthält Periode + Mandant', () => {
    const mail = buildHandoverMail({ tenantName: 'Müller-Bistro', totals: totals() });
    expect(mail.subject).toBe(
      'ProzessPilot — Buchhaltungs-Übergabe Mai 2026, Mandant Müller-Bistro',
    );
  });

  it('Body nennt Belegzahl, Brutto-Summe und USt-Sätze (nur mit count > 0)', () => {
    const mail = buildHandoverMail({ tenantName: 'Müller-Bistro', totals: totals() });
    expect(mail.text).toContain('Anzahl verarbeitete Belege: 47');
    expect(mail.text).toContain('4.234,17 €');
    expect(mail.text).toContain('19 %');
    expect(mail.text).toContain('7 %');
    // 0%-Satz hat count 0 → nicht gelistet
    expect(mail.text).not.toContain('0 %:');
  });

  it('weist „nicht zuordenbar" aus, wenn vorhanden', () => {
    const mail = buildHandoverMail({
      tenantName: 'Test',
      totals: totals({
        ust_split: {
          by_rate: [
            { rate: 19, gross: 0, net: 0, tax: 0, count: 0 },
            { rate: 7, gross: 0, net: 0, tax: 0, count: 0 },
            { rate: 0, gross: 0, net: 0, tax: 0, count: 0 },
          ],
          unassignable: { gross: 88.5, count: 3 },
        },
      }),
    });
    expect(mail.text).toContain('nicht zuordenbar: 3 Beleg(e)');
    expect(mail.text).toContain('88,50 €');
  });

  it('escaped HTML-Sonderzeichen im Mandantennamen', () => {
    const mail = buildHandoverMail({ tenantName: 'A & <B> "C"', totals: totals() });
    expect(mail.html).toContain('A &amp; &lt;B&gt; &quot;C&quot;');
    // Im Plaintext bleibt der Name unverändert.
    expect(mail.text).toContain('A & <B> "C"');
  });

  it('liefert einen Plaintext-Fallback (Pflicht) und HTML', () => {
    const mail = buildHandoverMail({ tenantName: 'X', totals: totals() });
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.html).toContain('<p>');
  });

  it('crasht NICHT bei einem Alt-Snapshot ohne ust_split (vor T089 gebaut)', () => {
    // Reports aus T087/PR #206 (bereits auf main) haben kein ust_split im
    // gespeicherten totals-JSONB. deliverReport übergibt genau dieses totals.
    const legacy = totals();
    // Simuliert den persistierten Alt-Snapshot: Feld fehlt zur Laufzeit.
    (legacy as { ust_split?: unknown }).ust_split = undefined;

    const mail = buildHandoverMail({ tenantName: 'Alt-GmbH', totals: legacy });
    expect(mail.subject).toContain('Alt-GmbH');
    // Leerer Split → keine Satz-Zeilen → Fallback-Hinweis.
    expect(mail.text).toContain('keine verbuchten Belege in diesem Zeitraum');
    expect(mail.html).toContain('keine verbuchten Belege in diesem Zeitraum');
  });
});
