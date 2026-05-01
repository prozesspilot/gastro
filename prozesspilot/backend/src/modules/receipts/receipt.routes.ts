/**
 * D5 — Receipt-Routen
 *
 * Endpunkte:
 *   GET    /api/v1/receipts           Receipts auflisten (paginiert)
 *   POST   /api/v1/receipts           Receipt anlegen
 *   GET    /api/v1/receipts/:id       Einzelnen Receipt laden
 *   PUT    /api/v1/receipts/:id/status   Receipt-Status aktualisieren
 *   GET    /api/v1/receipts/:id/upload-url  Upload-URL generieren
 *
 * Alle Routen erfordern den Header x-pp-tenant-id (UUID).
 */

import type { FastifyInstance } from 'fastify';
import * as audit from '../../core/audit/audit.service';
import { tenantContextHook } from '../../core/hooks/tenant-context';
import { rateLimit } from '../../core/rate-limit/rate-limit.middleware';
import { sseManager } from '../../core/sse/sse.manager';
import {
  apiError,
  apiOk,
  zodToApiError,
} from '../../core/schemas/common';
import {
  bulkStatusSchema,
  createReceiptSchema,
  listReceiptsQuerySchema,
  receiptParamsSchema,
  updateReceiptStatusSchema,
  uploadUrlResponseSchema,
} from './receipt.schema';
import {
  bulkUpdateStatus,
  createReceipt,
  DuplicateReceiptError,
  getReceipt,
  getReceiptStats,
  listReceipts,
  listReceiptsForExport,
  updateReceiptStatus,
} from './receipt.repository';

export async function receiptRoutes(app: FastifyInstance): Promise<void> {
  // Tenant-Kontext für alle Routen in diesem Plugin setzen
  app.addHook('preHandler', tenantContextHook);

  // ── GET /receipts/stats ────────────────────────────────────────────────
  // Muss VOR `/:id` registriert werden, damit Routing greift.

  app.get('/stats', async (req, reply) => {
    const stats = await getReceiptStats(app.db, req.tenantId);
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
      req.tenantId,
      parsed.data.ids,
      parsed.data.status,
    );
    for (const r of updated) {
      void audit.log(app.db, req.tenantId, 'receipt', r.id, 'status_changed', {
        new_status: parsed.data.status,
        bulk:       true,
      });
      sseManager.emit(req.tenantId, 'receipt:status', {
        id:         r.id,
        status:     r.status,
        updated_at: r.updated_at,
      });
    }
    return reply.send(apiOk({ updated, count: updated.length }));
  });

  // ── GET /receipts/export — CSV Export ──────────────────────────────────

  app.get('/export', async (req, reply) => {
    const data = await listReceiptsForExport(app.db, req.tenantId);
    const header = ['id', 'status', 'original_name', 'source', 'category', 'amount', 'currency', 'date', 'created_at'];
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [header.join(',')];
    for (const row of data) {
      lines.push([
        row.id,
        row.status,
        row.original_name,
        row.source,
        row.category,
        row.amount,
        row.currency,
        row.date,
        row.created_at,
      ].map(escape).join(','));
    }
    const csv = `${lines.join('\n')}\n`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="receipts-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv);
  });

  // ── GET /receipts ──────────────────────────────────────────────────────

  app.get('/', async (req, reply) => {
    const parsed = listReceiptsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }

    const { data, total } = await listReceipts(app.db, req.tenantId, parsed.data);

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
      `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND active = true`,
      [parsed.data.customer_id, req.tenantId],
    );
    if (customerCheck.rows.length === 0) {
      return reply.code(404).send(
        apiError(
          'CUSTOMER_NOT_FOUND',
          'Der angegebene Customer existiert nicht im aktuellen Tenant.',
        ),
      );
    }

    try {
      const receipt = await createReceipt(app.db, req.tenantId, parsed.data);
      sseManager.emit(req.tenantId, 'receipt:created', receipt);
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
        return reply.code(404).send(
          apiError(
            'CUSTOMER_NOT_FOUND',
            'Der angegebene Customer existiert nicht.',
          ),
        );
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

    const receipt = await getReceipt(app.db, req.tenantId, paramsParsed.data.id);

    if (!receipt) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`),
      );
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
      req.tenantId,
      paramsParsed.data.id,
      bodyParsed.data.status,
      bodyParsed.data.error_message,
    );

    if (!receipt) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`),
      );
    }

    void audit.log(app.db, req.tenantId, 'receipt', receipt.id, 'status_changed', {
      new_status:    bodyParsed.data.status,
      error_message: bodyParsed.data.error_message ?? null,
    });
    sseManager.emit(req.tenantId, 'receipt:status', {
      id:         receipt.id,
      status:     receipt.status,
      updated_at: receipt.updated_at,
    });

    return reply.send(apiOk(receipt));
  });

  // ── GET /receipts/:id/upload-url ───────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id/upload-url', async (req, reply) => {
    const paramsParsed = receiptParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send(zodToApiError(paramsParsed.error));
    }

    // Verify receipt exists
    const receipt = await getReceipt(app.db, req.tenantId, paramsParsed.data.id);

    if (!receipt) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Receipt ${paramsParsed.data.id} nicht gefunden.`),
      );
    }

    // TODO: Implementierung mit echtem MinIO/S3 Upload
    // Momentan nur Stub für API-Konsistenz.
    const uploadUrl = 'https://storage.example.com/upload/TODO';
    const key = `receipts/${req.tenantId}/${paramsParsed.data.id}`;

    const response = uploadUrlResponseSchema.parse({
      uploadUrl,
      key,
    });

    return reply.send(apiOk(response));
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
