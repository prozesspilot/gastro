/**
 * M01 — Fastify-Routen für `/api/v1/receipts/*` (Extract-Endpoint).
 *
 * Registrierung in app.ts (nach D3-HMAC-Middleware):
 *   await apiApp.register(m01ReceiptIntakeRoutes, { prefix: '/receipts' });
 *
 * Endpoints:
 *   POST /:receipt_id/extract  — OCR + Field-Extraktion + Validierung
 *
 * Spec-Referenz: M01 §6, §7
 */

import type { FastifyInstance } from 'fastify';
import type { S3Client } from '@aws-sdk/client-s3';
import { createS3Client } from '../../core/storage/storage.service';
import { buildExtractHandler } from './handlers/extract.handler';

export interface M01RoutesDeps {
  /** Optional injectable S3-Client (Tests). */
  s3?: S3Client;
}

export async function m01ReceiptIntakeRoutes(
  app: FastifyInstance,
  deps: M01RoutesDeps = {},
): Promise<void> {
  if (!app.s3) {
    app.decorate('s3', deps.s3 ?? createS3Client());
  }
  app.post('/:receipt_id/extract', buildExtractHandler({ s3: deps.s3 }));
}
