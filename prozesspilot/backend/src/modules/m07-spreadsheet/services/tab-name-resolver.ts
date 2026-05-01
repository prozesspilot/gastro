/**
 * M07 — Tab-Name-Resolver (M07 §2, §7).
 *
 * Default-Template:  "Belege {year}"  → "Belege 2026"
 * Kundentemplate:    profile.integrations.spreadsheet.config.tab_name_template
 *
 * Ableitung des Datums:
 *  1) extraction.fields.document_date (YYYY-MM-DD)
 *  2) audit.events[type=received].at — falls (1) fehlt
 *  3) now() — letzter Fallback (sollte praktisch nicht eintreten,
 *             weil der Status mind. 'archived' ist)
 *
 * Verfügbare Platzhalter:
 *   {year}, {month}, {month_de}, {quarter}
 */

import type { Receipt } from '../../_shared/receipts/receipt.repository';

export const DEFAULT_TAB_TEMPLATE = 'Belege {year}';

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export function renderTabName(template: string, receipt: Receipt): string {
  const date = pickReferenceDate(receipt);
  const year    = date.getUTCFullYear();
  const month   = date.getUTCMonth() + 1;
  const quarter = Math.floor((month - 1) / 3) + 1;

  return template
    .replace(/\{year\}/g, String(year))
    .replace(/\{month\}/g, String(month).padStart(2, '0'))
    .replace(/\{month_de\}/g, MONTHS_DE[month - 1])
    .replace(/\{quarter\}/g, `Q${quarter}`);
}

function pickReferenceDate(receipt: Receipt): Date {
  // 1) document_date (YYYY-MM-DD)
  const fields = (receipt.extraction as { fields?: { document_date?: string } } | undefined)
    ?.fields;
  if (fields?.document_date) {
    const d = new Date(`${fields.document_date}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // 2) audit.events[type=received].at
  const events = (receipt.audit as { events?: { type: string; at: string }[] } | undefined)
    ?.events;
  const received = events?.find((e) => e.type === 'received');
  if (received?.at) {
    const d = new Date(received.at);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // 3) created_at
  if (receipt.created_at) {
    const d = new Date(receipt.created_at);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return new Date();
}
