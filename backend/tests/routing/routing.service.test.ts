/**
 * D9 — Unit-Tests Routing-Service
 *
 * Repository und n8n-Client werden vollständig gemockt.
 * Kein Postgres, kein Redis, kein n8n nötig.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/modules/routing/routing.repository', () => ({
  createJob: vi.fn(),
  findJobById: vi.fn(),
  updateJobStatus: vi.fn(),
  failJob: vi.fn(),
  claimNextJob: vi.fn(),
  listJobs: vi.fn(),
  resetJobForRetry: vi.fn(),
}));

vi.mock('../../src/core/n8n/client', () => ({
  triggerWebhook: vi.fn(),
}));

import { triggerWebhook } from '../../src/core/n8n/client';
import {
  claimNextJob,
  createJob,
  failJob,
  findJobById,
  resetJobForRetry,
  updateJobStatus,
} from '../../src/modules/routing/routing.repository';
import {
  createJobForDocument,
  processNextJob,
  retryJob,
} from '../../src/modules/routing/routing.service';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-uuid-1',
    tenant_id: 'tenant-uuid-1',
    document_id: 'doc-uuid-1',
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
    error_message: null,
    payload: {},
    result: null,
    run_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Typen der Mocks
const mockCreateJob = vi.mocked(createJob);
const mockClaimNextJob = vi.mocked(claimNextJob);
const mockUpdateJobStatus = vi.mocked(updateJobStatus);
const mockFailJob = vi.mocked(failJob);
const mockFindJobById = vi.mocked(findJobById);
const mockResetJobForRetry = vi.mocked(resetJobForRetry);
const mockTriggerWebhook = vi.mocked(triggerWebhook);

// Dummy-Pool — wird von Service-Funktionen durchgereicht
const pool = {} as Parameters<typeof createJobForDocument>[0];

// ── createJobForDocument ──────────────────────────────────────────────────────

describe('createJobForDocument', () => {
  afterEach(() => vi.clearAllMocks());

  it('legt Job an und gibt ihn zurück', async () => {
    const job = makeJob();
    mockCreateJob.mockResolvedValue(job as never);
    mockTriggerWebhook.mockResolvedValue(null);

    const result = await createJobForDocument(pool, {
      tenantId: 'tenant-uuid-1',
      documentId: 'doc-uuid-1',
    });

    expect(mockCreateJob).toHaveBeenCalledOnce();
    expect(result.id).toBe('job-uuid-1');
  });

  it('wirft nicht wenn n8n-Webhook fehlschlägt', async () => {
    const job = makeJob();
    mockCreateJob.mockResolvedValue(job as never);
    mockTriggerWebhook.mockRejectedValue(new Error('n8n down'));

    await expect(
      createJobForDocument(pool, { tenantId: 't1', documentId: 'd1' }),
    ).resolves.not.toThrow();
  });
});

// ── processNextJob ─────────────────────────────────────────────────────────────

describe('processNextJob', () => {
  afterEach(() => vi.clearAllMocks());

  it('gibt null zurück wenn kein Job bereit', async () => {
    mockClaimNextJob.mockResolvedValue(null);
    const result = await processNextJob(pool);
    expect(result).toBeNull();
  });

  it('markiert Job als done bei Erfolg', async () => {
    const job = makeJob({ status: 'running', attempts: 1 });
    mockClaimNextJob.mockResolvedValue(job as never);
    mockTriggerWebhook.mockResolvedValue({ ok: true });
    mockUpdateJobStatus.mockResolvedValue({ ...job, status: 'done' } as never);

    const result = await processNextJob(pool);

    expect(result?.success).toBe(true);
    expect(mockUpdateJobStatus).toHaveBeenCalledWith(
      pool,
      job.tenant_id,
      job.id,
      'done',
      expect.objectContaining({ n8n_response: expect.anything() }),
    );
  });

  it('ruft failJob auf wenn n8n fehlschlägt', async () => {
    const job = makeJob({ status: 'running', attempts: 1 });
    mockClaimNextJob.mockResolvedValue(job as never);
    mockTriggerWebhook.mockRejectedValue(new Error('Timeout'));
    mockFailJob.mockResolvedValue({ ...job, status: 'failed', attempts: 2 } as never);

    const result = await processNextJob(pool);

    expect(result?.success).toBe(false);
    expect(result?.error).toContain('Timeout');
    expect(mockFailJob).toHaveBeenCalledWith(pool, job.tenant_id, job.id, 'Timeout');
  });

  it('setzt Status auf dead wenn max_attempts erreicht', async () => {
    const job = makeJob({ status: 'running', attempts: 3, max_attempts: 3 });
    mockClaimNextJob.mockResolvedValue(job as never);
    mockTriggerWebhook.mockRejectedValue(new Error('fail'));
    mockFailJob.mockResolvedValue({ ...job, status: 'dead', attempts: 3 } as never);

    const result = await processNextJob(pool);

    expect(result?.success).toBe(false);
    expect(mockFailJob).toHaveBeenCalled();
  });
});

// ── retryJob ──────────────────────────────────────────────────────────────────

describe('retryJob', () => {
  afterEach(() => vi.clearAllMocks());

  it('gibt null zurück wenn Job nicht existiert', async () => {
    mockFindJobById.mockResolvedValue(null);
    const result = await retryJob(pool, 'tenant-1', 'non-existent');
    expect(result).toBeNull();
  });

  it('gibt null zurück wenn Status nicht failed oder dead', async () => {
    const job = makeJob({ status: 'done' });
    mockFindJobById.mockResolvedValue(job as never);
    const result = await retryJob(pool, 'tenant-1', job.id);
    expect(result).toBeNull();
  });

  it('setzt failed-Job zurück auf queued', async () => {
    const job = makeJob({ status: 'failed', attempts: 2 });
    const retried = makeJob({ status: 'queued', attempts: 0, result: null });
    mockFindJobById.mockResolvedValue(job as never);
    mockResetJobForRetry.mockResolvedValue(retried as never);

    const result = await retryJob(pool, 'tenant-1', job.id);

    expect(mockResetJobForRetry).toHaveBeenCalledWith(pool, 'tenant-1', job.id, expect.any(Date));
    expect(result?.status).toBe('queued');
  });

  it('setzt dead-Job zurück auf queued', async () => {
    const job = makeJob({ status: 'dead', attempts: 3 });
    const retried = makeJob({ status: 'queued', attempts: 0 });
    mockFindJobById.mockResolvedValue(job as never);
    mockResetJobForRetry.mockResolvedValue(retried as never);

    await retryJob(pool, 'tenant-1', job.id);
    expect(mockResetJobForRetry).toHaveBeenCalled();
  });
});
