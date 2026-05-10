/**
 * M03 — POST /api/v1/receipts/:receipt_id/categorize
 *
 * Logik exakt nach M03-Spec §7.1:
 *   1) Receipt laden (assertStatus: ['extracted'])
 *   2) Hook before_categorization
 *   3) Strategie 1: Override (profile.custom.supplier_overrides)
 *   4) Strategie 2: Master-Data (suppliers_global)
 *   5) Strategie 3: Claude-Categorizer (mit Cache)
 *   6) Cost-Center via profile.custom.branch_rules
 *   7) Threshold-Check (low_confidence_threshold ?? 0.75)
 *   8) Hook after_categorization
 *   9) Persist + Audit + Event
 *
 * Idempotenz: Wenn das Receipt bereits 'categorized' oder 'requires_review' ist,
 * akzeptieren wir den Aufruf nicht (409 CONFLICT) — Re-Run muss explizit
 * über Status-Reset (Pipeline-Korrektur) erfolgen.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

import * as receiptRepo from '../../_shared/receipts/receipt.repository';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

import { type CustomerProfile, categorizeInputSchema } from '../schemas/categorize.input';
import { writeAudit } from '../services/audit.service';
import {
  type AnthropicLikeClient,
  type ClaudeCategorizer,
  createClaudeCategorizer,
} from '../services/claude-categorizer';
import { combineCategorizationConfidence } from '../services/confidence-scorer';
import { emitCategorizationEvent } from '../services/event-emitter';
import { resolveFromMasterData } from '../services/master-data-resolver';
import { resolveOverride } from '../services/override-resolver';
import { type SkrChart, getCategoryLabel, mapSkrAccount, mapTaxKey } from '../services/skr-mapper';
import type { CategorizationContext, CategorizationResult } from '../services/types';

const ACCEPTED_INPUT_STATUSES = new Set<string>(['extracted']);

export interface CategorizeHandlerDeps {
  /** Optional injizierter Anthropic-Client (Tests). */
  anthropicClient?: AnthropicLikeClient;
  /** Optional komplette Categorizer-Instanz (Tests). */
  claudeCategorizer?: ClaudeCategorizer;
}

export function buildCategorizeHandler(deps: CategorizeHandlerDeps = {}) {
  return async function categorizeHandler(
    req: FastifyRequest<{ Params: { receipt_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = categorizeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_profile, trace_id } = parsed.data;
    const { receipt_id } = req.params;
    const customerId = customer_profile.customer_id;

    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    // 1) Receipt laden + Status prüfen
    let receipt = await receiptRepo.findById(db, receipt_id, customerId);
    if (!receipt) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Kein Receipt ${receipt_id} für Customer ${customerId}.`, {
          receipt_id,
          customer_id: customerId,
        }),
      );
    }
    if (!ACCEPTED_INPUT_STATUSES.has(receipt.status)) {
      return reply.code(422).send(
        apiError(
          'INVALID_STATUS',
          `Receipt-Status '${receipt.status}' nicht akzeptiert für /categorize.`,
          {
            status: receipt.status,
            accepted: Array.from(ACCEPTED_INPUT_STATUSES),
          },
        ),
      );
    }

    try {
      // 2) Hook before_categorization
      receipt = await hookRunner.run('before_categorization', {
        receipt,
        profile: customer_profile,
      });

      // Receipt-Felder extrahieren (typensicher)
      const ctx = buildCategorizationContext(receipt, customerId);
      const skrChart: SkrChart = customer_profile.routing?.skr_chart ?? 'SKR03';

      // 3) Strategie 1: Override
      let result: CategorizationResult | null = resolveOverride({
        supplierName: ctx.supplierName ?? '',
        profileCustom: customer_profile.custom,
        categoryLabelLookup: undefined, // sync-Lookup macht den Override frei von DB; Label hängt der Mapper im Override-Result an
      });

      // 4) Strategie 2: Master-Data
      if (!result) {
        result = await resolveFromMasterData(
          db,
          {
            supplierName: ctx.supplierName,
            vatId: ctx.supplierVatId,
          },
          async (cid) => (await getCategoryLabel(db, cid)) ?? cid,
        );
      }

      // 5) Strategie 3: Claude
      if (!result) {
        const categorizer =
          deps.claudeCategorizer ??
          createClaudeCategorizer({
            pool: db,
            redis,
            client: deps.anthropicClient,
          });
        result = await categorizer.categorize({
          context: ctx,
          customerId,
          skrChart,
          industryHint: pickString(customer_profile.custom, 'industry_hint'),
          examples: pickExamples(customer_profile.custom),
        });
      }

      // 5a) SKR-Override (customer_categories) und Tax-Key auflösen
      const finalSkr =
        result.skr_account && result.skr_account.length > 0
          ? await maybeOverrideSkr(db, customerId, result.category, result.skr_account, skrChart)
          : await tryMapSkr(db, customerId, result.category, skrChart);

      const dominantTaxRate = pickDominantTaxRate(ctx.taxLines);
      const finalTaxKey =
        result.tax_key && result.tax_key.length > 0
          ? result.tax_key
          : await mapTaxKey(
              db,
              result.category,
              dominantTaxRate,
              customer_profile.routing?.tax_keys_map,
            );

      // 5b) Sicherstellen, dass label gesetzt ist
      const finalLabel =
        result.category_label && result.category_label.length > 0
          ? result.category_label
          : ((await getCategoryLabel(db, result.category)) ?? result.category);

      // 6) Cost-Center via branch_rules
      const branchRules = customer_profile.custom?.branch_rules as
        | Record<string, { cost_center?: string }>
        | undefined;
      const branch =
        (receipt.meta as { branch?: string } | undefined)?.branch ??
        pickString(customer_profile.custom, 'default_branch');
      const branchCostCenter = branch && branchRules?.[branch]?.cost_center;
      const finalCostCenter = result.cost_center ?? branchCostCenter ?? null;

      // 7) Confidence + Status-Entscheidung
      const finalConfidence = combineCategorizationConfidence({
        engineConfidence: result.confidence,
        engine: result.engine,
        hasCategory: Boolean(result.category),
        hasSkrAccount: Boolean(finalSkr),
      });
      const threshold = customer_profile.routing?.low_confidence_threshold ?? 0.75;
      const newStatus: Receipt['status'] =
        finalConfidence < threshold ? 'requires_review' : 'categorized';

      // 8) Hook after_categorization
      const auditEvents = [
        ...asAuditEvents((receipt.audit as { events?: unknown } | undefined)?.events),
        {
          at: new Date().toISOString(),
          type: newStatus === 'categorized' ? 'categorized' : 'requires_review',
          actor: 'system',
        },
      ];

      const patched: Receipt = {
        ...receipt,
        status: newStatus,
        categorization: {
          engine: result.engine,
          ...(result.engine_version ? { engine_version: result.engine_version } : {}),
          confidence: finalConfidence,
          category: result.category,
          category_label: finalLabel,
          skr_account: finalSkr,
          tax_key: finalTaxKey,
          cost_center: finalCostCenter,
          rationale: result.rationale ?? '',
        },
        audit: { events: auditEvents },
      };

      receipt = await hookRunner.run('after_categorization', {
        receipt: patched,
        profile: customer_profile,
      });

      // 9) Persist + Audit + Event
      const saved = await receiptRepo.update(db, receipt);

      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType:
          newStatus === 'categorized' ? 'pp.receipt.categorized' : 'pp.receipt.requires_review',
        payload: {
          engine: result.engine,
          confidence: finalConfidence,
          category: result.category,
          skr_account: finalSkr,
          tax_key: finalTaxKey,
          cost_center: finalCostCenter,
        },
        traceId: trace_id,
      });
      void emitCategorizationEvent(
        redis,
        newStatus === 'categorized' ? 'pp.receipt.categorized' : 'pp.receipt.requires_review',
        {
          receipt_id: saved.receipt_id,
          customer_id: saved.customer_id,
          status: saved.status,
          category: result.category,
          category_label: finalLabel,
          skr_account: finalSkr,
          confidence: finalConfidence,
          engine: result.engine,
          trace_id,
        },
      );

      const eventsToEmit = [
        newStatus === 'categorized' ? 'pp.receipt.categorized' : 'pp.receipt.requires_review',
      ];

      return reply.send(
        apiOk({
          receipt: saved,
          receipt_patch: {
            status: saved.status,
            categorization: saved.categorization,
          },
          events_to_emit: eventsToEmit,
          module: 'M03',
        }),
      );
    } catch (err) {
      logger.error({ err, receipt_id, customerId }, 'M03 categorize fehlgeschlagen');
      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: 'pp.receipt.categorization_failed',
        payload: { error: (err as Error).message },
        traceId: trace_id,
      });
      void emitCategorizationEvent(redis, 'pp.receipt.categorization_failed', {
        receipt_id,
        customer_id: customerId,
        status: 'error',
        trace_id,
      });
      return reply.code(502).send(
        apiError('EXTERNAL_API_FAILED', 'Kategorisierung fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCategorizationContext(receipt: Receipt, customerId: string): CategorizationContext {
  const fields =
    (receipt.extraction as { fields?: Record<string, unknown> } | undefined)?.fields ?? {};
  const taxLinesRaw = (fields.tax_lines as Array<Record<string, unknown>> | undefined) ?? [];
  const taxLines = taxLinesRaw
    .map((t) => ({
      rate: typeof t.rate === 'number' ? t.rate : 0,
      base: typeof t.base === 'number' ? t.base : 0,
      amount: typeof t.amount === 'number' ? t.amount : 0,
    }))
    .filter((t) => t.rate >= 0);
  const lineItems = (fields.line_items as Array<Record<string, unknown>> | undefined) ?? [];

  return {
    customerId,
    supplierName: typeof fields.supplier_name === 'string' ? fields.supplier_name : undefined,
    supplierVatId:
      typeof fields.supplier_vat_id === 'string' ? (fields.supplier_vat_id as string) : null,
    documentDate: typeof fields.document_date === 'string' ? fields.document_date : undefined,
    totalGross: typeof fields.total_gross === 'number' ? (fields.total_gross as number) : undefined,
    totalNet: typeof fields.total_net === 'number' ? (fields.total_net as number) : undefined,
    currency: typeof fields.currency === 'string' ? (fields.currency as string) : 'EUR',
    taxLines,
    lineItems: lineItems.map((i) => ({
      description: typeof i.description === 'string' ? (i.description as string) : undefined,
      qty: typeof i.qty === 'number' ? (i.qty as number) : undefined,
      unit_price: typeof i.unit_price === 'number' ? (i.unit_price as number) : undefined,
      total: typeof i.total === 'number' ? (i.total as number) : undefined,
      tax_rate: typeof i.tax_rate === 'number' ? (i.tax_rate as number) : undefined,
    })),
  };
}

async function maybeOverrideSkr(
  db: Pool,
  customerId: string,
  categoryId: string,
  defaultSkr: string,
  skrChart: SkrChart,
): Promise<string> {
  // Wenn Customer-Override existiert → der gewinnt; sonst der vom Engine gelieferte Wert.
  const overrideRow = await db.query<{ override_skr: string | null }>(
    `SELECT override_skr FROM customer_categories
      WHERE customer_id = $1 AND category_id = $2 LIMIT 1`,
    [customerId, categoryId],
  );
  if (overrideRow.rows[0]?.override_skr) return overrideRow.rows[0].override_skr;
  if (defaultSkr) return defaultSkr;
  // Wenn Engine kein SKR geliefert hat → aus categories nachschlagen.
  return tryMapSkr(db, customerId, categoryId, skrChart);
}

async function tryMapSkr(
  db: Pool,
  customerId: string,
  categoryId: string,
  skrChart: SkrChart,
): Promise<string> {
  try {
    return await mapSkrAccount(db, categoryId, skrChart, customerId);
  } catch (err) {
    logger.warn({ err, categoryId, skrChart }, 'M03 SKR-Mapping fehlgeschlagen');
    return '';
  }
}

function pickString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function pickExamples(
  custom: Record<string, unknown> | undefined,
): Array<{ supplier: string; category: string; skr?: string; items_pattern?: string }> | undefined {
  const raw = custom?.ai_categorization_examples as
    | Array<{ supplier?: unknown; category?: unknown; skr?: unknown; items_pattern?: unknown }>
    | undefined;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .filter((r) => typeof r.supplier === 'string' && typeof r.category === 'string')
    .map((r) => ({
      supplier: r.supplier as string,
      category: r.category as string,
      ...(typeof r.skr === 'string' ? { skr: r.skr as string } : {}),
      ...(typeof r.items_pattern === 'string' ? { items_pattern: r.items_pattern as string } : {}),
    }))
    .slice(0, 5);
}

function pickDominantTaxRate(taxLines?: Array<{ rate: number; amount: number }>): number {
  if (!taxLines || taxLines.length === 0) return 0;
  const sorted = [...taxLines].sort((a, b) => b.amount - a.amount);
  return sorted[0].rate;
}

function asAuditEvents(v: unknown): { at: string; type: string; actor: string }[] {
  return Array.isArray(v) ? (v as { at: string; type: string; actor: string }[]) : [];
}

/** Type-Helper für Tests: erlaubt direkten Zugriff auf interne Hilfsfunktionen. */
export const __test__ = {
  buildCategorizationContext,
  pickDominantTaxRate,
  pickExamples,
};

// Used so CustomerProfile-Type von oben nicht ungenutzt erscheint:
export type CategorizeHandlerCustomerProfile = CustomerProfile;
