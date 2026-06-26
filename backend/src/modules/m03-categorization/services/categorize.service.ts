/**
 * T077 — Geteilte Kategorisier-Logik (belege-Welt).
 *
 * Extrahiert aus belege-categorize.handler.ts (T048), damit BEIDE Aufrufer
 * dieselbe Logik nutzen:
 *   - die manuelle Route POST /belege/:id/categorize (Mitarbeiter, actor=staff)
 *   - der OCR-Worker (Auto-Kategorisieren nach 'extracted', actor=system)
 *
 * Vorbedingung: Beleg-Status 'extracted' (sonst invalid_status — idempotent gegen
 * Doppel-Trigger Auto+manuell). Threshold 0.75 + nur engine='claude' →
 * 'categorized', sonst 'requires_review'. T053-Bewirtungs-Schutz bleibt erhalten.
 */
import type { Pool } from 'pg';
import type { AuditActor } from '../../../core/audit/audit-log';
import {
  type BelegStatus,
  confirmBelegReview,
  getBelegById,
  updateBelegCategorization,
} from '../../m01-receipt-intake/services/beleg.repository';
import { PILOT_SKR_CHART, findCategory, skrAccountFor } from '../system-categories';
import {
  type BelegCategorizationResult,
  type BelegCategorizerInput,
  categorizeBeleg,
} from './belege-categorizer';

export const CONFIDENCE_THRESHOLD = 0.75;

export interface CategorizationSummary {
  category: string;
  category_label: string;
  skr_account: string | null;
  confidence: number;
  engine: string;
  requires_review: boolean;
  bewirtung_preserved: boolean;
}

export type CategorizeBelegOutcome =
  | { ok: true; status: 'categorized' | 'requires_review'; categorization: CategorizationSummary }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_status'; status: BelegStatus };

/** Liest die OCR-Felder aus payload.extraction in die Categorizer-Eingabe. */
export function extractOcrFields(payload: Record<string, unknown>): BelegCategorizerInput {
  const fields = ((payload.extraction as { fields?: Record<string, unknown> } | undefined)
    ?.fields ?? {}) as Record<string, unknown>;
  const taxLinesRaw = (fields.tax_lines as Array<Record<string, unknown>> | undefined) ?? [];
  const lineItemsRaw = (fields.line_items as Array<Record<string, unknown>> | undefined) ?? [];
  const bewirtung = payload.bewirtung as { is_bewirtung?: boolean } | undefined;

  return {
    supplierName: typeof fields.supplier_name === 'string' ? fields.supplier_name : null,
    documentDate: typeof fields.document_date === 'string' ? fields.document_date : null,
    totalGross: typeof fields.total_gross === 'number' ? fields.total_gross : null,
    currency: typeof fields.currency === 'string' ? fields.currency : 'EUR',
    taxLines: taxLinesRaw.map((t) => ({
      rate: typeof t.rate === 'number' ? t.rate : 0,
      amount: typeof t.amount === 'number' ? t.amount : 0,
    })),
    lineItems: lineItemsRaw.map((i) => ({
      description: typeof i.description === 'string' ? i.description : undefined,
      total: typeof i.total === 'number' ? i.total : undefined,
    })),
    isBewirtung: bewirtung?.is_bewirtung === true,
  };
}

export interface CategorizeBelegDeps {
  /** Injizierbarer Categorizer (Tests). Default: echter categorizeBeleg. */
  categorize?: typeof categorizeBeleg;
}

/**
 * Kategorisiert einen Beleg (tenant-scoped). Setzt Status `categorized` (sichere
 * KI) bzw. `requires_review` und schreibt category + payload.categorization + Audit.
 * Gibt ein Outcome-Objekt zurück (Aufrufer mappen auf HTTP bzw. loggen).
 */
export async function categorizeBelegById(
  db: Pool,
  tenantId: string,
  belegId: string,
  opts: { actor: AuditActor; deps?: CategorizeBelegDeps },
): Promise<CategorizeBelegOutcome> {
  const categorize = opts.deps?.categorize ?? categorizeBeleg;

  const beleg = await getBelegById(db, tenantId, belegId);
  if (!beleg) {
    return { ok: false, reason: 'not_found' };
  }
  if (beleg.status !== 'extracted') {
    return { ok: false, reason: 'invalid_status', status: beleg.status };
  }

  const input = extractOcrFields(beleg.payload);
  const result = await categorize(input, { skrChart: PILOT_SKR_CHART });

  const kiConfident = result.engine === 'claude' && result.confidence >= CONFIDENCE_THRESHOLD;

  // T053: Bewirtungs-Schutz. Hat der OCR-Bewirtungs-Detektor (T008) bereits
  // category='bewirtung' gesetzt und ist die KI UNSICHER, behalten wir 'bewirtung'
  // (sonst gingen anlass/teilnehmer + die M05-Memo/70%-Logik verloren). Bei
  // SICHERER KI gewinnt die KI.
  const preserveBewirtung =
    beleg.category === 'bewirtung' && !kiConfident && result.categoryId !== 'bewirtung';
  const effective: BelegCategorizationResult = preserveBewirtung
    ? {
        categoryId: 'bewirtung',
        categoryLabel: findCategory('bewirtung')?.name ?? 'Bewirtungskosten',
        skrAccount: skrAccountFor('bewirtung', PILOT_SKR_CHART),
        skrChart: PILOT_SKR_CHART,
        confidence: result.confidence,
        rationale: `OCR-Bewirtungs-Detektor beibehalten (KI unsicher → '${result.categoryId}': ${result.rationale})`,
        engine: result.engine,
      }
    : result;

  const newStatus: 'categorized' | 'requires_review' = kiConfident
    ? 'categorized'
    : 'requires_review';

  const saved = await updateBelegCategorization(db, tenantId, belegId, {
    newStatus,
    category: effective.categoryId,
    categorization: {
      engine: effective.engine,
      category: effective.categoryId,
      category_label: effective.categoryLabel,
      skr_account: effective.skrAccount,
      skr_chart: effective.skrChart,
      confidence: effective.confidence,
      rationale: effective.rationale,
      categorized_at: new Date().toISOString(),
    },
    // Auto-Lauf: actor.type='system', actor.id=null → actorId-Sentinel 'system'.
    audit: {
      actorType: opts.actor.type === 'staff' ? 'staff' : 'system',
      actorId: opts.actor.id ?? 'system',
    },
  });

  if (!saved) {
    return { ok: false, reason: 'not_found' };
  }

  return {
    ok: true,
    status: newStatus,
    categorization: {
      category: effective.categoryId,
      category_label: effective.categoryLabel,
      skr_account: effective.skrAccount,
      confidence: effective.confidence,
      engine: effective.engine,
      requires_review: newStatus === 'requires_review',
      bewirtung_preserved: preserveBewirtung,
    },
  };
}

// ---------------------------------------------------------------------------
// T078 — requires_review → categorized (manuelle Freigabe)
// ---------------------------------------------------------------------------

export type ConfirmReviewOutcome =
  | { ok: true; status: 'categorized' }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_status'; status: BelegStatus }
  | { ok: false; reason: 'category_required' }
  | { ok: false; reason: 'not_categorized' }
  | { ok: false; reason: 'bewirtung_fields_required' };

/**
 * Liest die Bewirtungs-Pflichtfelder aus payload.extraction.fields (gleiche
 * Quelle wie update.handler.ts / der M05-Voucher). Hier zusätzlich getrimmt:
 * reines Whitespace ('   ') zählt als leer — bewusst STRENGER als der PATCH-Check
 * (Truthiness ohne trim), weil das die letzte Hürde direkt vor dem Export ist.
 */
function bewirtungFields(payload: Record<string, unknown>): {
  anlass: string | null;
  teilnehmer: string | null;
} {
  const fields = ((payload.extraction as { fields?: Record<string, unknown> } | undefined)
    ?.fields ?? {}) as { bewirtung_anlass?: unknown; bewirtung_teilnehmer?: unknown };
  const anlass =
    typeof fields.bewirtung_anlass === 'string' && fields.bewirtung_anlass.trim()
      ? fields.bewirtung_anlass
      : null;
  const teilnehmer =
    typeof fields.bewirtung_teilnehmer === 'string' && fields.bewirtung_teilnehmer.trim()
      ? fields.bewirtung_teilnehmer
      : null;
  return { anlass, teilnehmer };
}

/**
 * Bestätigt einen geprüften `requires_review`-Beleg als `categorized` (manuelle
 * Mitarbeiter-Freigabe → danach exportierbar). Strikt nur Statuswechsel, keine
 * Re-Kategorisierung. Gates: Status===requires_review, category gesetzt,
 * payload.categorization vorhanden, bei Bewirtung anlass+teilnehmer Pflicht.
 */
export async function confirmBelegReviewById(
  db: Pool,
  tenantId: string,
  belegId: string,
  opts: { actor: { type: 'staff'; id: string } },
): Promise<ConfirmReviewOutcome> {
  const beleg = await getBelegById(db, tenantId, belegId);
  if (!beleg) {
    return { ok: false, reason: 'not_found' };
  }
  if (beleg.status !== 'requires_review') {
    return { ok: false, reason: 'invalid_status', status: beleg.status };
  }
  if (!beleg.category || !beleg.category.trim()) {
    return { ok: false, reason: 'category_required' };
  }
  // payload.categorization muss vorhanden sein (defensiv — bei requires_review
  // immer gesetzt; ohne sie gäbe es kein SKR-Konto für den Export).
  if (!(beleg.payload as { categorization?: unknown }).categorization) {
    return { ok: false, reason: 'not_categorized' };
  }
  if (beleg.category.toLowerCase().includes('bewirtung')) {
    const { anlass, teilnehmer } = bewirtungFields(beleg.payload);
    if (!anlass || !teilnehmer) {
      return { ok: false, reason: 'bewirtung_fields_required' };
    }
  }

  const saved = await confirmBelegReview(db, tenantId, belegId, {
    actorType: 'staff',
    actorId: opts.actor.id,
  });
  // null = Race (Status zwischen Gate und Schreib-Tx geändert) → not_found.
  if (!saved) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true, status: 'categorized' };
}
