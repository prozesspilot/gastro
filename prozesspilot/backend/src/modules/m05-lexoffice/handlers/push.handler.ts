/**
 * M05 — POST /api/v1/receipts/:receipt_id/exports/lexoffice
 *
 * Logik exakt nach M05-Spec §7.1:
 *   1) Receipt laden (assertStatus ['archived','categorized'])
 *   2) Idempotenz: schon gepusht?
 *   3) LexofficeClient für Customer initialisieren
 *   4) Voucher bauen (voucher.builder)
 *   5) Hook before_export.lexoffice → Voucher kann angepasst werden
 *   6) Kontaktauflösung (contact-resolver)
 *   7) Category-Mapping (category.mapper)
 *   8) Voucher createVoucher
 *   9) Anhang (attachment-picker) → uploadVoucherFile
 *  10) Receipt patchen (status='exported', exports[+])
 *  11) Hook after_export.lexoffice
 *  12) Persist + Audit + Event
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';
import type Redis from 'ioredis';

import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { config } from '../../../core/config';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

import {
  createLexofficeClientForCustomer,
  LexofficeNotConfiguredError,
  LexofficeApiError,
  LexofficeClient,
} from '../../../core/adapters/booking/lexoffice/lexoffice.client';
import { CategoryMapper } from '../../../core/adapters/booking/lexoffice/category.mapper';
import { buildLexofficeVoucher } from '../../../core/adapters/booking/lexoffice/voucher.builder';

import * as receiptRepo from '../../_shared/receipts/receipt.repository';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

import { pushInputSchema } from '../schemas/push.input';
import { resolveContact } from '../services/contact-resolver';
import { pickAttachmentBytes } from '../services/attachment-picker';
import { writeAudit } from '../services/audit.service';
import { emitLexofficeEvent } from '../services/event-emitter';

const ACCEPTED_INPUT_STATUSES = new Set<string>(['archived', 'categorized']);

export interface PushHandlerDeps {
  /** Test-Hook: voll fertige LexofficeClient-Instanz; sonst wird sie aus customer_credentials geladen. */
  lexofficeClient?: LexofficeClient;
  /** Test-Hook für fetch (z. B. wenn lexofficeClient via Factory gebaut wird). */
  fetchImpl?: typeof fetch;
}

export function buildPushHandler(deps: PushHandlerDeps = {}) {
  return async function pushHandler(
    req: FastifyRequest<{ Params: { receipt_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = pushInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_profile, trace_id } = parsed.data;
    const { receipt_id } = req.params;
    const customerId = customer_profile.customer_id;

    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;
    const s3 = req.server.s3 as S3Client | undefined;
    if (!s3) {
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'S3-Client nicht initialisiert.'));
    }

    let receipt = await receiptRepo.findById(db, receipt_id, customerId);
    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Kein Receipt ${receipt_id} für Customer ${customerId}.`));
    }
    if (!ACCEPTED_INPUT_STATUSES.has(receipt.status)) {
      return reply
        .code(422)
        .send(apiError('INVALID_STATUS', `Receipt-Status '${receipt.status}' nicht akzeptiert für /exports/lexoffice.`, {
          status: receipt.status,
          accepted: Array.from(ACCEPTED_INPUT_STATUSES),
        }));
    }

    // 2) Idempotenz: schon gepusht?
    const existingExport = (receipt.exports ?? []).find(
      (e: unknown) => {
        const x = e as { target?: string; status?: string };
        return x.target === 'lexoffice' && x.status === 'pushed';
      },
    );
    if (existingExport) {
      return reply.send(apiOk({
        receipt,
        receipt_patch: { status: receipt.status, exports: receipt.exports },
        already_pushed: true,
      }));
    }

    try {
      // 3) Client
      let client: LexofficeClient;
      if (deps.lexofficeClient) {
        client = deps.lexofficeClient;
      } else {
        client = await createLexofficeClientForCustomer(customerId, {
          pool: db,
          redis,
          pgcryptoKey: config.PP_PGCRYPTO_KEY,
          fetchImpl: deps.fetchImpl,
        });
      }

      // 4) Kategorien-Mapping
      const cat = (receipt.categorization as { skr_account?: string } | undefined) ?? {};
      const skrAccount = cat.skr_account ?? '';
      if (!skrAccount) {
        return reply.code(422).send(
          apiError('VALIDATION_FAILED', 'Receipt hat kein SKR-Konto — Kategorisierung muss vor Lexoffice-Push laufen.', { receipt_id }),
        );
      }
      const mapper = new CategoryMapper({ pool: db, client });
      const lexofficeCategoryId = await mapper.mapSkrToLexoffice(skrAccount, customerId);

      // 5) Kontaktauflösung
      const fields = (receipt.extraction as { fields?: Record<string, unknown> } | undefined)?.fields ?? {};
      const supplierName = typeof fields.supplier_name === 'string' ? (fields.supplier_name as string) : '';
      const supplierVatId = typeof fields.supplier_vat_id === 'string' ? (fields.supplier_vat_id as string) : null;
      const lexofficeIntegration =
        (customer_profile.integrations as Record<string, unknown> | undefined)?.lexoffice as
          | { auto_create_contacts?: boolean }
          | undefined;
      const autoCreate = Boolean(lexofficeIntegration?.auto_create_contacts);
      const contact = await resolveContact({
        client,
        supplierName,
        supplierVatId,
        autoCreate,
      });

      // 6) Voucher bauen
      let voucher = buildLexofficeVoucher({
        receipt,
        lexofficeCategoryId,
        contactId: contact.contactId,
      });

      // 7) Hook before_export.lexoffice → kann Voucher anpassen
      const hookedReceipt = await hookRunner.run('before_export.lexoffice', {
        receipt,
        profile: customer_profile as { customer_id?: string; [k: string]: unknown },
        extra: { voucher },
      });
      // Hooks dürfen nur Receipt zurückgeben (nicht Voucher direkt). Falls
      // ein Hook das memo via receipt.meta.lexoffice_voucher_memo geschrieben
      // hat, wenden wir das hier an.
      const memoOverride = (hookedReceipt.meta as { lexoffice_voucher_memo?: string } | undefined)
        ?.lexoffice_voucher_memo;
      if (memoOverride) {
        voucher = { ...voucher, memo: memoOverride };
      }
      receipt = hookedReceipt;

      // 8) Voucher pushen
      const created = await client.createVoucher(voucher);

      // 9) Anhang
      try {
        const attachment = await pickAttachmentBytes({ receipt, s3 });
        await client.uploadVoucherFile(
          created.id,
          attachment.bytes,
          attachment.filename,
          attachment.contentType,
        );
      } catch (err) {
        // M05 §10: Anhang-Fehler bricht den Voucher nicht
        logger.warn({ err, voucher_id: created.id }, 'Lexoffice-Anhang fehlgeschlagen — Voucher steht');
      }

      // 10) Receipt patchen
      const exportEntry = {
        target: 'lexoffice' as const,
        status: 'pushed' as const,
        external_id: created.id,
        external_url: `https://app.lexoffice.de/vouchers/${created.id}`,
        pushed_at: new Date().toISOString(),
      };
      const otherExports = (receipt.exports ?? []).filter(
        (e: unknown) => (e as { target?: string }).target !== 'lexoffice',
      );
      const auditEvents = [
        ...asAuditEvents((receipt.audit as { events?: unknown } | undefined)?.events),
        { at: new Date().toISOString(), type: 'exported.lexoffice', actor: 'system' },
      ];
      const patched: Receipt = {
        ...receipt,
        status: 'exported',
        exports: [...otherExports, exportEntry],
        audit: { events: auditEvents },
      };

      // 11) Hook after_export.lexoffice
      const afterReceipt = await hookRunner.run('after_export.lexoffice', {
        receipt: patched,
        profile: customer_profile as { customer_id?: string; [k: string]: unknown },
        extra: { result: created },
      });

      // 12) Persist + Audit + Event
      const saved = await receiptRepo.update(db, afterReceipt);

      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: 'pp.receipt.exported.lexoffice',
        payload: { external_id: created.id, contact_id: contact.contactId, lexoffice_category_id: lexofficeCategoryId },
        traceId: trace_id,
      });
      void emitLexofficeEvent(redis, 'pp.receipt.exported', {
        receipt_id: saved.receipt_id,
        customer_id: saved.customer_id,
        status: saved.status,
        target: 'lexoffice',
        external_id: created.id,
        external_url: exportEntry.external_url,
        trace_id,
      });

      return reply.send(apiOk({
        receipt: saved,
        receipt_patch: { status: saved.status, exports: saved.exports },
        events_to_emit: ['pp.receipt.exported'],
        module: 'M05',
      }));
    } catch (err) {
      logger.error({ err, receipt_id, customerId }, 'M05 push fehlgeschlagen');
      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: 'pp.receipt.export_failed',
        payload: { error: (err as Error).message, target: 'lexoffice' },
        traceId: trace_id,
      });
      void emitLexofficeEvent(redis, 'pp.receipt.export_failed', {
        receipt_id,
        customer_id: customerId,
        status: 'error',
        target: 'lexoffice',
        error: (err as Error).message,
        trace_id,
      });

      if (err instanceof LexofficeNotConfiguredError) {
        return reply.code(412).send(apiError('LEXOFFICE_NOT_CONFIGURED', err.message));
      }
      if (err instanceof LexofficeApiError) {
        return reply.code(502).send(apiError('EXTERNAL_API_FAILED', err.message, {
          status: err.status, body: err.body,
        }));
      }
      return reply.code(502).send(apiError('EXTERNAL_API_FAILED', 'Lexoffice-Push fehlgeschlagen.', {
        message: (err as Error).message,
      }));
    }
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    s3?: S3Client;
  }
}

function asAuditEvents(v: unknown): { at: string; type: string; actor: string }[] {
  return Array.isArray(v) ? (v as { at: string; type: string; actor: string }[]) : [];
}
