/**
 * D9 — Routing-Routes
 *
 * Fastify-Plugin für /api/v1/routing/jobs.
 *
 * Endpunkte:
 *   GET  /jobs           — Paginierte Job-Liste (optional: ?status=queued|…)
 *   GET  /jobs/:id       — Einzelnen Job laden
 *   POST /jobs/:id/retry — Job neu einreihen (nur bei status failed|dead)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { apiError, apiOk } from '../../core/schemas/common';
import {
  type JobStatus,
  findJobById,
  listJobs,
} from './routing.repository';
import { retryJob } from './routing.service';

// ── Zod-Schemas ───────────────────────────────────────────────────────────────

const jobStatusValues: [JobStatus, ...JobStatus[]] = ['queued', 'running', 'done', 'failed', 'dead'];

const listJobsQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(jobStatusValues).optional(),
});

const jobIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ── Plugin ────────────────────────────────────────────────────────────────────

export async function routingRoutes(app: FastifyInstance): Promise<void> {

  // GET /routing/jobs
  app.get('/jobs', async (req, reply) => {
    const tenantId = req.headers['x-pp-tenant-id'];
    if (!tenantId || typeof tenantId !== 'string') {
      return reply.code(400).send(
        apiError('MISSING_TENANT', 'x-pp-tenant-id fehlt'),
      );
    }

    const parsed = listJobsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(
        apiError('VALIDATION_ERROR', parsed.error.message),
      );
    }

    const result = await listJobs(app.db, tenantId, parsed.data);
    return reply.code(200).send({
      ok:         true,
      data:       result.data,
      pagination: result.pagination,
    });
  });

  // GET /routing/jobs/:id
  app.get('/jobs/:id', async (req, reply) => {
    const tenantId = req.headers['x-pp-tenant-id'];
    if (!tenantId || typeof tenantId !== 'string') {
      return reply.code(400).send(
        apiError('MISSING_TENANT', 'x-pp-tenant-id fehlt'),
      );
    }

    const parsed = jobIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(422).send(
        apiError('VALIDATION_ERROR', parsed.error.message),
      );
    }

    const job = await findJobById(app.db, tenantId, parsed.data.id);
    if (!job) {
      return reply.code(404).send(
        apiError('NOT_FOUND', 'Job nicht gefunden'),
      );
    }

    return reply.code(200).send(apiOk(job));
  });

  // POST /routing/jobs/:id/retry
  app.post('/jobs/:id/retry', async (req, reply) => {
    const tenantId = req.headers['x-pp-tenant-id'];
    if (!tenantId || typeof tenantId !== 'string') {
      return reply.code(400).send(
        apiError('MISSING_TENANT', 'x-pp-tenant-id fehlt'),
      );
    }

    const parsed = jobIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(422).send(
        apiError('VALIDATION_ERROR', parsed.error.message),
      );
    }

    const job = await retryJob(app.db, tenantId, parsed.data.id);
    if (!job) {
      return reply.code(409).send(
        apiError('CONFLICT', 'Job nicht gefunden oder nicht retry-fähig (nur failed|dead)'),
      );
    }

    return reply.code(200).send(apiOk(job));
  });
}
