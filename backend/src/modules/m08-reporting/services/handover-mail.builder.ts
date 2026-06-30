/**
 * T089/M08 — Generator für die Steuerberater-Übergabe-Mail (pure, testbar).
 *
 * Erzeugt Betreff + Text/HTML aus den Monats-Aggregaten (T087). Inhalt nach
 * Spec §17.1, auf die belege-Welt reduziert: ÜBERSICHT (Belege, Brutto, USt-Split)
 * + Hinweis auf den PDF-Anhang. Bewusst NICHT enthalten (spätere Tasks): DATEV-CSV,
 * Original-Belege-ZIP, Z-Bon-PDFs.
 *
 * Keine DB, kein I/O — der Service rendert hieraus die Mail und hängt das PDF an.
 */

import type { MonthlyAggregates } from './aggregator';
import { formatEur, periodLabel } from './report-pdf';

export interface HandoverMailInput {
  tenantName: string;
  totals: MonthlyAggregates;
}

export interface HandoverMail {
  subject: string;
  text: string;
  html: string;
}

/** Eine USt-Zeile als Text, z. B. „19 %: 12 Belege · Netto 100,00 € · USt 19,00 €". */
function ustLine(rate: number, count: number, net: number, tax: number): string {
  return `  - ${rate} %: ${count} Beleg(e) · Netto ${formatEur(net)} · USt ${formatEur(tax)}`;
}

/**
 * Baut die Steuerberater-Übergabe-Mail. Anrede generisch (kein Steuerberater-Name
 * im Datenmodell hinterlegt — bewusst, kein Raten).
 */
export function buildHandoverMail(input: HandoverMailInput): HandoverMail {
  const { tenantName, totals } = input;
  const period = periodLabel(totals.period.year, totals.period.month);

  const subject = `ProzessPilot — Buchhaltungs-Übergabe ${period}, Mandant ${tenantName}`;

  const ustLines = totals.ust_split.by_rate
    .filter((b) => b.count > 0)
    .map((b) => ustLine(b.rate, b.count, b.net, b.tax));
  if (totals.ust_split.unassignable.count > 0) {
    ustLines.push(
      `  - nicht zuordenbar: ${totals.ust_split.unassignable.count} Beleg(e) · Brutto ${formatEur(
        totals.ust_split.unassignable.gross,
      )}`,
    );
  }
  if (ustLines.length === 0) ustLines.push('  - keine verbuchten Belege in diesem Zeitraum');

  const text = [
    'Sehr geehrte Damen und Herren,',
    '',
    `anbei die aufbereiteten Buchhaltungs-Daten für Ihren Mandanten ${tenantName} für den Monat ${period}.`,
    '',
    'ÜBERSICHT',
    `  - Anzahl verarbeitete Belege: ${totals.totals.receipts_count}`,
    `  - Gesamt-Brutto-Volumen: ${formatEur(totals.totals.gross_sum)}`,
    '',
    'USt-AUFTEILUNG',
    ...ustLines,
    '',
    'ANHANG',
    `  1. Übersichtsbericht ${period} (PDF)`,
    '',
    'Bei Rückfragen einfach auf diese Mail antworten.',
    '',
    'Beste Grüße',
    'ProzessPilot',
    '',
    '--',
    'ProzessPilot · Steve Bernhardt · Schneverdingen',
    'support@prozesspilot.net',
  ].join('\n');

  const ustHtml = totals.ust_split.by_rate
    .filter((b) => b.count > 0)
    .map(
      (b) =>
        `<li>${b.rate} %: ${b.count} Beleg(e) · Netto ${formatEur(b.net)} · USt ${formatEur(
          b.tax,
        )}</li>`,
    );
  if (totals.ust_split.unassignable.count > 0) {
    ustHtml.push(
      `<li>nicht zuordenbar: ${totals.ust_split.unassignable.count} Beleg(e) · Brutto ${formatEur(
        totals.ust_split.unassignable.gross,
      )}</li>`,
    );
  }

  const html = [
    '<p>Sehr geehrte Damen und Herren,</p>',
    `<p>anbei die aufbereiteten Buchhaltungs-Daten für Ihren Mandanten <strong>${escapeHtml(
      tenantName,
    )}</strong> für den Monat ${period}.</p>`,
    '<h3>Übersicht</h3>',
    '<ul>',
    `<li>Anzahl verarbeitete Belege: ${totals.totals.receipts_count}</li>`,
    `<li>Gesamt-Brutto-Volumen: ${formatEur(totals.totals.gross_sum)}</li>`,
    '</ul>',
    '<h3>USt-Aufteilung</h3>',
    `<ul>${ustHtml.length > 0 ? ustHtml.join('') : '<li>keine verbuchten Belege in diesem Zeitraum</li>'}</ul>`,
    `<h3>Anhang</h3><ul><li>Übersichtsbericht ${period} (PDF)</li></ul>`,
    '<p>Bei Rückfragen einfach auf diese Mail antworten.</p>',
    '<p>Beste Grüße<br/>ProzessPilot</p>',
    '<hr/><p style="color:#666;font-size:12px">ProzessPilot · Steve Bernhardt · Schneverdingen<br/>support@prozesspilot.net</p>',
  ].join('\n');

  return { subject, text, html };
}

/** Minimal-Escape für die wenigen interpolierten Werte im HTML (Tenant-Name). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
