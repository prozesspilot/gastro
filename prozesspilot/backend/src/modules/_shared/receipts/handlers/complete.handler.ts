/**
 * POST /api/v1/receipts/:receipt_id/complete
 *
 * Setzt den finalen Status eines Belegs auf 'completed'. Wird vom Master-
 * Workflow nach allen Sub-Workflow-Durchläufen aufgerufen.
 *
 * Erlaubt aus den Status: 'exported', 'archived', 'categorized', 'extracted'.
 * Bei 'requires_review' / 'error': 422 (Master-Workflow soll diese Belege
 * nicht in 'completed' überführen).
 */

import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';

import { publishEvent } from '../../../../core/events/publisher';
import { apiError, apiOk, zodToApiError } from '../../../../core/schemas/common';
import * as receiptRepo from '../receipt.repository';
import type { Receipt } from '../receipt.repository';

const completeBodySchema = z.object({
  customer_id: z.string().min(1),
  trace_id: z.string().optional(),
});

const TERMINAL_INPUT_STATUSES = new Set<string>([
  'extracted',
  'categorized',
  'archived',
  'exported',
]);

const SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export function buildCompleteHandler() {
  return async function completeHandler(
    req: FastifyRequest<{ Params: { receipt_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = completeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id, trace_id } = parsed.data;
    const { receipt_id } = req.params;
    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    const receipt = await receiptRepo.findById(db, receipt_id, customer_id);
    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Kein Receipt ${receipt_id} für Customer ${customer_id}.`));
    }

    // Idempotenz: schon completed
    if (receipt.status === 'completed') {
      return reply.send(apiOk({ receipt, already_completed: true }));
    }

    if (!TERMINAL_INPUT_STATUSES.has(receipt.status)) {
      return reply.code(422).send(
        apiError(
          'INVALID_STATUS',
          `Receipt-Status '${receipt.status}' nicht akzeptiert für /complete.`,
          {
            status: receipt.status,
            accepted: Array.from(TERMINAL_INPUT_STATUSES),
          },
        ),
      );
    }

    const completedAt = new Date().toISOString();
    const auditEvents = [
      ...asAuditEvents((receipt.audit as { events?: unknown } | undefined)?.events),
      { at: completedAt, type: 'completed', actor: 'system' },
    ];
    const patched: Receipt = {
      ...receipt,
      status: 'completed',
      audit: { events: auditEvents },
    };

    const saved = await receiptRepo.update(db, patched);

    // Audit-Insert (best-effort)
    void writeAuditRow(db, customer_id, receipt_id, 'pp.receipt.completed', { trace_id });

    // Event
    void publishEvent(redis, 'pp:events:receipt', {
      type: 'pp.receipt.completed',
      customer_id,
      timestamp: completedAt,
      payload: JSON.stringify({
        receipt_id,
        customer_id,
        status: 'completed',
        completed_at: completedAt,
        ...(trace_id ? { trace_id } : {}),
      }),
    });

    return reply.send(apiOk({ receipt: saved, completed_at: completedAt }));
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

function asAuditEvents(v: unknown): { at: string; type: string; actor: string }[] {
  return Array.isArray(v) ? (v as { at: string; type: string; actor: string }[]) : [];
}

/** sha256 helper, derzeit ungenutzt, exportiert für Tests. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
