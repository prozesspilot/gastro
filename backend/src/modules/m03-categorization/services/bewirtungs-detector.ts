/**
 * T008/M03 — Bewirtungs-Detection-Hook.
 *
 * Heuristischer Detector der nach der OCR-Extraktion entscheidet, ob ein
 * Beleg eine BEWIRTUNGSRECHNUNG ist (Restaurant, Cafe, Bistro,
 * Geschaeftsessen). Bewirtungs-Belege brauchen steuerlich eine 70/30-
 * Aufteilung (SKR04 6644/6645) und Pflichtfelder Anlass + Teilnehmer.
 *
 * Spec M03 §17.1 — Detection-Logik:
 *   Beleg ist Bewirtungsbeleg wenn mindestens 2 von 4 Indikatoren zutreffen:
 *     1. Lieferant ist Restaurant/Cafe/Bar (Branchen-Keywords im Namen)
 *     2. OCR-Text enthaelt Bewirtungs-Keywords ("Tisch", "Gedeck", "Trinkgeld")
 *     3. Belegtyp aus M01 = Restaurant-Beleg (hier: leerer Stub, kommt aus
 *        Claude-Fallback in Phase 2)
 *     4. Mehrere Speisen-/Getraenke-Positionen
 *
 * Konfidenz:
 *   * Pro Indikator 0.25 — 4 Treffer = 1.0, 2 Treffer = 0.5, 1 = 0.25.
 *   * Threshold fuer is_bewirtung: >=0.5 (mind. 2 Indikatoren).
 *   * Bei 0.5..0.7 fordert der OCR-Service zusaetzlich `requires_review`,
 *     damit Mitarbeiter manuell bestaetigen.
 *
 * Pure Funktion: keine DB, kein I/O. Tests injizieren rawText + supplier
 * direkt. Integration in ocr.service.processBeleg() ist Task #18.
 */

// ── Keywords ─────────────────────────────────────────────────────────────

const SUPPLIER_KEYWORDS = [
  'restaurant',
  'restaurang',
  'café',
  'cafe',
  'kaffeehaus',
  'bistro',
  'gaststätte',
  'gaststaette',
  'wirtshaus',
  'wirtschaft',
  'pizzeria',
  'trattoria',
  'osteria',
  'steakhouse',
  'grill',
  'brauhaus',
  'kneipe',
  'bar',
  'lounge',
  'biergarten',
  'imbiss',
  'döner',
  'doener',
  'sushi',
  'taverna',
  'cantina',
];

/**
 * Kontext-Keywords im OCR-Volltext. Anders als Supplier-Keywords muss hier
 * mindestens EINES vorkommen, um Indikator 2 zu zaehlen.
 */
const CONTEXT_KEYWORDS = [
  'bewirtung',
  'geschäftsessen',
  'geschaeftsessen',
  'tisch',
  'gedeck',
  'trinkgeld',
  'bedienung',
  'kellner',
  'menü',
  'menue',
  'tageskarte',
  'speisekarte',
  'speisen',
  'getränke',
  'getraenke',
];

/**
 * Position-Keywords — wenn 2+ unterschiedliche Speisen/Getraenke-Eintraege
 * im Text vorkommen, zaehlt Indikator 4. (T008-Review-Fix #4: vorher
 * Kommentar inkonsistent "3+" vs. Code "≥ 2" — Code-Verhalten ist die
 * Quelle der Wahrheit.)
 */
const POSITION_KEYWORDS = [
  'pizza',
  'pasta',
  'salat',
  'suppe',
  'steak',
  'schnitzel',
  'burger',
  'pommes',
  'wasser',
  'bier',
  'wein',
  'cola',
  'kaffee',
  'tee',
  'espresso',
  'cappuccino',
  'apfelschorle',
  'limonade',
  'dessert',
  'eis',
];

const TRINKGELD_RE = /trinkgeld\s*:?\s*(\d{1,3}[.,]\d{2})\s*€?/i;

const TAX_LINE_19_RE = /(?:19\s*%|mwst\.?\s*19)/i;
const TAX_LINE_7_RE = /(?:7\s*%|mwst\.?\s*7)/i;

// ── Public Types ─────────────────────────────────────────────────────────

export interface BewirtungsIndicators {
  supplier_match: boolean;
  context_keywords: boolean;
  position_keywords: boolean;
  /**
   * Belegtyp aus dem Claude-Fallback (Phase 2). Aktuell immer false, weil
   * der Light-Field-Extractor (T007) noch keinen document_type liefert.
   * Wird nachgezogen sobald M03 Claude-Categorizer am belege-Pfad haengt.
   */
  document_type: boolean;
}

export interface BewirtungsTaxSplit {
  has_7_percent: boolean;
  has_19_percent: boolean;
  /** true wenn beide Saetze auf dem Beleg vorkommen → Splitting noetig. */
  splitting_required: boolean;
}

export interface BewirtungsResult {
  is_bewirtung: boolean;
  /** 0..1 — pro Indikator 0.25, threshold fuer is_bewirtung=0.5 */
  confidence: number;
  indicators: BewirtungsIndicators;
  /** Trinkgeld in Cent (Integer fuer Currency-Safety). null wenn nicht gefunden. */
  trinkgeld_cents: number | null;
  tax_split: BewirtungsTaxSplit;
  /** Liste der gefundenen Position-Keywords (fuer Audit/Debug). */
  matched_positions: string[];
}

export interface BewirtungsInput {
  rawText: string;
  supplierName: string | null;
}

// ── Detector ──────────────────────────────────────────────────────────────

export const BEWIRTUNG_CONFIDENCE_THRESHOLD = 0.5;
export const BEWIRTUNG_REVIEW_THRESHOLD = 0.7;

/**
 * Haupt-Analyse-Funktion. Pure: input → output, keine Seiteneffekte.
 */
export function analyze(input: BewirtungsInput): BewirtungsResult {
  const text = (input.rawText ?? '').toLowerCase();
  const supplier = (input.supplierName ?? '').toLowerCase();

  // Indikator 1: Lieferant-Branchen-Check (Supplier-Name ODER Top-Zeilen).
  //
  // T008-Review-Fix #2: Word-Boundary statt blossem `includes()`. Sonst
  // matcht z.B. `bar` in `Bargeld`, `Lebensbar`, `Cocktailbar`, `Wundbar`.
  //
  // T008-Review-Fix #5: `\b` ist in JS ASCII-basiert und bildet KEINE korrekte
  // Wortgrenze hinter Nicht-ASCII-Zeichen. Ein Keyword wie `café` matchte daher
  // einen echten Beleg "Café Mozart" nicht (`\bcafé\b` schlaegt fehl). Loesung:
  // Diakritika auf BEIDEN Seiten (Suchtext + Keyword) per NFD entfernen, dann
  // matcht `\bcafe\b` gegen "cafe mozart". Die ae-Varianten (gaststaette,
  // doener) bleiben fuer Belege erhalten, die bereits ASCII-transliteriert sind.
  const foldedSupplier = foldDiacritics(supplier);
  const foldedTopLines = foldDiacritics(topLinesText(text, 3));
  const supplierMatch = SUPPLIER_KEYWORDS.some((kw) => {
    const re = new RegExp(`\\b${escapeRegex(foldDiacritics(kw))}\\b`, 'i');
    return re.test(foldedSupplier) || re.test(foldedTopLines);
  });

  // Indikator 2: Kontext-Keywords im Volltext
  const contextMatch = CONTEXT_KEYWORDS.some((kw) => text.includes(kw));

  // Indikator 3: document_type (Stub — kommt mit Claude-Fallback)
  const documentTypeMatch = false;

  // Indikator 4: 2+ unterschiedliche Position-Keywords (≥ 2 Speisen/Getraenke)
  const matchedPositions = POSITION_KEYWORDS.filter((kw) => text.includes(kw));
  const positionMatch = matchedPositions.length >= 2;

  const indicators: BewirtungsIndicators = {
    supplier_match: supplierMatch,
    context_keywords: contextMatch,
    position_keywords: positionMatch,
    document_type: documentTypeMatch,
  };

  const hits =
    (indicators.supplier_match ? 1 : 0) +
    (indicators.context_keywords ? 1 : 0) +
    (indicators.position_keywords ? 1 : 0) +
    (indicators.document_type ? 1 : 0);
  const confidence = hits / 4;

  const is_bewirtung = confidence >= BEWIRTUNG_CONFIDENCE_THRESHOLD;

  // Trinkgeld extrahieren (auch wenn !is_bewirtung — manche Lieferanten
  // schreiben "Trinkgeld" zufaellig; aber wir markieren es nur wenn der
  // Beleg als Bewirtung erkannt wurde, sonst null).
  let trinkgeld_cents: number | null = null;
  if (is_bewirtung) {
    const m = TRINKGELD_RE.exec(input.rawText ?? '');
    if (m) {
      const value = Number.parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(value) && value > 0) {
        trinkgeld_cents = Math.round(value * 100);
      }
    }
  }

  const has7 = TAX_LINE_7_RE.test(text);
  const has19 = TAX_LINE_19_RE.test(text);
  const tax_split: BewirtungsTaxSplit = {
    has_7_percent: has7,
    has_19_percent: has19,
    splitting_required: has7 && has19,
  };

  return {
    is_bewirtung,
    confidence,
    indicators,
    trinkgeld_cents,
    tax_split,
    matched_positions: matchedPositions,
  };
}

/**
 * T008-Review-Fix #2: Liefert die ersten N Zeilen als String — Caller
 * matcht dann mit \b-Word-Boundary-Regex statt simplem includes().
 */
function topLinesText(text: string, n: number): string {
  return text.split(/\r?\n/).slice(0, n).join(' ');
}

/**
 * Escaped einen String fuer den Einsatz in einem RegExp-Pattern.
 * Defensive — falls ein Keyword je Regex-Sonderzeichen enthaelt.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Entfernt Diakritika (Akzente, Umlaut-Punkte) via Unicode-NFD-Zerlegung +
 * Strip der Combining-Marks. "Café" → "Cafe", "Döner" → "Doner",
 * "Gaststätte" → "Gaststatte". Noetig, damit die `\b`-Word-Boundary (ASCII-
 * basiert) auch fuer akzentuierte Lieferantennamen korrekt greift.
 */
function foldDiacritics(s: string): string {
  // NFD zerlegt akzentuierte Zeichen in Basis + Combining-Mark; `\p{M}`
  // (Unicode-Mark-Property, u-Flag) entfernt die Marks. Vermeidet eine
  // Combining-Mark-Range in der Character-Class (biome/noMisleadingCharacterClass).
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}
