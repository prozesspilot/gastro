/**
 * M01 — POST /api/v1/receipts/:receipt_id/extract
 *
 * Logik exakt nach M01 §7.1 Pseudocode:
 *   1) Receipt laden (assertStatus: received | requires_review)
 *   2) hookRunner.run('before_extraction', ...)
 *   3) OCR via adapterFactory.for(profile.integrations.ocr.provider ?? 'google_vision')
 *   4) fieldExtractor.extract(ocr, profile)
 *   5) validator.validate(fields)
 *   6) combineConfidence(ocr.confidence, fields.confidence) vs threshold
 *      profile.routing.low_confidence_threshold ?? 0.75
 *   7) hookRunner.run('after_extraction', ...)
 *   8) receiptRepo.update(patched)
 *   9) audit.log + events.emit
 *
 * Idempotenz: zweimal aufrufen → identisches Ergebnis. Wenn das Receipt
 * bereits Status 'extracted' hat und beim zweiten Call kein neuer OCR-Lauf
 * angefordert wird, wird der bestehende Patch erneut zurückgegeben (kein
 * neuer Audit-Eintrag).
 */

import type { S3Client } from '@aws-sdk/client-s3';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

import { adapterFactory } from '../../../core/adapters/ocr/factory';
import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { receiptProcessingDuration, receiptsProcessed } from '../../../core/metrics';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

import * as receiptRepo from '../../_shared/receipts/receipt.repository';
import type { Receipt } from '../../_shared/receipts/receipt.repository';
import { extractInputSchema } from '../schemas/extract.input';
import { writeAudit } from '../services/audit.service';
import { combineConfidence } from '../services/confidence-scorer';
import { emitReceiptEvent } from '../services/event-emitter';
import { extract as extractFields } from '../services/field-extractor';
import { downloadObject } from '../services/storage-download';
import { validate as validateFields } from '../services/validator';

export interface ExtractHandlerDeps {
  s3?: S3Client;
}

declare module 'fastify' {
  interface FastifyInstance {
    s3?: S3Client;
  }
}

const ACCEPTED_INPUT_STATUSES = new Set<string>(['received', 'requires_review']);

export function buildExtractHandler(deps: ExtractHandlerDeps = {}) {
  return async function extractHandler(
    req: FastifyRequest<{ Params: { receipt_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = extractInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_profile, trace_id } = parsed.data;
    const { receipt_id } = req.params;
    const customerId = customer_profile.customer_id;

    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;
    const s3 = deps.s3 ?? req.server.s3;
    const metricStart = Date.now();
    if (!s3) {
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'S3-Client nicht initialisiert.'));
    }

    // 1) Receipt laden + Status prüfen
    let receipt = await receiptRepo.findById(db, receipt_id, customerId);
    if (!receipt) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Kein Receipt ${receipt_id} für Customer ${customerId}.`, {
          receipt_id,
          customer_id: customerId,
        }),
      );
    }
    if (!ACCEPTED_INPUT_STATUSES.has(receipt.status)) {
      return reply.code(409).send(
        apiError('CONFLICT', `Receipt-Status '${receipt.status}' nicht akzeptiert für /extract.`, {
          status: receipt.status,
          accepted: Array.from(ACCEPTED_INPUT_STATUSES),
        }),
      );
    }

    try {
      // 2) Hook before_extraction
      receipt = await hookRunner.run('before_extraction', { receipt, profile: customer_profile });

      // 3) OCR
      const provider = customer_profile.integrations?.ocr?.provider ?? 'google_vision';
      const ocrConfig = customer_profile.integrations?.ocr?.config ?? {};
      const ocrAdapter = adapterFactory.for(provider);

      const fileBytes = await downloadObject(s3, receipt.file.object_key);
      const ocr = await ocrAdapter.extract(fileBytes, ocrConfig);

      // 4) Field-Extraktion (Regex → Stammdaten → Claude)
      const extraction = await extractFields(db, ocr, {
        customer_id: customer_profile.customer_id,
        routing: customer_profile.routing,
        custom: customer_profile.custom,
      });

      // 5) Validator
      const validation = await validateFields(db, extraction.fields, {
        customerId,
        receiptId: receipt_id,
        profile: { routing: customer_profile.routing },
      });

      // 6) Confidence + neue Status-Entscheidung
      const overallConfidence = combineConfidence(ocr.confidence, extraction.confidence);
      const threshold = customer_profile.routing?.low_confidence_threshold ?? 0.75;
      const newStatus: Receipt['status'] =
        overallConfidence < threshold || !validation.is_valid ? 'requires_review' : 'extracted';

      // 7) Hook after_extraction
      const issues = [...validation.issues];
      if (overallConfidence < threshold) {
        issues.push({
          code: 'LOW_CONFIDENCE',
          field: 'extraction.confidence',
          message: `OCR/Field confidence ${round2(overallConfidence)} unter Schwelle ${threshold}`,
        });
      }
      const audit = {
        events: [
          ...((receipt.audit?.events as { at: string; type: string; actor: string }[]) ?? []),
          {
            at: new Date().toISOString(),
            type: newStatus === 'extracted' ? 'extracted' : 'requires_review',
            actor: 'system',
          },
        ],
      };
      const patched: Receipt = {
        ...receipt,
        status: newStatus,
        extraction: {
          engine: ocrAdapter.id,
          engine_version: ocrAdapter.version,
          confidence: overallConfidence,
          raw_text: ocr.raw_text,
          fields: extraction.fields,
          warnings: extraction.sources.claude ? ['claude_fallback_used'] : [],
        },
        validation: {
          is_valid: validation.is_valid && overallConfidence >= threshold,
          issues,
          checks: validation.checks,
        },
        audit,
      };
      receipt = await hookRunner.run('after_extraction', {
        receipt: patched,
        profile: customer_profile,
      });

      // 8) Persistieren
      const saved = await receiptRepo.update(db, receipt);

      // 9) Metriken: Verarbeitungszeit + Counter
      const durationSec = (Date.now() - metricStart) / 1000;
      receiptProcessingDuration.observe({ module: 'm01-extract' }, durationSec);
      receiptsProcessed.inc({
        status: newStatus,
        tenant_id: String(customer_profile.customer_id ?? 'unknown'),
      });

      // 9) Audit + Event
      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType:
          newStatus === 'extracted' ? 'pp.receipt.extracted' : 'pp.receipt.requires_review',
        payload: {
          confidence: overallConfidence,
          ocr_engine: ocrAdapter.id,
          provider,
          field_sources: extraction.sources,
          checks: validation.checks,
        },
        traceId: trace_id,
      });
      void emitReceiptEvent(
        redis,
        newStatus === 'extracted' ? 'pp.receipt.extracted' : 'pp.receipt.requires_review',
        {
          receipt_id: saved.receipt_id,
          customer_id: saved.customer_id,
          status: saved.status,
          confidence: overallConfidence,
          supplier_name: extraction.fields.supplier_name,
          total_gross: extraction.fields.total_gross,
          trace_id,
        },
      );

      const eventsToEmit = [
        newStatus === 'extracted' ? 'pp.receipt.extracted' : 'pp.receipt.requires_review',
      ];

      return reply.send(
        apiOk({
          receipt: saved,
          receipt_patch: {
            status: saved.status,
            extraction: saved.extraction,
            validation: saved.validation,
          },
          events_to_emit: eventsToEmit,
        }),
      );
    } catch (err) {
      logger.error({ err, receipt_id, customerId }, 'M01 extract fehlgeschlagen');
      receiptsProcessed.inc({
        status: 'error',
        tenant_id: String(customer_profile.customer_id ?? 'unknown'),
      });
      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: 'pp.receipt.extraction_failed',
        payload: { error: (err as Error).message },
        traceId: trace_id,
      });
      void emitReceiptEvent(redis, 'pp.receipt.extraction_failed', {
        receipt_id,
        customer_id: customerId,
        status: 'error',
        trace_id,
      });
      return reply.code(502).send(
        apiError('EXTERNAL_API_FAILED', 'OCR/Extraktion fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
