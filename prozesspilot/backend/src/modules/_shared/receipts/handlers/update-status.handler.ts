/**
 * PUT /api/v1/receipts/:receipt_id/status   (Welt A — TEXT customer_id)
 *
 * Wird vom WF-MASTER-RECEIPT (Error-Pfad) und vom WF-ERROR-HANDLER aufgerufen,
 * um den Receipt-Status auf 'requires_review' oder 'error' zu setzen.
 *
 * Body: { customer_id, status, reason?, trace_id? }
 *
 * Erlaubte Übergänge:
 *   * → requires_review
 *   * → error
 *
 * (Vorwärts-Übergänge wie 'extracted' → 'archived' macht der jeweilige Handler
 * selbst. Diese Route ist explizit für „Pipeline meldet Fehler" gedacht.)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { z } from 'zod';

import { apiError, apiOk, zodToApiError } from '../../../../core/schemas/common';
import { publishEvent } from '../../../../core/events/publisher';
import * as receiptRepo from '../receipt.repository';
import type { Receipt } from '../receipt.repository';

const SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const updateStatusSchema = z.object({
  customer_id: z.string().min(1),
  status: z.enum(['requires_review', 'error']),
  reason: z.string().optional(),
  trace_id: z.string().optional(),
});

export function buildUpdateStatusHandler() {
  return async function updateStatusHandler(
    req: FastifyRequest<{ Params: { receipt_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id, status, reason, trace_id } = parsed.data;
    const { receipt_id } = req.params;
    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    const receipt = await receiptRepo.findById(db, receipt_id, customer_id);
    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Kein Receipt ${receipt_id} für Customer ${customer_id}.`));
    }

    const at = new Date().toISOString();
    const auditEvents = [
      ...asAuditEvents((receipt.audit as { events?: unknown } | undefined)?.events),
      { at, type: status, actor: 'system', ...(reason ? { note: reason } : {}) },
    ];
    const patched: Receipt = {
      ...receipt,
      status,
      audit: { events: auditEvents },
      meta: {
        ...((receipt.meta as Record<string, unknown> | undefined) ?? {}),
        ...(reason ? { last_status_reason: reason } : {}),
      },
    };
    const saved = await receiptRepo.update(db, patched);

    void writeAuditRow(db, customer_id, receipt_id, `pp.receipt.${status}`, {
      reason: reason ?? null,
      trace_id: trace_id ?? null,
    });
    void publishEvent(redis, 'pp:events:receipt', {
      type: `pp.receipt.${status}`,
      customer_id,
      timestamp: at,
      payload: JSON.stringify({ receipt_id, customer_id, status, reason, trace_id }),
    });

    return reply.send(apiOk(saved));
  };
}

async function writeAuditRow(
  db: Pool,
  customerId: string,
  receiptId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        SENTINEL_TENANT_ID,
        'system',
        action,
        `customer:${customerId}/receipt:${receiptId}`,
        JSON.stringify({ ...payload, actor: { type: 'system', id: 'master' } }),
      ],
    );
  } catch {
    // best-effort
  }
}

function asAuditEvents(v: unknown): { at: string; type: string; actor: string; note?: string }[] {
  return Array.isArray(v) ? (v as { at: string; type: string; actor: string; note?: string }[]) : [];
}
