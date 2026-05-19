/**
 * T007/M01 — Light Field-Extractor für die belege-Tabelle.
 *
 * Eigene Implementation (statt des großen field-extractor.ts der gegen das alte
 * customer_profiles-Modell läuft), weil:
 *   1. T007 fordert nur drei Pflichtfelder — Betrag, Datum, Lieferant.
 *   2. Die belege-Pipeline hat (noch) keinen customer_profile-Lookup.
 *   3. Wir wollen Confidence pro Feld in payload.extraction.fields_confidence,
 *      nicht nur einen globalen Score.
 *
 * Heuristiken (alle deterministisch — Claude-Fallback kommt in einem späteren
 * Task, T0?? - „M01 Claude-Fallback"):
 *
 *   * Datum:    DD.MM.YYYY oder DD.MM.YY (deutsch). Wenn mehrere Treffer →
 *               wir nehmen den ersten plausiblen (≤ heute + 1 Tag, ≥ heute − 5 Jahre).
 *   * Betrag:   Anker-Wörter „Summe / Gesamt / Gesamtbetrag / Total / Brutto"
 *               links/rechts/in nächster Zeile eines €-Betrags. Fallback: größter
 *               Betrag im Text.
 *   * Lieferant: erste nicht-leere Zeile aus den ersten 3 Lines, normalisiert.
 *
 * Confidence-Score pro Feld:
 *   1.0   wenn Anker-Match (z. B. „Summe" + €-Betrag)
 *   0.7   wenn Regex-Match ohne Anker
 *   0.4   wenn Heuristik (z. B. größter Betrag, erste Zeile)
 *   0.0   wenn nicht gefunden
 *
 * Gesamt-Konfidenz: Durchschnitt der drei Feld-Konfidenzen, kombiniert per
 * Multiplikation mit OCR-Confidence in `ocr.service.ts`.
 */

export interface OcrLightFields {
  supplier_name?: string;
  document_date?: string; // ISO YYYY-MM-DD
  total_gross?: number;
  currency?: string;
}

export interface OcrFieldConfidence {
  supplier_name: number;
  document_date: number;
  total_gross: number;
}

export interface OcrLightExtractionResult {
  fields: OcrLightFields;
  confidence_per_field: OcrFieldConfidence;
  /** Durchschnitt aus confidence_per_field. */
  overall_confidence: number;
}

// ── Datum ─────────────────────────────────────────────────────────────────────

const DATE_DE_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g;
const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function isPlausibleDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;
  const oneDayAhead = now + 24 * 60 * 60 * 1000;
  const t = d.getTime();
  return t >= fiveYearsAgo && t <= oneDayAhead;
}

function normalizeDate(yyyy: string, mm: string, dd: string): string | null {
  let year = yyyy;
  if (year.length === 2) {
    // 24 → 2024 (Annahme 21. Jh.)
    year = `20${year.padStart(2, '0')}`;
  }
  const m = mm.padStart(2, '0');
  const d = dd.padStart(2, '0');
  if (Number(m) < 1 || Number(m) > 12) return null;
  if (Number(d) < 1 || Number(d) > 31) return null;
  return `${year}-${m}-${d}`;
}

function extractDate(text: string): { value?: string; confidence: number } {
  // ISO zuerst — eindeutig
  for (const match of text.matchAll(DATE_ISO_RE)) {
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    if (isPlausibleDate(iso)) {
      return { value: iso, confidence: 1.0 };
    }
  }
  // Dann DE
  for (const match of text.matchAll(DATE_DE_RE)) {
    const iso = normalizeDate(match[3], match[2], match[1]);
    if (iso && isPlausibleDate(iso)) {
      return { value: iso, confidence: 0.7 };
    }
  }
  return { confidence: 0 };
}

// ── Betrag ────────────────────────────────────────────────────────────────────

/** "1.234,56" oder "1234,56" oder "1234.56" → 1234.56 */
function parseAmount(s: string): number | null {
  // Entferne Whitespace, EUR-Zeichen
  const cleaned = s.replace(/\s|€|EUR/gi, '');
  // DE-Format mit Tausender-Punkt + Komma als Dezimaltrenner
  // → '1.234,56' → '1234.56'
  // EN-Format '1234.56' bleibt
  let normalized = cleaned;
  if (/,/.test(cleaned) && /\./.test(cleaned)) {
    // beides vorhanden → letztes Vorkommen ist Dezimaltrenner
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // DE: Punkte entfernen, Komma → Punkt
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // EN: Kommata entfernen
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (/,/.test(cleaned)) {
    // Nur Komma → DE Dezimaltrenner
    normalized = cleaned.replace(',', '.');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Amount-Regex:
 *   Variante 1: `\d{1,3}(?:[.,]\d{3})+[.,]\d{2}`  → mit Tausender-Separator (1.234,56)
 *   Variante 2: `\d+[.,]\d{2}`                    → ohne Tausender (1234.56 / 50,00)
 *
 * Negative Look-Behind/Ahead: nicht innerhalb eines Datums oder einer längeren
 * Ziffernfolge matchen ("28.04.2026" darf KEIN Amount sein, "1234.56" schon).
 */
const AMOUNT_RE = /(?<![\d.])(\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?![.\d])/g;
const ANCHOR_WORDS = [
  'gesamtbetrag',
  'gesamt',
  'summe',
  'total',
  'brutto',
  'rechnungsbetrag',
  'zu zahlen',
  'endbetrag',
  'betrag',
];

function extractAmount(text: string): { value?: number; confidence: number } {
  const lower = text.toLowerCase();
  // Anker-Suche: ein Anker-Wort + Betrag innerhalb der nächsten 60 Zeichen
  // bzw. derselben Zeile.
  for (const anchor of ANCHOR_WORDS) {
    let idx = lower.indexOf(anchor);
    while (idx !== -1) {
      const window = text.slice(idx, idx + anchor.length + 60);
      const matches = [...window.matchAll(AMOUNT_RE)];
      if (matches.length > 0) {
        const parsed = parseAmount(matches[0][1]);
        if (parsed !== null && parsed > 0) {
          return { value: parsed, confidence: 1.0 };
        }
      }
      idx = lower.indexOf(anchor, idx + 1);
    }
  }

  // Fallback: größter erkannter Betrag im Dokument (Heuristik: Brutto ist meist
  // der größte Wert auf einem Beleg).
  const all = [...text.matchAll(AMOUNT_RE)]
    .map((m) => parseAmount(m[1]))
    .filter((n): n is number => n !== null && n > 0);
  if (all.length === 0) return { confidence: 0 };
  const max = Math.max(...all);
  // Heuristische Confidence: niedriger weil ohne Anker
  return { value: max, confidence: 0.4 };
}

// ── Lieferant ─────────────────────────────────────────────────────────────────

function sanitizeSupplier(s: string): string {
  return s.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function extractSupplier(text: string): { value?: string; confidence: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { confidence: 0 };

  // Heuristik: erste Zeile, die mindestens 3 Buchstaben enthält und nicht
  // ausschließlich aus Zahlen/Sonderzeichen besteht.
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    if (!/[a-zA-ZäöüÄÖÜß]{3,}/.test(line)) continue;
    // Filter: typische "nicht-supplier"-Zeilen
    if (/^(rechnung|invoice|beleg|quittung|kassenbon)$/i.test(line)) continue;
    return { value: sanitizeSupplier(line), confidence: i === 0 ? 0.7 : 0.4 };
  }

  return { confidence: 0 };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function extractLightFields(rawText: string): OcrLightExtractionResult {
  if (!rawText || rawText.trim().length === 0) {
    return {
      fields: {},
      confidence_per_field: { supplier_name: 0, document_date: 0, total_gross: 0 },
      overall_confidence: 0,
    };
  }

  const supplier = extractSupplier(rawText);
  const date = extractDate(rawText);
  const amount = extractAmount(rawText);

  const fields: OcrLightFields = {};
  if (supplier.value) fields.supplier_name = supplier.value;
  if (date.value) fields.document_date = date.value;
  if (amount.value !== undefined) {
    fields.total_gross = amount.value;
    fields.currency = 'EUR';
  }

  const confidence_per_field: OcrFieldConfidence = {
    supplier_name: supplier.confidence,
    document_date: date.confidence,
    total_gross: amount.confidence,
  };

  const overall_confidence =
    (confidence_per_field.supplier_name +
      confidence_per_field.document_date +
      confidence_per_field.total_gross) /
    3;

  return { fields, confidence_per_field, overall_confidence };
}
