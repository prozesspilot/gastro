/**
 * M03 — OCR-Routen
 *
 * Endpoints:
 *   POST /api/v1/receipts/:id/ocr
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { rateLimit } from '../../core/rate-limit/rate-limit.middleware';
import { createS3Client } from '../../core/storage/storage.service';
import { buildOcrHandler } from './ocr.handler';

export interface M03OcrRoutesDeps {
  s3?: S3Client;
}

export async function m03OcrRoutes(
  app: FastifyInstance,
  deps: M03OcrRoutesDeps = {},
): Promise<void> {
  app.addHook('preHandler', tenantContextHook);
  if (!app.s3) {
    app.decorate('s3', deps.s3 ?? createS3Client());
  }
  app.post<{ Params: { id: string } }>(
    '/:id/ocr',
    { preHandler: rateLimit('receipts_ocr') },
    buildOcrHandler({ s3: deps.s3 }),
  );
}
