/**
 * T048/F2 — Tests für den belege-Categorize-Handler.
 * Repository gemockt (keine DB), Categorizer injiziert.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BelegCategorizationResult } from '../services/belege-categorizer';

const { getBelegById, updateBelegCategorization } = vi.hoisted(() => ({
  getBelegById: vi.fn(),
  updateBelegCategorization: vi.fn(),
}));

vi.mock('../../m01-receipt-intake/services/beleg.repository', () => ({
  getBelegById,
  updateBelegCategorization,
}));

import { buildBelegeCategorizeHandler } from '../handlers/belege-categorize.handler';

const VALID_UUID = '0123abcd-89ab-cdef-0123-456789abcdef';

function mockReply(): FastifyReply & { statusCode: number; body: unknown } {
  const r = {
    statusCode: 200,
    body: undefined as unknown,
    code(c: number) {
      r.statusCode = c;
      return r;
    },
    send(body: unknown) {
      r.body = body;
      return r;
    },
  };
  return r as unknown as FastifyReply & { statusCode: number; body: unknown };
}

function mockReq(over: Record<string, unknown> = {}): FastifyRequest<{ Params: { id: string } }> {
  return {
    tenantId: 'tenant-1',
    m14Staff: { userId: 'user-1', role: 'mitarbeiter' },
    params: { id: VALID_UUID },
    server: { db: {} },
    ...over,
  } as unknown as FastifyRequest<{ Params: { id: string } }>;
}

function result(over: Partial<BelegCategorizationResult> = {}): BelegCategorizationResult {
  return {
    categoryId: 'wareneinkauf_food',
    categoryLabel: 'Wareneinkauf Lebensmittel',
    skrAccount: '3100',
    skrChart: 'SKR03',
    confidence: 0.95,
    rationale: 'ok',
    engine: 'claude',
    ...over,
  };
}

beforeEach(() => {
  getBelegById.mockReset();
  updateBelegCategorization.mockReset();
});

describe('belege-categorize.handler (T048/F2)', () => {
  it('setzt status=categorized bei hoher confidence', async () => {
    getBelegById.mockResolvedValue({
      status: 'extracted',
      payload: { extraction: { fields: { supplier_name: 'METRO' } } },
    });
    updateBelegCategorization.mockResolvedValue({ status: 'categorized' });
    const handler = buildBelegeCategorizeHandler({ categorize: async () => result() });
    const reply = mockReply();

    await handler(mockReq(), reply);

    expect(reply.statusCode).toBe(200);
    expect(updateBelegCategorization).toHaveBeenCalledTimes(1);
    expect(updateBelegCategorization.mock.calls[0][3].newStatus).toBe('categorized');
  });

  it('setzt status=requires_review bei niedriger confidence', async () => {
    getBelegById.mockResolvedValue({ status: 'extracted', payload: {} });
    updateBelegCategorization.mockResolvedValue({ status: 'requires_review' });
    const handler = buildBelegeCategorizeHandler({
      categorize: async () => result({ confidence: 0.4, engine: 'claude' }),
    });
    const reply = mockReply();

    await handler(mockReq(), reply);

    expect(updateBelegCategorization.mock.calls[0][3].newStatus).toBe('requires_review');
  });

  it('Fallback-Engine → requires_review (auch bei hoher confidence)', async () => {
    getBelegById.mockResolvedValue({ status: 'extracted', payload: {} });
    updateBelegCategorization.mockResolvedValue({ status: 'requires_review' });
    const handler = buildBelegeCategorizeHandler({
      categorize: async () => result({ engine: 'fallback', confidence: 0 }),
    });
    const reply = mockReply();

    await handler(mockReq(), reply);

    expect(updateBelegCategorization.mock.calls[0][3].newStatus).toBe('requires_review');
  });

  it('404 wenn Beleg nicht existiert', async () => {
    getBelegById.mockResolvedValue(null);
    const handler = buildBelegeCategorizeHandler({ categorize: async () => result() });
    const reply = mockReply();

    await handler(mockReq(), reply);

    expect(reply.statusCode).toBe(404);
    expect(updateBelegCategorization).not.toHaveBeenCalled();
  });

  it('422 wenn Beleg nicht im Status extracted', async () => {
    getBelegById.mockResolvedValue({ status: 'received', payload: {} });
    const handler = buildBelegeCategorizeHandler({ categorize: async () => result() });
    const reply = mockReply();

    await handler(mockReq(), reply);

    expect(reply.statusCode).toBe(422);
    expect(updateBelegCategorization).not.toHaveBeenCalled();
  });

  it('403 für support-Rolle', async () => {
    const handler = buildBelegeCategorizeHandler({ categorize: async () => result() });
    const reply = mockReply();

    await handler(mockReq({ m14Staff: { userId: 'u', role: 'support' } }), reply);

    expect(reply.statusCode).toBe(403);
    expect(getBelegById).not.toHaveBeenCalled();
  });
});
