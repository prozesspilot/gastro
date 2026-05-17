/**
 * M02 — POST /api/v1/receipts/:receipt_id/archive
 *
 * Logik exakt nach M02 §7.1 Pseudocode (alle 8 Schritte):
 *   1) Receipt laden (assertStatus: extracted | categorized)
 *   2) Hook before_archive
 *   3) Original aus MinIO laden, ggf. zu PDF konvertieren
 *   4) Kollisionscheck (Counter _001…_050)
 *   5) Upload via Archive-Storage-Adapter
 *   6) Receipt patchen (status=archived)
 *   7) Hook after_archive
 *   8) Persist + Audit + Event
 */

import { createHash } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

import {
  type ArchiveProviderId,
  type ArchiveStorageAdapter,
  type ArchiveStorageAdapterFactory,
  createArchiveStorageAdapterFactory,
} from '../../../core/adapters/archive-storage/factory';
import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { imageToPdf, isPdf } from '../../../core/pdf/image-to-pdf';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { renderFilename, renderPathTemplate } from '../../../core/templates/path-template';

import * as receiptRepo from '../../_shared/receipts/receipt.repository';
import type { Receipt } from '../../_shared/receipts/receipt.repository';
import { downloadObject } from '../../m01-receipt-intake/services/storage-download';
import { archiveInputSchema } from '../schemas/archive.input';
import { writeAudit } from '../services/audit.service';
import { MAX_COLLISION_COUNTER, appendCounter } from '../services/collision-resolver';
import { emitArchiveEvent } from '../services/event-emitter';

const ACCEPTED_INPUT_STATUSES = new Set<string>(['extracted', 'categorized']);

export interface ArchiveHandlerDeps {
  s3?: S3Client;
  /** Optional injizierbare Factory (Tests: gibt einen Mock-Adapter zurück). */
  archiveStorageAdapterFactory?: ArchiveStorageAdapterFactory;
}

declare module 'fastify' {
  interface FastifyInstance {
    archiveStorageAdapterFactory?: ArchiveStorageAdapterFactory;
  }
}

export function buildArchiveHandler(deps: ArchiveHandlerDeps = {}) {
  return async function archiveHandler(
    req: FastifyRequest<{ Params: { receipt_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = archiveInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_profile, trace_id } = parsed.data;
    const { receipt_id } = req.params;
    const customerId = customer_profile.customer_id;

    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;
    const s3 = deps.s3 ?? req.server.s3;
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
      // M02-Spec: Status-Mismatch → 422 INVALID_STATUS (Test 2 referenziert das).
      return reply.code(422).send(
        apiError(
          'INVALID_STATUS',
          `Receipt-Status '${receipt.status}' nicht akzeptiert für /archive.`,
          {
            status: receipt.status,
            accepted: Array.from(ACCEPTED_INPUT_STATUSES),
          },
        ),
      );
    }

    const archiveCfg = customer_profile.integrations.archive;
    const provider = archiveCfg.provider as ArchiveProviderId;

    try {
      const factory =
        deps.archiveStorageAdapterFactory ??
        req.server.archiveStorageAdapterFactory ??
        createArchiveStorageAdapterFactory({ db, redis });
      const adapter: ArchiveStorageAdapter = factory.for(provider);

      // 1a) Pfad + Filename rendern
      const targetDir = renderPathTemplate(archiveCfg.config.structure, receipt);
      const baseFilename = renderFilename(archiveCfg.config.filename_template, receipt);

      // 2) Hook before_archive
      receipt = await hookRunner.run('before_archive', {
        receipt,
        profile: customer_profile,
        extra: { target_path: targetDir, filename: baseFilename },
      });

      // 3) Datei holen (Original) → ggf. zu PDF konvertieren
      const fileMime = receipt.file.mime_type;
      const original = await downloadObject(s3, receipt.file.object_key);
      const pdfBytes = isPdf(fileMime) ? original : await imageToPdf(original, fileMime);

      // 4) Kollisionscheck (M02 §7.1 Schritt 4)
      let attempt = 0;
      let finalName = baseFilename;
      while (await adapter.exists(joinPath(targetDir, finalName), customerId)) {
        attempt += 1;
        if (attempt > MAX_COLLISION_COUNTER) {
          throw new Error('TOO_MANY_COLLISIONS');
        }
        finalName = appendCounter(baseFilename, attempt);
      }

      // 5) Upload
      const fullPath = joinPath(targetDir, finalName);
      const result = await adapter.upload({
        customerId,
        path: fullPath,
        bytes: pdfBytes,
        mime: 'application/pdf',
        metadata: {
          receipt_id: receipt.receipt_id,
          sha256: receipt.file.sha256,
          ...(documentDate(receipt) ? { document_date: documentDate(receipt)! } : {}),
        },
      });

      // 6) Receipt patchen
      const checksum = sha256Hex(pdfBytes);
      const storedAt = new Date().toISOString();
      const auditEvents = [
        ...asAuditEvents(receipt.audit?.events),
        { at: storedAt, type: 'archived', actor: 'system' },
      ];
      const patched: Receipt = {
        ...receipt,
        status: 'archived',
        archive: {
          status: 'stored',
          target: provider,
          path: result.path,
          external_id: result.external_id,
          stored_at: storedAt,
          checksum_sha256: checksum,
          ...(result.url ? { url: result.url } : {}),
          ...(attempt > 0 ? { collision_attempts: attempt } : {}),
        },
        audit: { events: auditEvents },
      };

      // 7) Hook after_archive
      receipt = await hookRunner.run('after_archive', {
        receipt: patched,
        profile: customer_profile,
      });

      // 8) Persist + Audit + Event
      const saved = await receiptRepo.update(db, receipt);

      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: 'pp.receipt.archived',
        payload: {
          target: provider,
          path: result.path,
          external_id: result.external_id,
          checksum_sha256: checksum,
          collision_attempts: attempt,
        },
        traceId: trace_id,
      });
      void emitArchiveEvent(redis, 'pp.receipt.archived', {
        receipt_id: saved.receipt_id,
        customer_id: saved.customer_id,
        status: saved.status,
        target: provider,
        path: result.path,
        external_id: result.external_id,
        trace_id,
      });

      return reply.send(
        apiOk({
          receipt: saved,
          receipt_patch: {
            status: saved.status,
            archive: saved.archive,
          },
          events_to_emit: ['pp.receipt.archived'],
        }),
      );
    } catch (err) {
      logger.error({ err, receipt_id, customerId, provider }, 'M02 archive fehlgeschlagen');
      const message = (err as Error).message ?? 'archive_failed';
      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: 'pp.receipt.archive_failed',
        payload: { error: message, provider },
        traceId: trace_id,
      });
      void emitArchiveEvent(redis, 'pp.receipt.archive_failed', {
        receipt_id,
        customer_id: customerId,
        status: 'error',
        target: provider,
        trace_id,
      });

      if (message === 'TOO_MANY_COLLISIONS') {
        return reply.code(409).send(
          apiError('TOO_MANY_COLLISIONS', 'Filename-Kollisionen > 50 — Pattern prüfen.', {
            max: MAX_COLLISION_COUNTER,
          }),
        );
      }
      return reply
        .code(502)
        .send(apiError('EXTERNAL_API_FAILED', 'Archivierung fehlgeschlagen.', { message }));
    }
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function joinPath(dir: string, filename: string): string {
  if (!dir) return filename;
  return dir.endsWith('/') ? `${dir}${filename}` : `${dir}/${filename}`;
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function documentDate(receipt: Receipt): string | undefined {
  const fields = (receipt.extraction as { fields?: { document_date?: string } } | undefined)
    ?.fields;
  return fields?.document_date;
}

function asAuditEvents(v: unknown): { at: string; type: string; actor: string }[] {
  return Array.isArray(v) ? (v as { at: string; type: string; actor: string }[]) : [];
}
