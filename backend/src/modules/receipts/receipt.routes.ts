/**
 * D5 — Receipt-Routen
 *
 * Endpunkte:
 *   GET    /api/v1/receipts                      Receipts auflisten (paginiert)
 *   POST   /api/v1/receipts                      Receipt anlegen
 *   GET    /api/v1/receipts/:id                  Einzelnen Receipt laden
 *   PUT    /api/v1/receipts/:id/status            Receipt-Status aktualisieren
 *   GET    /api/v1/receipts/:id/upload-url        Upload-URL generieren
 *   POST   /api/v1/receipts/:id/reprocess         Re-Processing starten (A1)
 *   GET    /api/v1/receipts/:id/download          Beleg-Datei herunterladen (A1)
 *
 * Alle Routen erfordern den Header x-pp-tenant-id (UUID).
 */

import type { FastifyInstance } from 'fastify';
import * as audit from '../../core/audit/audit.service';
import { requireTenantId } from '../../core/auth/m14-tenant-context';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { triggerReceiptPipeline } from '../../core/n8n/client';
import { rateLimit } from '../../core/rate-limit/rate-limit.middleware';
import { apiError, apiOk, zodToApiError } from '../../core/schemas/common';
import { sseManager } from '../../core/sse/sse.manager';
import { createS3Client, uploadObject } from '../../core/storage/storage.service';
import {
  DuplicateReceiptError,
  bulkUpdateStatus,
  createReceipt,
  getReceipt,
  getReceiptStats,
  listReceipts,
  listReceiptsForExport,
  updateReceiptStatus,
  updateReceiptStorageKey,
} from './receipt.repository';
import {
  bulkStatusSchema,
  createReceiptSchema,
  listReceiptsQuerySchema,
  receiptParamsSchema,
  updateReceiptStatusSchema,
  uploadUrlResponseSchema,
} from './receipt.schema';

export async function receiptRoutes(app: FastifyInstance): Promise<void> {
  // Tenant-Kontext für alle Routen in diesem Plugin setzen
  app.addHook('preHandler', tenantContextHook);

  // ── GET /receipts/stats ────────────────────────────────────────────────
  // Muss VOR `/:id` registriert werden, damit Routing greift.

  app.get('/stats', async (req, reply) => {
    const stats = await getReceiptStats(app.db, requireTenantId(req));
    return reply.send(apiOk(stats));
  });

  // ── PUT /receipts/bulk-status ──────────────────────────────────────────

  app.put('/bulk-status', async (req, reply) => {
    const parsed = bulkStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const updated = await bulkUpdateStatus(
      app.db,
      requireTenantId(req),
      parsed.data.ids,
      parsed.data.status,
    );
    for (const r of updated) {
      void audit.log(app.db, requireTenantId(req), 'receipt', r.id, 'status_changed', {
        new_status: parsed.data.status,
        bulk: true,
      });
      sseManager.emit(requireTenantId(req), 'receipt:status', {
        id: r.id,
        status: r.status,
        updated_at: r.updated_at,
      });
    }
    return reply.send(apiOk({ updated, count: updated.length }));
  });

  // ── GET /receipts/export — CSV Export ──────────────────────────────────

  app.get('/export', async (req, reply) => {
    const data = await listReceiptsForExport(app.db, requireTenantId(req));
    const header = [
      'id',
      'status',
      'original_name',
      'source',
      'category',
      'amount',
      'currency',
      'date',
      'created_at',
    ];
    const escapeCsv = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [header.join(',')];
    for (const row of data) {
      lines.push(
        [
          row.id,
          row.status,
          row.original_name,
          row.source,
          row.category,
          row.amount,
          row.currency,
          row.date,
          row.created_at,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }
    const csv = `${lines.join('\n')}\n`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="receipts-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      .send(csv);
  });

  // ── GET /receipts ──────────────────────────────────────────────────────

  app.get('/', async (req, reply) => {
    const parsed = listReceiptsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const { data, total } = await listReceipts(app.db, requireTenantId(req), parsed.data);

    return reply.send(
      apiOk({
        receipts: data,
        total,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      }),
    );
  });

  // ── POST /receipts ─────────────────────────────────────────────────────

  app.post('/', { preHandler: rateLimit('receipts_create') }, async (req, reply) => {
    const parsed = createReceiptSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    // Prüfen, ob Customer im aktuellen Tenant existiert
    const customerCheck = await app.db.query<{ id: string }>(
      'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND active = true',
      [parsed.data.customer_id, requireTenantId(req)],
    );
    if (customerCheck.rows.length === 0) {
      return reply
        .code(404)
        .send(
          apiError(
            'CUSTOMER_NOT_FOUND',
            'Der angegebene Customer existiert nicht im aktuellen Tenant.',
          ),
        );
    }

    try {
      const receipt = await createReceipt(app.db, requireTenantId(req), parsed.data);
      sseManager.emit(requireTenantId(req), 'receipt:created', receipt);
      return reply.code(201).send(apiOk(receipt));
    } catch (err: unknown) {
      if (err instanceof DuplicateReceiptError) {
        return reply.code(409).send({
          ok: false,
          error: {
            code: 'DUPLICATE_RECEIPT',
            message: 'Ein Receipt mit diesem SHA-256 existiert bereits für diesen Customer.',
            existing_id: err.existingId,
          },
        });
      }
      if (isNotFoundError(err)) {
        return reply
          .code(404)
          .send(apiError('CUSTOMER_NOT_FOUND', 'Der angegebene Customer existiert nicht.'));
      }
      throw err;
    }
  });

  // ── GET /receipts/:id ──────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const paramsParsed = receiptParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send(zodToApiError(paramsParsed.error));
    }

    const receipt = await getReceipt(app.db, requireTenantId(req), paramsParsed.data.id);

    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`));
    }

    return reply.send(apiOk(receipt));
  });

  // ── PUT /receipts/:id/status ───────────────────────────────────────────

  app.put<{ Params: { id: string } }>('/:id/status', async (req, reply) => {
    const paramsParsed = receiptParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send(zodToApiError(paramsParsed.error));
    }

    const bodyParsed = updateReceiptStatusSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.code(422).send(zodToApiError(bodyParsed.error));
    }

    const receipt = await updateReceiptStatus(
      app.db,
      requireTenantId(req),
      paramsParsed.data.id,
      bodyParsed.data.status,
      bodyParsed.data.error_message,
    );

    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`));
    }

    void audit.log(app.db, requireTenantId(req), 'receipt', receipt.id, 'status_changed', {
      new_status: bodyParsed.data.status,
      error_message: bodyParsed.data.error_message ?? null,
    });
    sseManager.emit(requireTenantId(req), 'receipt:status', {
      id: receipt.id,
      status: receipt.status,
      updated_at: receipt.updated_at,
    });

    return reply.send(apiOk(receipt));
  });

  // ── POST /receipts/:id/file ────────────────────────────────────────────
  // Lädt die eigentliche Beleg-Datei hoch (PDF, JPG, PNG, etc.).
  // Body: roher Datei-Inhalt als Buffer (Content-Type = MIME-Typ der Datei).
  // Nach erfolgreichem Upload: storage_key + file_size_bytes in DB gesetzt,
  // Status → 'received' (Pipeline kann starten).

  app.post<{ Params: { id: string } }>('/:id/file', async (req, reply) => {
    const paramsParsed = receiptParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send(zodToApiError(paramsParsed.error));
    }

    const receipt = await getReceipt(app.db, requireTenantId(req), paramsParsed.data.id);
    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`));
    }

    const fileBuffer = req.rawBody as Buffer | undefined;
    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.code(400).send(apiError('NO_FILE_BODY', 'Request-Body enthält keine Datei.'));
    }

    const contentType = (req.headers['content-type'] ?? 'application/octet-stream')
      .split(';')[0]
      .trim();

    // Storage-Key: tenantId/receiptId/original — eindeutig und nachvollziehbar
    const storageKey = `${requireTenantId(req)}/${paramsParsed.data.id}/original`;

    try {
      const s3 = createS3Client();
      await uploadObject(s3, storageKey, fileBuffer, contentType);
    } catch (err) {
      req.log.error({ err }, 'MinIO-Upload fehlgeschlagen');
      return reply
        .code(502)
        .send(apiError('STORAGE_ERROR', 'Datei konnte nicht in den Speicher hochgeladen werden.'));
    }

    // DB aktualisieren: storage_key + file_size
    await updateReceiptStorageKey(
      app.db,
      requireTenantId(req),
      paramsParsed.data.id,
      storageKey,
      fileBuffer.length,
    );

    // Status → 'received': signalisiert der Pipeline dass die Datei bereit ist
    const updated = await updateReceiptStatus(
      app.db,
      requireTenantId(req),
      paramsParsed.data.id,
      'received',
    );

    void audit.log(app.db, requireTenantId(req), 'receipt', paramsParsed.data.id, 'file_uploaded', {
      storage_key: storageKey,
      size_bytes: fileBuffer.length,
      content_type: contentType,
    });

    sseManager.emit(requireTenantId(req), 'receipt:status', {
      id: paramsParsed.data.id,
      status: 'received',
      storage_key: storageKey,
      updated_at: updated?.updated_at ?? new Date().toISOString(),
    });

    // n8n-Pipeline triggern — best-effort, kein await, blockiert nie die HTTP-Antwort
    void triggerReceiptPipeline({
      customer_id: receipt.customer_id,
      receipt_id: paramsParsed.data.id,
      tenant_id: requireTenantId(req),
      storage_key: storageKey,
      original_name: receipt.original_name ?? '',
      mime_type: contentType,
      size_bytes: fileBuffer.length,
      trace_id: `upload-${paramsParsed.data.id}`,
    });

    return reply.code(200).send(apiOk(updated ?? receipt));
  });

  // ── POST /receipts/:id/reprocess ──────────────────────────────────────────
  // A1: Re-Processing eines Belegs starten — setzt Status auf 'received' zurück
  // und emittiert ein SSE-Event, damit n8n/WF-MASTER den Beleg erneut verarbeitet.

  app.post<{ Params: { id: string } }>('/:id/reprocess', async (req, reply) => {
    const paramsParsed = receiptParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send(zodToApiError(paramsParsed.error));
    }

    const existing = await getReceipt(app.db, requireTenantId(req), paramsParsed.data.id);
    if (!existing) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`));
    }

    // DECISION: Reprocess setzt Status auf 'received' zurück (Anfang der Pipeline)
    // und löscht error_message. n8n-Trigger reagiert auf SSE-Event.
    const receipt = await updateReceiptStatus(
      app.db,
      requireTenantId(req),
      paramsParsed.data.id,
      'received',
      null,
    );

    void audit.log(app.db, requireTenantId(req), 'receipt', paramsParsed.data.id, 'reprocessed', {
      previous_status: existing.status,
    });

    sseManager.emit(requireTenantId(req), 'receipt:reprocess', {
      id: paramsParsed.data.id,
      status: 'received',
      updated_at: receipt?.updated_at ?? new Date().toISOString(),
    });

    // n8n-Pipeline erneut triggern — best-effort
    void triggerReceiptPipeline({
      customer_id: existing.customer_id,
      receipt_id: paramsParsed.data.id,
      tenant_id: requireTenantId(req),
      storage_key: existing.storage_key ?? '',
      original_name: existing.original_name ?? '',
      mime_type: existing.mime_type ?? 'application/octet-stream',
      size_bytes: existing.file_size_bytes ?? 0,
      trace_id: `reprocess-${paramsParsed.data.id}-${Date.now()}`,
    });

    return reply.send(apiOk(receipt ?? existing));
  });

  // ── GET /receipts/:id/download ─────────────────────────────────────────────
  // A1: Beleg-Datei herunterladen — liefert die Datei aus MinIO/S3.
  // Falls kein storage_key gesetzt, 404.

  app.get<{ Params: { id: string } }>('/:id/download', async (req, reply) => {
    const paramsParsed = receiptParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send(zodToApiError(paramsParsed.error));
    }

    const receipt = await getReceipt(app.db, requireTenantId(req), paramsParsed.data.id);
    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`));
    }

    if (!receipt.storage_key) {
      // DECISION: Kein storage_key = keine Datei im Objekt-Store — 404 statt 500,
      // weil das ein erwartbarer Zustand (Receipt ohne Upload) ist.
      return reply
        .code(404)
        .send(apiError('NO_FILE', 'Für diesen Beleg wurde noch keine Datei hochgeladen.'));
    }

    // Datei aus MinIO streamen über presigned URL oder direkten Proxy-Download.
    // DECISION: Direkter Proxy-Download via @aws-sdk/client-s3 für Dev;
    // in Produktion über MinIO-presigned-URL oder nginx X-Accel-Redirect.
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { config } = await import('../../core/config');
      const s3 = new S3Client({
        endpoint: config.MINIO_ENDPOINT,
        region: 'us-east-1',
        credentials: {
          accessKeyId: config.MINIO_ACCESS_KEY,
          secretAccessKey: config.MINIO_SECRET_KEY,
        },
        forcePathStyle: true,
      });

      const cmd = new GetObjectCommand({
        Bucket: config.MINIO_BUCKET,
        Key: receipt.storage_key,
      });
      const obj = await s3.send(cmd);
      const stream = obj.Body as
        | { pipe?: (dest: unknown) => void; transformToByteArray?: () => Promise<Uint8Array> }
        | undefined;
      if (!stream) {
        return reply.code(404).send(apiError('NO_FILE', 'Datei nicht gefunden im Storage.'));
      }

      const mimeType = receipt.mime_type ?? 'application/octet-stream';
      const filename = encodeURIComponent(receipt.original_name ?? `receipt-${receipt.id}`);
      reply.header('content-type', mimeType);
      reply.header('content-disposition', `attachment; filename="${filename}"`);

      const bytes = await stream.transformToByteArray?.();
      return reply.send(Buffer.from(bytes ?? new Uint8Array()));
    } catch (err: unknown) {
      // S3-NoSuchKey → 404, andere Fehler → 500 via default error handler
      const awsErr = err as { name?: string; Code?: string };
      if (awsErr.name === 'NoSuchKey' || awsErr.Code === 'NoSuchKey') {
        return reply.code(404).send(apiError('NO_FILE', 'Datei nicht im Storage gefunden.'));
      }
      throw err;
    }
  });
}

// ── Hilfsfunktion ──────────────────────────────────────────────────────────

/**
 * Prüft ob Fehler ein "nicht gefunden"-Fehler ist.
 * Z. B. Fremdschlüssel-Verletzung wenn Customer nicht existiert.
 */
function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    // 23503: FK-Verletzung
    (err as { code: string }).code === '23503'
  );
}
