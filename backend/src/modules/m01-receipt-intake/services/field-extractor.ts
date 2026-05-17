/**
 * M01 — Field-Extractor (M01 §9.1)
 *
 * Wandelt OCR-Rohtext in strukturierte Belegfelder.
 *
 * Reihenfolge (verbindlich):
 *   1) Regex-Extraktion (deterministisch, schnell)
 *      – Datum (DE/ISO/intl), USt-ID (DE), Beträge, MwSt-Sätze
 *   2) Lieferant
 *      a) customer_profile.custom.supplier_overrides (Exact + Levenshtein ≤2)
 *      b) suppliers_global (vat_id ODER aliases @> ARRAY[...])
 *      c) Claude-Fallback (claude-extractor.ts)
 *   3) Claude-Fallback NUR wenn:
 *        regex_confidence < 0.6  ODER  supplier_name leer
 *
 * confidence: Anteil gesetzter Pflichtfelder (supplier_name, document_date,
 *             total_gross) aus den Regex-Treffern. Wird vom Confidence-Scorer
 *             mit der OCR-Confidence kombiniert.
 */

import type { Pool } from 'pg';
import type { OcrResult } from '../../../core/adapters/ocr/factory';
import { logger } from '../../../core/logger';
import { extractWithClaude } from './claude-extractor';

// ── Public Types ──────────────────────────────────────────────────────────────

export interface TaxLine {
  rate: number; // 0.19, 0.07, 0.00
  base: number; // Netto-Betrag der Steuerzeile
  amount: number; // Steuer-Betrag
}

export interface LineItem {
  description: string;
  qty?: number;
  unit_price?: number;
  total?: number;
  tax_rate?: number;
}

export interface ExtractedFields {
  supplier_name?: string;
  supplier_address?: string;
  supplier_vat_id?: string;
  document_number?: string;
  document_date?: string; // ISO YYYY-MM-DD
  document_type?: 'invoice' | 'receipt' | 'credit_note' | 'other';
  currency?: string; // EUR
  total_gross?: number;
  total_net?: number;
  tax_lines?: TaxLine[];
  line_items?: LineItem[];
  payment_method?: string;
}

export interface FieldExtractionResult {
  fields: ExtractedFields;
  /** Anteil sicher gesetzter Pflichtfelder (0..1). */
  confidence: number;
  /** Welche Pfade die Felder geliefert haben — fürs Audit. */
  sources: {
    regex: boolean;
    profile: boolean;
    global: boolean;
    claude: boolean;
  };
}

export interface FieldExtractorDeps {
  /** Optional injectable Claude-Aufruf — Tests setzen einen Mock. */
  claudeExtract?: typeof extractWithClaude;
}

// ── Customer-Profile-Slice ────────────────────────────────────────────────────

interface SupplierOverride {
  category?: string;
  skr?: string;
  cost_center?: string;
  vat_id?: string;
}

interface CustomerProfileSlice {
  customer_id?: string;
  routing?: {
    default_currency?: string;
  };
  custom?: {
    supplier_overrides?: Record<string, SupplierOverride>;
  };
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

export async function extract(
  db: Pool,
  ocr: OcrResult,
  profile: CustomerProfileSlice,
  deps: FieldExtractorDeps = {},
): Promise<FieldExtractionResult> {
  const sources = { regex: false, profile: false, global: false, claude: false };

  // 1) Regex-Pass
  const regex = extractByRegex(ocr.raw_text, profile);
  const fields: ExtractedFields = { ...regex.fields };
  if (regex.gotAnything) sources.regex = true;

  // 2a) Lieferant aus customer_profile.custom.supplier_overrides
  if (!fields.supplier_name) {
    const fromProfile = matchProfileSupplier(ocr.raw_text, profile);
    if (fromProfile) {
      fields.supplier_name = fromProfile.name;
      if (!fields.supplier_vat_id && fromProfile.vat_id) {
        fields.supplier_vat_id = fromProfile.vat_id;
      }
      sources.profile = true;
    }
  }

  // 2b) Lieferant aus suppliers_global (vat_id ODER aliases)
  if (!fields.supplier_name && (fields.supplier_vat_id || regex.candidateAliases.length > 0)) {
    const fromGlobal = await matchGlobalSupplier(
      db,
      fields.supplier_vat_id,
      regex.candidateAliases,
    );
    if (fromGlobal) {
      fields.supplier_name = fromGlobal.display_name;
      if (!fields.supplier_vat_id && fromGlobal.vat_id) {
        fields.supplier_vat_id = fromGlobal.vat_id;
      }
      sources.global = true;
    }
  }

  // 3) Claude-Fallback NUR wenn Regex-Confidence < 0.6 ODER supplier fehlt
  const regexConfidence = computeConfidence(fields);
  const supplierMissing = !fields.supplier_name;
  const shouldUseClaude = regexConfidence < 0.6 || supplierMissing;

  if (shouldUseClaude) {
    const claudeFn = deps.claudeExtract ?? extractWithClaude;
    try {
      const claude = await claudeFn(ocr.raw_text);
      if (claude && claude.claude_confidence > 0) {
        // Nur Felder ergänzen, die Regex nicht geliefert hat —
        // Regex-Hits sind verbindlicher (deterministisch, prüfbar).
        for (const [k, v] of Object.entries(claude.fields)) {
          const key = k as keyof ExtractedFields;
          if (fields[key] === undefined && v !== undefined && v !== null) {
              (fields as Record<keyof ExtractedFields, unknown>)[key] = v;
          }
        }
        sources.claude = true;
      }
    } catch (err) {
      logger.warn({ err }, 'Claude-Fallback fehlgeschlagen — fahre mit Regex-Result fort');
    }
  }

  return {
    fields,
    confidence: computeConfidence(fields),
    sources,
  };
}

// ── Regex-Extraktion ──────────────────────────────────────────────────────────

interface RegexResult {
  fields: ExtractedFields;
  gotAnything: boolean;
  candidateAliases: string[]; // Top-3 Zeilen-Tokens für suppliers_global-Lookup
}

function extractByRegex(rawText: string, profile: CustomerProfileSlice): RegexResult {
  const fields: ExtractedFields = {};
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Datum — DE-Format, ISO, Intl
  const dateDe = rawText.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
  const dateIso = rawText.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const dateIntl = rawText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (dateIso) {
    fields.document_date = `${dateIso[1]}-${dateIso[2]}-${dateIso[3]}`;
  } else if (dateDe) {
    fields.document_date = toIsoDate(dateDe[1], dateDe[2], dateDe[3]);
  } else if (dateIntl) {
    fields.document_date = toIsoDate(dateIntl[1], dateIntl[2], dateIntl[3]);
  }

  // USt-ID (DE)
  const vat = rawText.match(/\bDE\d{9}\b/);
  if (vat) fields.supplier_vat_id = vat[0];

  // MwSt-Sätze (19, 7, 0 %)
  const taxRates = new Set<number>();
  for (const m of rawText.matchAll(/\b(0|7|19)[ ,.]?(\d?)\s*%/g)) {
    const intPart = Number.parseInt(m[1], 10);
    const frac = m[2] ? Number.parseInt(m[2], 10) : 0;
    const rate = intPart === 0 && frac === 0 ? 0 : (intPart + frac / 10) / 100;
    taxRates.add(round2(rate));
  }

  // Beträge: "Total / Summe / Brutto / Gesamt" als linker Anker.
  const amountRe =
    /(?:total|summe|brutto|gesamt|netto|zwischensumme)\s*[:\-]?\s*(?:€\s*)?(\d{1,3}(?:[.,  ]\d{3})*[.,]\d{2})\s*(?:€|eur)?/gi;
  let m: RegExpExecArray | null;
  while ((m = amountRe.exec(rawText)) !== null) {
    const label = m[0].toLowerCase();
    const value = parseAmount(m[1]);
    if (value === null) continue;
    if (/brutto|gesamt|total|summe/.test(label) && !/zwischen/.test(label)) {
      // Größter Brutto-Match gewinnt (pragmatisch — Belegtotal steht meist unten)
      if (fields.total_gross === undefined || value > fields.total_gross) {
        fields.total_gross = value;
      }
    } else if (/netto|zwischensumme/.test(label)) {
      if (fields.total_net === undefined || value > fields.total_net) {
        fields.total_net = value;
      }
    }
  }

  // Belegnummer
  const docNum = rawText.match(
    /\b(?:RE|RG|RECHNUNG|INVOICE|NR|BELEG)[\s\-]*([A-Z0-9][A-Z0-9\-\/]{2,})/i,
  );
  if (docNum) fields.document_number = docNum[1].toUpperCase();

  // Currency: erstmal Default aus Profil bzw. EUR, falls € im Text
  if (/€|\bEUR\b/i.test(rawText)) fields.currency = 'EUR';
  else fields.currency = profile.routing?.default_currency ?? 'EUR';

  // Tax-Lines aus erkannten Sätzen + Brutto/Netto rekonstruieren (best-effort).
  if (fields.total_gross !== undefined && fields.total_net !== undefined && taxRates.size > 0) {
    const rates = Array.from(taxRates)
      .filter((r) => r > 0)
      .sort((a, b) => b - a);
    if (rates.length === 1) {
      const rate = rates[0];
      const taxAmt = round2(fields.total_gross - fields.total_net);
      fields.tax_lines = [
        {
          rate,
          base: fields.total_net,
          amount: taxAmt,
        },
      ];
    } else if (rates.length >= 2) {
      // Bei mehreren Sätzen können wir ohne Zeilendaten nicht zuverlässig
      // splitten — Claude-Fallback übernimmt.
    }
  }

  // Lieferantenname-Kandidat: erste nicht-leere Zeile (oben auf dem Beleg)
  // → keine Setzung in fields.supplier_name; nur als Alias-Kandidat fürs Lookup.
  const candidateAliases = lines
    .slice(0, 5)
    .map((l) => l.replace(/[^\p{L}\p{N}\s.\-&]/gu, '').trim())
    .filter((l) => l.length >= 3);

  const gotAnything =
    Object.values(fields).some((v) => v !== undefined && v !== null && v !== '') ||
    taxRates.size > 0;

  return { fields, gotAnything, candidateAliases };
}

// ── Lieferant via customer_profile.custom.supplier_overrides ──────────────────

interface SupplierMatch {
  name: string;
  vat_id?: string;
}

function matchProfileSupplier(
  rawText: string,
  profile: CustomerProfileSlice,
): SupplierMatch | null {
  const overrides = profile.custom?.supplier_overrides;
  if (!overrides) return null;
  const lower = rawText.toLowerCase();

  // 1) Exact-Match (case-insensitive Substring)
  for (const name of Object.keys(overrides)) {
    if (lower.includes(name.toLowerCase())) {
      return { name, vat_id: overrides[name].vat_id };
    }
  }

  // 2) Fuzzy: Levenshtein ≤ 2 zwischen Name und einer der ersten 5 Zeilen
  const lines = rawText
    .split('\n')
    .slice(0, 5)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const name of Object.keys(overrides)) {
    for (const line of lines) {
      if (Math.abs(line.length - name.length) > 4) continue;
      if (levenshtein(line.toLowerCase(), name.toLowerCase()) <= 2) {
        return { name, vat_id: overrides[name].vat_id };
      }
    }
  }
  return null;
}

// ── Lieferant via suppliers_global ────────────────────────────────────────────

interface GlobalSupplierRow {
  supplier_id: string;
  vat_id: string | null;
  display_name: string;
  aliases: string[];
}

async function matchGlobalSupplier(
  db: Pool,
  vatId: string | undefined,
  aliasCandidates: string[],
): Promise<GlobalSupplierRow | null> {
  if (!vatId && aliasCandidates.length === 0) return null;

  const { rows } = await db.query<GlobalSupplierRow>(
    `SELECT supplier_id, vat_id, display_name, aliases
       FROM suppliers_global
      WHERE ($1::text IS NOT NULL AND vat_id = $1)
         OR ($2::text[] IS NOT NULL AND aliases && $2)
      LIMIT 1`,
    [vatId ?? null, aliasCandidates.length > 0 ? aliasCandidates : null],
  );
  return rows[0] ?? null;
}

// ── Helfer ────────────────────────────────────────────────────────────────────

function toIsoDate(d: string, m: string, y: string): string | undefined {
  const day = d.padStart(2, '0');
  const month = m.padStart(2, '0');
  let year = y;
  if (year.length === 2) {
    const yy = Number.parseInt(year, 10);
    year = (yy >= 70 ? 1900 + yy : 2000 + yy).toString();
  }
  // Plausibilitäts-Sanity (Validator macht den belegspezifischen Check)
  const dn = Number.parseInt(day, 10);
  const mn = Number.parseInt(month, 10);
  if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return undefined;
  return `${year}-${month}-${day}`;
}

function parseAmount(raw: string): number | null {
  // Entferne Tausendertrenner (Punkt, Komma, NBSP, Narrow-NBSP).
  // DE-Format: "1.234,56", Intl: "1,234.56", Italienisch: "1.234,56".
  const cleaned = raw.replace(/[  \s]/g, '');
  // Wenn beide Trenner vorkommen, ist der letzte das Dezimaltrennzeichen.
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(',', '.');
  } else {
    normalized = cleaned;
  }
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? round2(num) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Iterativer Levenshtein-Abstand (klein gehalten, kein Lib-Import). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Anteil sicher gesetzter Pflichtfelder. */
function computeConfidence(fields: ExtractedFields): number {
  const required: Array<keyof ExtractedFields> = ['supplier_name', 'document_date', 'total_gross'];
  const present = required.filter(
    (k) => fields[k] !== undefined && fields[k] !== null && fields[k] !== '',
  ).length;
  return present / required.length;
}
