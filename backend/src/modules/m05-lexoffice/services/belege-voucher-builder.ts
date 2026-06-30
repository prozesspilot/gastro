/**
 * T009/M05 — Voucher-Builder fuer die belege-Tabelle (post-Reboot Schema).
 *
 * Parallel zu core/adapters/booking/lexoffice/voucher.builder.ts, der gegen
 * das alte receipts-Schema gebaut ist. Wir lesen aus belege.payload.extraction
 * .fields, nicht aus receipt.extraction.
 *
 * Spec M05 §8 — Voucher-Mapping (vereinfacht fuer Pilot):
 *   * voucherNumber: document_number aus extraction, fallback beleg.id
 *   * voucherDate: document_date (Pflicht — kommt aus belege.document_date
 *     oder payload.extraction.fields.document_date)
 *   * totalGrossAmount: beleg.total_gross
 *   * voucherItems[0]: ein Item pro Beleg (kein Position-Splitting in
 *     Phase 1; das kommt mit M03-Phase-2)
 *   * categoryId: muss vom Caller aufgeloest werden (mapping kommt aus
 *     category.mapper)
 *
 * Bewirtung-Spezialfall (von T008):
 *   * Wenn beleg.category='bewirtung': category-id auf Lexoffice
 *     "Bewirtungsaufwand abziehbar" mappen (separater Param vom Caller).
 *     Memo enthaelt zusaetzlich "Anlass: ... · Teilnehmer: ..." falls in
 *     payload.extraction.fields.bewirtung_anlass/_teilnehmer gesetzt.
 *
 * Output: LexofficeVoucher — fertiger Request-Body fuer POST /v1/vouchers.
 */

import type {
  LexofficeUuid,
  LexofficeVoucher,
  LexofficeVoucherItem,
} from '../../../core/adapters/booking/lexoffice/lexoffice.types';

export interface BelegeForVoucher {
  id: string;
  supplier_name: string | null;
  document_date: Date | string | null;
  /**
   * T009-Review-Fix: `belege.total_gross` ist NUMERIC(12,2). Der pg-Driver
   * liefert NUMERIC standardmaessig als String (kein globaler setTypeParser
   * im Repo). Typ daher ehrlich als `number | string | null` — `buildBelegVoucher`
   * coerced via `coerceAmount()`. NUMERIC(12,2) passt verlustfrei in double.
   */
  total_gross: number | string | null;
  currency: string;
  category: string | null;
  payload: Record<string, unknown>;
}

export interface BuildVoucherInput {
  beleg: BelegeForVoucher;
  /** Vom Caller aufgeloest aus category.mapper. */
  lexofficeCategoryId: LexofficeUuid;
  /** Kontakt-ID falls vorher gefunden, sonst Sammel-Kreditor. */
  contactId?: LexofficeUuid | null;
}

interface ExtractionFields {
  document_number?: string;
  document_date?: string;
  total_gross?: number;
  total_net?: number;
  tax_lines?: Array<{ rate: number; base: number; amount: number }>;
  /** T007 Light-Extractor schreibt einen einzelnen tax_rate-Wert. */
  tax_rate?: number;
  /** T008 Bewirtungs-Detector befuellt diese Felder. */
  bewirtung_anlass?: string;
  bewirtung_teilnehmer?: string;
}

/**
 * Mappt einen Beleg auf einen Lexoffice-Voucher.
 *
 * Pure Funktion: keine DB, kein I/O. Tests passen ein minimales Beleg-
 * Mock-Objekt rein.
 */
export function buildBelegVoucher(input: BuildVoucherInput): LexofficeVoucher {
  const { beleg, lexofficeCategoryId, contactId } = input;
  const payload = beleg.payload as { extraction?: { fields?: ExtractionFields } };
  const fields = payload.extraction?.fields ?? {};

  const documentDate = isoDateOf(beleg.document_date) ?? fields.document_date ?? today();
  const totalGross = round2(coerceAmount(beleg.total_gross) ?? fields.total_gross ?? 0);

  // Tax-Lines: T007 liefert nur einen tax_rate-Wert, nicht das volle tax_lines-Array.
  // Wir konstruieren ein einzelnes Tax-Line aus tax_rate, oder fallen auf
  // dominant aus fields.tax_lines zurueck.
  const taxRatePercent = computeTaxRatePercent(fields);
  const totalTax = round2(taxAmountFromGross(totalGross, taxRatePercent));

  const item: LexofficeVoucherItem = {
    amount: totalGross,
    taxAmount: totalTax,
    taxRatePercent,
    categoryId: lexofficeCategoryId,
  };

  const memoParts = [`ProzessPilot ${beleg.id}`];
  if (beleg.category) memoParts.push(`Kategorie: ${beleg.category}`);
  // T055 — category-Gate: Anlass/Teilnehmer NUR bei echter Bewirtung ans Memo.
  // Die Felder bleiben sonst stale im payload (Szenario: T008-Detektor setzt
  // category='bewirtung' + Felder, danach überschreibt eine sichere KI die
  // Kategorie auf z. B. 'wareneinkauf_food' (T053). Ohne dieses Gate trüge der
  // gebuchte Nicht-Bewirtungs-Beleg irreführend "Anlass/Teilnehmer" im Memo).
  if (beleg.category === 'bewirtung') {
    if (fields.bewirtung_anlass) memoParts.push(`Anlass: ${fields.bewirtung_anlass}`);
    if (fields.bewirtung_teilnehmer) memoParts.push(`Teilnehmer: ${fields.bewirtung_teilnehmer}`);
  }

  // T009-Review-Fix #7: Lexoffice-API hat ein Memo-Length-Limit (~250 Zeichen
  // laut OpenAPI-Spec). Bei langen Teilnehmer-Listen sonst HTTP 400. Wir
  // truncen hart auf MEMO_MAX_CHARS — Inhalt geht zwar verloren, aber die
  // Anlass/Teilnehmer-Details stehen ohnehin auch in payload.extraction.fields
  // und im Beleg-Detail-View (T015). Lexoffice-Memo ist nur Kontext-Hinweis.
  const fullMemo = memoParts.join(' · ');
  const memo =
    fullMemo.length > MEMO_MAX_CHARS ? `${fullMemo.slice(0, MEMO_MAX_CHARS - 1)}…` : fullMemo;

  return {
    type: 'purchaseinvoice',
    voucherNumber: fields.document_number ?? beleg.id,
    voucherDate: documentDate,
    dueDate: documentDate,
    totalGrossAmount: totalGross,
    totalTaxAmount: totalTax,
    taxType: 'gross',
    useCollectiveContact: !contactId,
    ...(contactId ? { contactId } : {}),
    voucherItems: [item],
    memo,
  };
}

/** T009: Lexoffice-Memo-API-Limit. Quelle: Lexoffice OpenAPI v1 (voucher.memo). */
export const MEMO_MAX_CHARS = 250;

// ── Helpers ──────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Coerced einen Betrag, der als number ODER (pg-NUMERIC) String reinkommt,
 * zu einem endlichen number. null/undefined/ungueltig → undefined, damit der
 * `?? fields.total_gross ?? 0`-Fallback im Caller greift.
 */
function coerceAmount(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function isoDateOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  }
  return value.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeTaxRatePercent(fields: ExtractionFields): number {
  // Bevorzugung: explizit tax_rate vom User korrigiert
  if (typeof fields.tax_rate === 'number') return round2(fields.tax_rate);
  // Fallback: dominanter Satz aus tax_lines
  const lines = fields.tax_lines ?? [];
  if (lines.length === 0) return 19; // Default 19% wenn nichts bekannt
  const sorted = [...lines].sort((a, b) => b.amount - a.amount);
  return round2(sorted[0].rate * 100);
}

function taxAmountFromGross(gross: number, taxRatePercent: number): number {
  if (taxRatePercent <= 0) return 0;
  const net = gross / (1 + taxRatePercent / 100);
  return gross - net;
}
