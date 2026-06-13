/**
 * T048/F2 — POST /api/v1/belege/:id/categorize
 *
 * Pilot-Kategorisierung auf der belege-Welt (CLAUDE.md §3.3/§3.6):
 *   1) Beleg laden (tenant-scoped, RLS) + Status-Check ('extracted')
 *   2) OCR-Felder aus payload.extraction.fields lesen
 *   3) KI-Categorizer (Pilot-Minimal, SYSTEM_CATEGORIES)
 *   4) Confidence-Threshold → status 'categorized' | 'requires_review'
 *   5) Persist (status + category + payload.categorization) + Audit
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook (JWT). support-Rolle darf nicht.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiError, apiOk } from '../../../core/schemas/common';
import {
  getBelegById,
  updateBelegCategorization,
} from '../../m01-receipt-intake/services/beleg.repository';
import { type BelegCategorizerInput, categorizeBeleg } from '../services/belege-categorizer';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIDENCE_THRESHOLD = 0.75;

export interface BelegeCategorizeDeps {
  /** Injizierbarer Categorizer (Tests). Default: echter categorizeBeleg. */
  categorize?: typeof categorizeBeleg;
}

function extractOcrFields(payload: Record<string, unknown>): BelegCategorizerInput {
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

export function buildBelegeCategorizeHandler(deps: BelegeCategorizeDeps = {}) {
  const categorize = deps.categorize ?? categorizeBeleg;

  return async function belegeCategorizeHandler(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const tenantId = req.tenantId;
    const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } })
      .m14Staff;
    if (!staff || !tenantId) {
      return reply.code(401).send(apiError('UNAUTHORIZED', 'Auth oder Tenant fehlt.'));
    }
    if (staff.role === 'support') {
      return reply
        .code(403)
        .send(apiError('FORBIDDEN', 'Support-Rolle darf nicht kategorisieren.'));
    }

    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return reply.code(400).send(apiError('INVALID_ID', 'Beleg-ID ist keine gültige UUID.'));
    }

    const db = req.server.db;
    const beleg = await getBelegById(db, tenantId, id);
    if (!beleg) {
      return reply.code(404).send(apiError('NOT_FOUND', `Kein Beleg ${id} für diesen Tenant.`));
    }
    if (beleg.status !== 'extracted') {
      return reply.code(422).send(
        apiError(
          'INVALID_STATUS',
          `Beleg-Status '${beleg.status}' nicht akzeptiert für /categorize.`,
          {
            status: beleg.status,
            accepted: ['extracted'],
          },
        ),
      );
    }

    const input = extractOcrFields(beleg.payload);
    const result = await categorize(input, { skrChart: 'SKR03' });

    const newStatus: 'categorized' | 'requires_review' =
      result.engine === 'claude' && result.confidence >= CONFIDENCE_THRESHOLD
        ? 'categorized'
        : 'requires_review';

    const saved = await updateBelegCategorization(db, tenantId, id, {
      newStatus,
      category: result.categoryId,
      categorization: {
        engine: result.engine,
        category: result.categoryId,
        category_label: result.categoryLabel,
        skr_account: result.skrAccount,
        skr_chart: result.skrChart,
        confidence: result.confidence,
        rationale: result.rationale,
        categorized_at: new Date().toISOString(),
      },
      audit: { actorType: 'staff', actorId: staff.userId },
    });

    if (!saved) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Beleg ${id} beim Speichern nicht gefunden.`));
    }

    return reply.send(
      apiOk({
        beleg_id: id,
        status: saved.status,
        categorization: {
          category: result.categoryId,
          category_label: result.categoryLabel,
          skr_account: result.skrAccount,
          confidence: result.confidence,
          engine: result.engine,
          requires_review: newStatus === 'requires_review',
        },
      }),
    );
  };
}
