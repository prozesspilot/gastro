/**
 * D8 — Document-Routen (Storage-Service)
 *
 * Endpunkte:
 *   POST   /api/v1/documents/upload       Dokument hochladen (raw binary)
 *   GET    /api/v1/documents              Dokumentenliste (paginiert)
 *   GET    /api/v1/documents/:id          Einzelnes Dokument
 *   GET    /api/v1/documents/:id/download-url  Presigned Download-URL
 *
 * Upload-Ablauf:
 *   1. Raw-Body → MinIO (storage_key = tenant/YYYY-MM/uuid.ext)
 *   2. Eintrag in document_inbox
 *   3. Event publizieren → n8n/Worker kann loslegen
 *
 * Unterstützte Content-Types:
 *   application/pdf, image/jpeg, image/png, image/tiff, application/octet-stream
 */

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { publishEvent } from '../../core/events/publisher';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { apiError, apiOk, apiOkPaged, buildPaginationMeta } from '../../core/schemas/common';
import {
  createS3Client,
  getPresignedDownloadUrl,
  uploadObject,
} from '../../core/storage/storage.service';
import { createDocument, findDocumentById, listDocuments } from './document.repository';

// ── Erlaubte Content-Types ────────────────────────────────────────────────────

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'application/octet-stream',
]);

// ── S3-Client (einmal pro Prozess) ───────────────────────────────────────────

const s3 = createS3Client();

// ── Hilfsfunktion: Storage-Key ────────────────────────────────────────────────

function buildStorageKey(tenantId: string, originalName: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = extname(originalName) || '.bin';
  const docId = randomUUID();
  return `${tenantId}/${yyyy}-${mm}/${docId}${ext}`;
}

// ── Route-Plugin ──────────────────────────────────────────────────────────────

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', tenantContextHook);

  // ── POST /documents/upload ───────────────────────────────────────────────

  app.post('/upload', async (req, reply) => {
    const contentType = (req.headers['content-type'] ?? 'application/octet-stream')
      .split(';')[0]
      .trim();

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return reply
        .code(415)
        .send(apiError('UNSUPPORTED_MEDIA_TYPE', `Content-Type '${contentType}' nicht erlaubt.`));
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      return reply.code(422).send(apiError('VALIDATION_ERROR', 'Request-Body ist leer.'));
    }

    const originalName = String(req.headers['x-original-filename'] ?? `upload-${Date.now()}.bin`);
    const storageKey = buildStorageKey(req.tenantId!, originalName);

    // ── MinIO-Upload ────────────────────────────────────────────────────────
    try {
      await uploadObject(s3, storageKey, rawBody, contentType);
    } catch (err) {
      app.log.error({ err }, 'MinIO-Upload fehlgeschlagen');
      return reply
        .code(502)
        .send(apiError('STORAGE_ERROR', 'Datei konnte nicht gespeichert werden.'));
    }

    // ── DB-Eintrag ──────────────────────────────────────────────────────────
    const document = await createDocument(app.db, req.tenantId!, {
      storage_key: storageKey,
      original_name: originalName,
      content_type: contentType,
      size_bytes: rawBody.length,
    });

    // ── Event (best-effort) ─────────────────────────────────────────────────
    void publishEvent(app.redis, 'pp:documents', {
      type: 'document.received',
      tenant_id: req.tenantId!,
      document_id: document.id,
      storage_key: storageKey,
      timestamp: new Date().toISOString(),
    });

    return reply.code(201).send(apiOk(document));
  });

  // ── GET /documents ────────────────────────────────────────────────────────

  app.get('/', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '20', 10)));

    const { data, pagination } = await listDocuments(app.db, req.tenantId!, {
      page,
      limit,
      status: query.status as never,
    });

    return reply.send(apiOkPaged(data, pagination));
  });

  // ── GET /documents/:id ────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const document = await findDocumentById(app.db, req.tenantId!, req.params.id);

    if (!document) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Dokument ${req.params.id} nicht gefunden.`));
    }

    return reply.send(apiOk(document));
  });

  // ── GET /documents/:id/download-url ──────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id/download-url', async (req, reply) => {
    const document = await findDocumentById(app.db, req.tenantId!, req.params.id);

    if (!document) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Dokument ${req.params.id} nicht gefunden.`));
    }

    const url = await getPresignedDownloadUrl(s3, document.storage_key);

    return reply.send(apiOk({ url, expires_in: 3600 }));
  });
}
