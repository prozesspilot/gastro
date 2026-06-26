/**
 * T078 — Tests fuer den confirm-review-Handler.
 * Repository gemockt (getBelegById + confirmBelegReview), Service laeuft echt →
 * deckt Handler-HTTP-Mapping + Service-Gates zusammen ab.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBelegById, confirmBelegReview } = vi.hoisted(() => ({
  getBelegById: vi.fn(),
  confirmBelegReview: vi.fn(),
}));

vi.mock('../../m01-receipt-intake/services/beleg.repository', () => ({
  getBelegById,
  confirmBelegReview,
}));

import { buildBelegeConfirmReviewHandler } from '../handlers/belege-confirm-review.handler';

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

function reviewBeleg(over: Record<string, unknown> = {}) {
  return {
    status: 'requires_review',
    category: 'wareneinkauf_food',
    payload: { categorization: { category: 'wareneinkauf_food' } },
    ...over,
  };
}

beforeEach(() => {
  getBelegById.mockReset();
  confirmBelegReview.mockReset();
});

describe('belege-confirm-review.handler (T078)', () => {
  it('200 happy-path → status categorized', async () => {
    getBelegById.mockResolvedValue(reviewBeleg());
    confirmBelegReview.mockResolvedValue({ id: VALID_UUID, status: 'categorized' });
    const reply = mockReply();

    await buildBelegeConfirmReviewHandler()(mockReq(), reply);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as { data: { status: string } }).data.status).toBe('categorized');
    expect(confirmBelegReview).toHaveBeenCalledTimes(1);
  });

  it('401 ohne Tenant-Context', async () => {
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(mockReq({ tenantId: undefined }), reply);
    expect(reply.statusCode).toBe(401);
    expect(getBelegById).not.toHaveBeenCalled();
  });

  it('403 fuer support-Rolle', async () => {
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(
      mockReq({ m14Staff: { userId: 'u', role: 'support' } }),
      reply,
    );
    expect(reply.statusCode).toBe(403);
    expect(getBelegById).not.toHaveBeenCalled();
  });

  it('400 bei Nicht-UUID', async () => {
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(mockReq({ params: { id: 'nope' } }), reply);
    expect(reply.statusCode).toBe(400);
  });

  it('404 wenn Beleg nicht existiert', async () => {
    getBelegById.mockResolvedValue(null);
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(mockReq(), reply);
    expect(reply.statusCode).toBe(404);
  });

  it('422 INVALID_STATUS bei nicht-requires_review', async () => {
    getBelegById.mockResolvedValue(reviewBeleg({ status: 'categorized' }));
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(mockReq(), reply);
    expect(reply.statusCode).toBe(422);
    expect((reply.body as { error: { code: string } }).error.code).toBe('INVALID_STATUS');
    expect(confirmBelegReview).not.toHaveBeenCalled();
  });

  it('422 CATEGORY_REQUIRED wenn category null', async () => {
    getBelegById.mockResolvedValue(reviewBeleg({ category: null }));
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(mockReq(), reply);
    expect(reply.statusCode).toBe(422);
    expect((reply.body as { error: { code: string } }).error.code).toBe('CATEGORY_REQUIRED');
  });

  it('422 NOT_CATEGORIZED wenn payload.categorization fehlt', async () => {
    getBelegById.mockResolvedValue(reviewBeleg({ payload: {} }));
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(mockReq(), reply);
    expect(reply.statusCode).toBe(422);
    expect((reply.body as { error: { code: string } }).error.code).toBe('NOT_CATEGORIZED');
  });

  it('422 BEWIRTUNG_FIELDS_REQUIRED bei fehlenden Pflichtfeldern', async () => {
    getBelegById.mockResolvedValue(
      reviewBeleg({
        category: 'bewirtung',
        payload: { categorization: { category: 'bewirtung' }, extraction: { fields: {} } },
      }),
    );
    const reply = mockReply();
    await buildBelegeConfirmReviewHandler()(mockReq(), reply);
    expect(reply.statusCode).toBe(422);
    expect((reply.body as { error: { code: string } }).error.code).toBe(
      'BEWIRTUNG_FIELDS_REQUIRED',
    );
  });
});
