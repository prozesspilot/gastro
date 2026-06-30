/**
 * M07 — Belege-CSV-Builder (pure, kein I/O).
 *
 * Erzeugt aus den Belegen eines Monats eine maschinenlesbare CSV für den
 * Steuerberater (Fallback für Mandanten OHNE Lexware-Direktanbindung M05;
 * komplementär zum M08-PDF-Report). Spaltenschema portiert aus
 * `Modulkonzept/.../modules/M07_Excel_Sheets_Export.md` §8 auf die belege-Welt.
 *
 * Format-Entscheidungen (deutscher Steuerberater-Kontext, öffnet sauber in
 * Excel-DE):
 *   - Trennzeichen `;` (DE-Excel-Default; `,` würde mit dem Dezimalkomma kollidieren).
 *   - Beträge mit Dezimal-Komma (`1234,56`).
 *   - Datum `YYYY-MM-DD` (eindeutig, sortierbar).
 *   - Zeilenende CRLF + UTF-8-BOM (Excel erkennt Umlaute korrekt).
 *   - RFC-4180-Quoting: Felder mit `;`, `"`, CR/LF werden in `"…"` gewrappt, `"`→`""`.
 *
 * Der Cloud-Sync (Google Sheets / OneDrive aus der Alt-Spec §9) ist OAuth-gated
 * und bewusst NICHT Teil dieses Moduls — hier nur der credential-freie Download.
 */

/** Eine Beleg-Zeile, bereits aus `belege` + `payload` aufgelöst (siehe Repository). */
export interface BelegExportRow {
  id: string;
  document_date: string | null; // ISO-Date (oder null, wenn nicht erkannt)
  supplier_name: string | null;
  document_number: string | null;
  category: string | null; // Kategorie-ID
  category_label: string | null; // aufgelöstes Label (oder null)
  skr_account: string | null;
  total_gross: number | null;
  total_net: number | null;
  tax_amount: number | null;
  tax_rate: number | null; // Prozent (z. B. 19)
  currency: string;
  status: string;
  received_at: string | null; // ISO-Datetime
}

const BOM = '﻿';
const SEP = ';';
const EOL = '\r\n';

interface Column {
  header: string;
  value: (r: BelegExportRow) => string;
}

/** `1234.5` → `"1234,50"`; null/NaN → `""`. */
function amount(n: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toFixed(2).replace('.', ',');
}

/** ISO-Date/Datetime → `YYYY-MM-DD`; null → `""`. */
function isoDate(v: string | null): string {
  if (!v) return '';
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
}

const COLUMNS: Column[] = [
  { header: 'Datum', value: (r) => isoDate(r.document_date) },
  { header: 'Lieferant', value: (r) => r.supplier_name ?? '' },
  { header: 'Belegnummer', value: (r) => r.document_number ?? '' },
  { header: 'Kategorie', value: (r) => r.category_label ?? r.category ?? '' },
  { header: 'SKR-Konto', value: (r) => r.skr_account ?? '' },
  { header: 'Brutto', value: (r) => amount(r.total_gross) },
  { header: 'Netto', value: (r) => amount(r.total_net) },
  { header: 'MwSt-Betrag', value: (r) => amount(r.tax_amount) },
  {
    header: 'MwSt-Satz',
    value: (r) => (r.tax_rate === null || !Number.isFinite(r.tax_rate) ? '' : `${r.tax_rate}%`),
  },
  { header: 'Waehrung', value: (r) => r.currency ?? '' },
  { header: 'Status', value: (r) => r.status ?? '' },
  { header: 'Beleg-ID', value: (r) => r.id },
  { header: 'Eingang am', value: (r) => isoDate(r.received_at) },
];

/** RFC-4180-Quoting: nur quoten, wenn nötig (Trennzeichen/Quote/Zeilenumbruch). */
function csvField(value: string): string {
  if (value.includes(SEP) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Baut die vollständige CSV (mit BOM + Header). Leere Liste → nur BOM + Header. */
export function buildBelegeCsv(rows: BelegExportRow[]): string {
  const lines: string[] = [];
  lines.push(COLUMNS.map((c) => csvField(c.header)).join(SEP));
  for (const r of rows) {
    lines.push(COLUMNS.map((c) => csvField(c.value(r))).join(SEP));
  }
  return BOM + lines.join(EOL) + EOL;
}

/** Dateiname für den Download, z. B. `belege-2026-05.csv`. */
export function csvFileName(year: number, month: number): string {
  return `belege-${year}-${String(month).padStart(2, '0')}.csv`;
}
