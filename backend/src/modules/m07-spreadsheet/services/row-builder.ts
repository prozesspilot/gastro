/**
 * M07 — Row-Builder (M07 §8).
 *
 * Mappt ein Receipt auf die 16 Pflicht-Spalten + optionale Extra-Columns.
 *
 * Wichtig:
 *  - Kategorie-Fallback '–' (Em-Dash, Pflicht laut Spec)
 *  - MwSt-Betrag = Σ tax_lines.amount (nicht total_gross-total_net, weil
 *    diese Differenz bei mehreren Sätzen nicht sinnvoll segmentiert)
 *  - MwSt-Satz = dominanter Satz × 100 (höchster amount-Anteil)
 *  - Spalte M: =HYPERLINK("{url}","{filename}") — Sheets parst das via
 *    valueInputOption=USER_ENTERED zu einem Klick-Link
 *  - Eingang am: erstes audit_log mit type='received'
 */

import type { RowValue } from '../../../core/adapters/spreadsheet/factory';
import type { Receipt } from '../../_shared/receipts/receipt.repository';
import { readPath, toCellValue } from './jsonpath';

// Untertypen für deutlich bessere Lesbarkeit; absichtlich nur dort, wo
// wir Felder anfassen — Receipt selbst ist im _shared/repository definiert.
interface TaxLine {
  rate?: number;
  base?: number;
  amount?: number;
}

interface ExtractionFields {
  supplier_name?: string;
  document_number?: string;
  document_date?: string;
  total_gross?: number;
  total_net?: number;
  currency?: string;
  payment_method?: string;
  tax_lines?: TaxLine[];
}

interface CategorizationFields {
  category_label?: string;
  skr_account?: string;
  cost_center?: string;
}

interface ArchiveFields {
  path?: string;
  external_id?: string;
  external_url?: string;
}

interface AuditEvent {
  at: string;
  type: string;
  actor?: string;
}

export interface ExtraColumnDef {
  header: string;
  jsonpath: string;
}

export interface BuildRowOptions {
  /** profile.custom.spreadsheet_extra_columns (optional). */
  extraColumns?: ExtraColumnDef[];
}

/**
 * Standard-Build (16 Spalten, keine Extras). Behält die exakte Reihenfolge
 * aus M07 §8.
 */
export function buildRow(receipt: Receipt, options: BuildRowOptions = {}): RowValue[] {
  const fields = (receipt.extraction as { fields?: ExtractionFields } | undefined)?.fields ?? {};
  const cat = (receipt.categorization as CategorizationFields | undefined) ?? {};
  const archive = (receipt.archive as ArchiveFields | undefined) ?? {};
  const events: AuditEvent[] =
    (receipt.audit as { events?: AuditEvent[] } | undefined)?.events ?? [];

  // Spalte I — MwSt-Betrag = Summe aller tax_lines.amount
  const taxLines = fields.tax_lines ?? [];
  const taxSum = taxLines.reduce(
    (acc, line) => acc + (typeof line.amount === 'number' ? line.amount : 0),
    0,
  );

  // Spalte J — dominanter MwSt-Satz × 100. Bei mehreren Lines: derjenige
  // mit höchstem amount; bei Gleichstand: erster Eintrag.
  let dominantRate = 0;
  let dominantAmount = -1;
  for (const line of taxLines) {
    const amt = typeof line.amount === 'number' ? line.amount : 0;
    if (amt > dominantAmount && typeof line.rate === 'number') {
      dominantAmount = amt;
      dominantRate = line.rate;
    }
  }
  const taxRatePct = round2(dominantRate * 100);

  // Spalte M — Hyperlink-Formel. Wir bevorzugen die direkte external_url
  // (z. B. Google-Drive-Webview), fallen aber auf 'path' zurück.
  const fileUrl = archive.external_url ?? archive.path ?? '';
  const fileName = fileUrl ? deriveFilename(archive.path ?? fileUrl) : '';
  const hyperlinkCell = fileUrl ? buildHyperlinkFormula(fileUrl, fileName) : '';

  // Spalte P — erster 'received'-Audit-Event
  const receivedAt = events.find((e) => e.type === 'received')?.at ?? '';

  const row: RowValue[] = [
    /* A */ fields.document_date ?? '',
    /* B */ fields.supplier_name ?? '',
    /* C */ fields.document_number ?? '',
    /* D */ cat.category_label && cat.category_label !== '' ? cat.category_label : '–',
    /* E */ cat.skr_account ?? '',
    /* F */ cat.cost_center ?? '',
    /* G */ typeof fields.total_gross === 'number' ? fields.total_gross : '',
    /* H */ typeof fields.total_net === 'number' ? fields.total_net : '',
    /* I */ taxLines.length ? round2(taxSum) : '',
    /* J */ taxLines.length ? taxRatePct : '',
    /* K */ fields.currency ?? '',
    /* L */ fields.payment_method ?? '',
    /* M */ hyperlinkCell,
    /* N */ receipt.status,
    /* O */ receipt.receipt_id,
    /* P */ receivedAt,
  ];

  // Extra-Columns rechts anhängen (siehe M07 §8 / spreadsheet_extra_columns).
  if (options.extraColumns?.length) {
    for (const extra of options.extraColumns) {
      const raw = readPath(receipt as unknown as Record<string, unknown>, extra.jsonpath);
      row.push(toCellValue(raw));
    }
  }

  return row;
}

/**
 * Wenn der Customer Extra-Columns aktiv hat, müssen die zugehörigen Header
 * an die 16 Standard-Header rechts angehängt werden. Returns: Liste der
 * Header-Strings (nicht ColumnDef[], um die Symmetrie zu COLUMNS bewusst
 * sichtbar zu halten).
 */
export function buildHeaders(extraColumns: ExtraColumnDef[] = []): string[] {
  // COLUMNS hier bewusst nicht importieren, um Zykel zu vermeiden — der
  // Handler reicht die finale Liste durch ensureHeader().
  // Stattdessen exportieren wir nur die Extra-Headers; columns.ts liefert die
  // 16 fixen Header.
  return extraColumns.map((c) => c.header);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Baut =HYPERLINK("url";"label") für Sheets. Doppelte Anführungszeichen
 * im Label/URL werden verdoppelt (Sheets-Konvention).
 */
export function buildHyperlinkFormula(url: string, label: string): string {
  const safeUrl = url.replace(/"/g, '""');
  const safeLabel = (label || url).replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}

function deriveFilename(path: string): string {
  if (!path) return '';
  const last = path.split('/').filter(Boolean).pop() ?? path;
  return last;
}
