/**
 * M10 — POST /api/v1/internal/whatsapp/media
 *
 * Holt eine Datei aus WhatsApp und speichert sie nach MinIO. Logik exakt
 * nach M10 §7.3 / §8.1.
 *
 * Body:
 *   { "media_id": "1234567890987654", "customer_id": "cust_a3f4b2" }
 *
 * Response 200:
 *   {
 *     ok:true,
 *     data:{ object_key, sha256, mime_type, size_bytes, is_duplicate }
 *   }
 *
 * Spec-Referenz: M10 §7.3, §8.1
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';
import { logger } from '../../../core/logger';
import { publishEvent } from '../../../core/events/publisher';
import { STREAMS } from '../../../core/events/types';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { mediaInputSchema } from '../schemas/media.input';
import {
  CredentialNotFoundError,
} from '../services/credential.service';
import {
  defaultMetaGraphClient,
  MetaGraphError,
  type MetaGraphClient,
} from '../services/meta-graph.client';
import { downloadMedia } from '../services/media-downloader';
import { writeAudit } from '../services/audit.service';

export interface MediaHandlerDeps {
  metaClient?: MetaGraphClient;
  s3?:         S3Client;
}

declare module 'fastify' {
  interface FastifyInstance {
    s3?: S3Client;
  }
}

export function buildMediaHandler(deps: MediaHandlerDeps = {}) {
  return async function mediaHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = mediaInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { media_id, customer_id, trace_id } = parsed.data;

    const s3 = deps.s3 ?? req.server.s3;
    if (!s3) {
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'S3-Client nicht initialisiert.'));
    }

    const db: Pool = req.server.db;
    const metaClient = deps.metaClient ?? defaultMetaGraphClient;

    try {
      const result = await downloadMedia(
        { db, s3, metaClient },
        customer_id,
        media_id,
      );

      // Audit-Log: 'received' wenn neu, 'duplicate' wenn idempotent
      void writeAudit(db, {
        customerId: customer_id,
        eventType:  result.is_duplicate ? 'whatsapp.media.duplicate' : 'whatsapp.media.received',
        payload: {
          media_id,
          object_key:   result.object_key,
          sha256:       result.sha256,
          mime_type:    result.mime_type,
          size_bytes:   result.size_bytes,
          is_duplicate: result.is_duplicate,
        },
        traceId: trace_id,
      });

      // Event auf pp:events:receipt — best-effort.
      // Spec §10: pp.receipt.received wird vom WF-MASTER-RECEIPT emittiert,
      // sobald das Receipt tatsächlich angelegt ist. Hier emittieren wir ein
      // Sub-Event 'pp.receipt.media_persisted' (Audit-/Tracing-Zweck).
      void publishEvent(req.server.redis, STREAMS.documents, {
        type:        'pp.receipt.media_persisted',
        customer_id,
        timestamp:   new Date().toISOString(),
        payload: JSON.stringify({
          media_id,
          object_key:   result.object_key,
          sha256:       result.sha256,
          is_duplicate: result.is_duplicate,
          trace_id,
        }),
      });

      return reply.send(apiOk(result));
    } catch (err) {
      if (err instanceof CredentialNotFoundError) {
        logger.warn({ customer_id }, 'wa_access_token fehlt');
        return reply.code(404).send(
          apiError('CREDENTIAL_NOT_FOUND', 'Kein WhatsApp-Access-Token für diesen Kunden.'),
        );
      }
      if (err instanceof MetaGraphError) {
        const code = err.status >= 500 ? 'EXTERNAL_API_FAILED' : 'EXTERNAL_API_4XX';
        const status = err.status >= 500 ? 502 : 502; // wir mappen 4xx auch auf 502 (kein Retry-Hint)
        logger.warn({ status: err.status, body: err.body }, 'Meta-Graph-Fehler bei Media-Download');
        return reply.code(status).send(apiError(code, err.message));
      }
      throw err;
    }
  };
}
