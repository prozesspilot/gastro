/**
 * M10 — Fastify-Routen für `/api/v1/internal/whatsapp/*`
 *
 * Registrierung in app.ts (nach D3-HMAC-Middleware):
 *
 *   await app.register(m10WhatsAppRoutes, { prefix: '/api/v1/internal/whatsapp' });
 *
 * Alle Endpoints sind durch HMAC-Auth (D3) und im Test-Modus durch
 * PP_AUTH_DISABLED=1 geschützt.
 *
 * Endpoints:
 *   POST /verify           — Webhook-Signatur validieren (Meta X-Hub-Signature-256)
 *   POST /resolve          — phone_number_id+from → customer_id
 *   POST /media            — Medien-Download + MinIO-Upload (idempotent)
 *   POST /send-template    — WhatsApp-Template versenden
 *
 * Spec-Referenz: M10 §7, §8
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import { createS3Client } from '../../core/storage/storage.service';
import { buildMediaHandler } from './handlers/media.handler';
import { resolveHandler } from './handlers/resolve.handler';
import { buildSendTemplateHandler } from './handlers/send-template.handler';
import { verifyHandler } from './handlers/verify.handler';
import type { MetaGraphClient } from './services/meta-graph.client';

export interface M10RoutesDeps {
  /** Optional injectable Meta-Graph-Client (Tests). */
  metaClient?: MetaGraphClient;
  /** Optional injectable S3-Client (Tests). */
  s3?: S3Client;
}

export async function m10WhatsAppRoutes(
  app: FastifyInstance,
  deps: M10RoutesDeps = {},
): Promise<void> {
  // S3-Client an die App-Instanz hängen — falls nicht bereits durch ein anderes
  // Modul gesetzt. So können auch Tests einen Mock injizieren.
  if (!app.s3) {
    app.decorate('s3', deps.s3 ?? createS3Client());
  }

  app.post('/verify', verifyHandler);
  app.post('/resolve', resolveHandler);
  app.post('/media', buildMediaHandler({ metaClient: deps.metaClient, s3: deps.s3 }));
  app.post('/send-template', buildSendTemplateHandler({ metaClient: deps.metaClient }));
}
