/**
 * M02 — Pfad- und Filename-Templates (M02 §9).
 *
 * Mustache-Stil (kein Logik-Code). Variablen aus M02 §9.1, Sanitizing
 * nach §9.3:
 *   - `/`, `\`, `..` werden entfernt
 *   - Nicht-ASCII-Transliteration: ä→ae, ö→oe, ü→ue, Ä→Ae, Ö→Oe, Ü→Ue, ß→ss
 *   - max. 200 Zeichen
 *   - Leere/fehlende Variable → 'unbekannt'
 *
 * `renderPathTemplate` für Verzeichnisstruktur (Pfad-Sanitizer pro Segment),
 * `renderFilename` für die Datei selbst (gesamter String wird sanitized).
 */

import type { Receipt } from '../../modules/_shared/receipts/receipt.repository';

// ── Public API ───────────────────────────────────────────────────────────────

const MAX_FILENAME_LEN = 200;
const PLACEHOLDER = 'unbekannt';

export function renderPathTemplate(template: string, receipt: Receipt): string {
  const vars = buildVariables(receipt);
  const replaced = applyTemplate(template, vars);
  // Pfad: Slashes als Separator behalten, jedes Segment einzeln säubern.
  // Trailing-Slash bleibt erhalten (Spec-Beispiel: '2026/April/Wareneinkauf/').
  const hasTrailingSlash = replaced.endsWith('/');
  const hasLeadingSlash = replaced.startsWith('/');
  const cleaned = replaced
    .split('/')
    .map((seg) => sanitizePathSegment(seg))
    .filter((seg) => seg.length > 0)
    .join('/');
  return `${hasLeadingSlash ? '/' : ''}${cleaned}${hasTrailingSlash && cleaned.length > 0 ? '/' : ''}`;
}

export function renderFilename(template: string, receipt: Receipt): string {
  const vars = buildVariables(receipt);
  const replaced = applyTemplate(template, vars);
  return sanitizeFilename(replaced);
}

// ── Sanitizers (M02 §9.3) ────────────────────────────────────────────────────

const TRANSLIT_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
};

export function transliterate(s: string): string {
  return (
    s
      .replace(/[äöüÄÖÜß]/g, (c) => TRANSLIT_MAP[c] ?? c)
      // Restliche Diakritika abbauen (NFD + Combining-Marks entfernen).
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
  );
}

/** Säubert einen einzelnen Pfad-Segment-Namen: kein '/', '\', '..'. */
export function sanitizePathSegment(seg: string): string {
  const cleaned = transliterate(seg)
    .replace(/[\\/]+/g, '')
    .replace(/\.\.+/g, '')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, MAX_FILENAME_LEN);
}

/**
 * Säubert einen Filename: kein Pfadtrennzeichen, max. 200 Zeichen, Endung erhalten.
 * `/`, `\`, `..` werden entfernt. Spaces, Hyphens, Underscores bleiben erhalten.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = transliterate(name)
    .replace(/[\\/]+/g, '')
    .replace(/\.\.+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, MAX_FILENAME_LEN);
}

// ── Variablen (M02 §9.1) ─────────────────────────────────────────────────────

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

interface ReceiptFieldSnapshot {
  supplier_name?: unknown;
  document_number?: unknown;
  document_date?: unknown;
  total_gross?: unknown;
  currency?: unknown;
}

function buildVariables(receipt: Receipt): Record<string, string> {
  const fields =
    (receipt.extraction as { fields?: ReceiptFieldSnapshot } | undefined)?.fields ?? {};
  const cat = receipt.categorization ?? {};
  const customerName =
    (receipt as { customer_display_name?: string }).customer_display_name ?? receipt.customer_id;

  const isoDate = typeof fields.document_date === 'string' ? fields.document_date : '';
  const parsed = parseIsoDate(isoDate);

  const supplierName = stringify(fields.supplier_name);
  const totalGross =
    typeof fields.total_gross === 'number'
      ? fields.total_gross.toFixed(2)
      : stringify(fields.total_gross);

  return {
    year: parsed.year ?? '',
    month: parsed.month ?? '',
    month_de: parsed.monthDe ?? '',
    document_date: isoDate,
    supplier_name: cleanSupplierLoose(supplierName),
    supplier_safe: strictSupplier(supplierName),
    document_number: stringify(fields.document_number),
    total_gross: totalGross,
    category_label: stringify((cat as { category_label?: unknown }).category_label),
    category_id: stringify((cat as { category?: unknown }).category),
    customer_name: stringify(customerName),
    receipt_id: stringify(receipt.receipt_id),
  };
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const v = vars[key];
    return v && v.length > 0 ? v : PLACEHOLDER;
  });
}

function parseIsoDate(iso: string): { year?: string; month?: string; monthDe?: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return {};
  const [, y, mm] = m;
  const monthIdx = Number.parseInt(mm, 10) - 1;
  return {
    year: y,
    month: mm,
    monthDe: MONTHS_DE[monthIdx] ?? '',
  };
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function cleanSupplierLoose(s: string): string {
  // Sonderzeichen → '_', Mehrfach-'_' → ein '_', Trim '_'
  return transliterate(s)
    .replace(/[^A-Za-z0-9 _-]+/g, '_')
    .replace(/[\s_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function strictSupplier(s: string): string {
  return transliterate(s).replace(/[^A-Za-z0-9_]/g, '');
}
