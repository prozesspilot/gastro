/**
 * M02 — Fastify-Routen für `/api/v1/receipts/*` (Archive-Endpoint).
 *
 * Registrierung in app.ts:
 *   await apiApp.register(m02ArchiveRoutes, { prefix: '/receipts' });
 *
 * Endpoints:
 *   POST /:receipt_id/archive  — Beleg in Customer-Cloud (Drive/Dropbox) ablegen
 *
 * Spec-Referenz: M02 §6, §7
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import type { ArchiveStorageAdapterFactory } from '../../core/adapters/archive-storage/factory';
import { createArchiveStorageAdapterFactory } from '../../core/adapters/archive-storage/factory';
import { createS3Client } from '../../core/storage/storage.service';
import { buildArchiveHandler } from './handlers/archive.handler';

export interface M02RoutesDeps {
  s3?: S3Client;
  archiveStorageAdapterFactory?: ArchiveStorageAdapterFactory;
}

export async function m02ArchiveRoutes(
  app: FastifyInstance,
  deps: M02RoutesDeps = {},
): Promise<void> {
  if (!app.s3) {
    app.decorate('s3', deps.s3 ?? createS3Client());
  }
  if (!app.archiveStorageAdapterFactory) {
    const factory =
      deps.archiveStorageAdapterFactory ??
      createArchiveStorageAdapterFactory({ db: app.db, redis: app.redis });
    app.decorate('archiveStorageAdapterFactory', factory);
  }
  app.post(
    '/:receipt_id/archive',
    buildArchiveHandler({
      s3: deps.s3,
      archiveStorageAdapterFactory: deps.archiveStorageAdapterFactory,
    }),
  );
}
