/**
 * M03 — POST /api/v1/receipts/:id/ocr
 *
 * Führt OCR (Google Vision) auf der hinterlegten Datei aus.
 * Falls GOOGLE_VISION_KEY_FILE leer ist, wird ein Mock-Ergebnis zurückgegeben.
 *
 * Ablauf:
 *  1) Receipt laden, prüfen, dass es zum Tenant gehört
 *  2) Status auf 'processing' setzen
 *  3) OCR ausführen (real oder mock)
 *  4) Ergebnis in metadata speichern: { ocr_text, ocr_confidence, ocr_at }
 *  5) Receipt zurückgeben
 */

import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../core/schemas/common';
import { getReceipt, updateReceiptStatus } from '../receipts/receipt.repository';
import type { ReceiptResponse, ReceiptRow } from '../receipts/receipt.schema';
import { ocrParamsSchema } from './ocr.schema';

export interface OcrHandlerDeps {
  s3?: S3Client;
}

async function downloadStorageObject(s3: S3Client, objectKey: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: config.MINIO_BUCKET,
      Key: objectKey,
    }),
  );
  const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new Error(`Storage-Download leer: ${objectKey}`);
  }
  const arr = await body.transformToByteArray();
  return Buffer.from(arr);
}

interface VisionLazyClient {
  documentTextDetection(req: unknown): Promise<unknown[]>;
}

let cachedVisionClient: VisionLazyClient | null = null;

async function getVisionClient(): Promise<VisionLazyClient> {
  if (cachedVisionClient) return cachedVisionClient;
  const mod = await import('@google-cloud/vision');
  const ctor = (
    mod as { ImageAnnotatorClient: new (opts: { keyFilename?: string }) => VisionLazyClient }
  ).ImageAnnotatorClient;
  cachedVisionClient = new ctor({ keyFilename: config.GOOGLE_VISION_KEY_FILE });
  return cachedVisionClient;
}

interface VisionResp {
  fullTextAnnotation?: {
    text?: string;
    pages?: Array<{ confidence?: number }>;
  };
}

async function runVisionOcr(bytes: Buffer): Promise<{ text: string; confidence: number }> {
  const client = await getVisionClient();
  const [response] = await client.documentTextDetection({
    image: { content: bytes },
  });
  const r = response as VisionResp;
  const text = r.fullTextAnnotation?.text ?? '';
  const pages = r.fullTextAnnotation?.pages ?? [];
  const confs = pages.map((p) => p.confidence).filter((c): c is number => typeof c === 'number');
  const confidence = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  return { text, confidence };
}

export function buildOcrHandler(deps: OcrHandlerDeps = {}) {
  return async function ocrHandler(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = ocrParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send(zodToApiError(parsed.error));
    }
    const receiptId = parsed.data.id;
    const db: Pool = req.server.db;
    const tenantId = req.tenantId!;

    // 1) Receipt laden
    const receipt = await getReceipt(db, tenantId, receiptId);
    if (!receipt) {
      return reply.code(404).send(apiError('NOT_FOUND', `Receipt ${receiptId} nicht gefunden.`));
    }

    // 2) Status auf 'processing'
    await updateReceiptStatus(db, tenantId, receiptId, 'processing');

    try {
      let ocrText = '';
      let ocrConfidence = 0;
      let mock = false;

      if (!config.GOOGLE_VISION_KEY_FILE) {
        ocrText = 'OCR nicht konfiguriert';
        ocrConfidence = 0;
        mock = true;
      } else {
        const s3 = deps.s3 ?? req.server.s3;
        if (!s3) {
          throw new Error('S3-Client nicht initialisiert');
        }
        if (!receipt.storage_key) {
          throw new Error(`Receipt ${receiptId} hat keinen storage_key`);
        }
        const bytes = await downloadStorageObject(s3, receipt.storage_key);
        const result = await runVisionOcr(bytes);
        ocrText = result.text;
        ocrConfidence = result.confidence;
      }

      const ocrAt = new Date().toISOString();
      const newMetadata = {
        ...(receipt.metadata ?? {}),
        ocr_text: ocrText,
        ocr_confidence: ocrConfidence,
        ocr_at: ocrAt,
      };

      const { rows } = await db.query<ReceiptRow>(
        `
        UPDATE receipts
        SET metadata = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING id, tenant_id, customer_id, status, original_name, mime_type,
                  storage_key, file_size_bytes, file_sha256, source, metadata,
                  error_message, created_at, updated_at
        `,
        [receiptId, tenantId, JSON.stringify(newMetadata)],
      );

      if (!rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Receipt ${receiptId} nicht gefunden.`));
      }

      const updated: ReceiptResponse = {
        id: rows[0].id,
        tenant_id: rows[0].tenant_id,
        customer_id: rows[0].customer_id,
        status: rows[0].status as ReceiptResponse['status'],
        original_name: rows[0].original_name,
        mime_type: rows[0].mime_type,
        storage_key: rows[0].storage_key,
        file_size_bytes: rows[0].file_size_bytes,
        file_sha256: rows[0].file_sha256,
        source: rows[0].source as ReceiptResponse['source'],
        metadata: rows[0].metadata,
        error_message: rows[0].error_message,
        created_at: rows[0].created_at.toISOString(),
        updated_at: rows[0].updated_at.toISOString(),
      };

      return reply.send(
        apiOk({
          receipt: updated,
          ocr_text: ocrText,
          ocr_confidence: ocrConfidence,
          ocr_at: ocrAt,
          mock,
        }),
      );
    } catch (err) {
      logger.error({ err, receiptId, tenantId }, 'M03 OCR fehlgeschlagen');
      await updateReceiptStatus(db, tenantId, receiptId, 'error', (err as Error).message);
      return reply.code(502).send(
        apiError('OCR_FAILED', 'OCR-Verarbeitung fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }
  };
}
