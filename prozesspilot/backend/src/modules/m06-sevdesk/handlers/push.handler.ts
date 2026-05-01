/**
 * M06 — POST /api/v1/receipts/:receiptId/exports/sevdesk
 *
 * Flow exakt nach M06-Spec:
 *  1) Receipt laden + Status prüfen
 *  2) Idempotenz: schon gepusht?
 *  3) sevDesk-Client initialisieren
 *  4) buildSevDeskVoucher() aufrufen
 *  5) Hook before_export.sevdesk
 *  6) saveVoucher()
 *  7) uploadTempFile() + attachFileToVoucher()
 *  8) Receipt.exports updaten, status = 'exported'
 *  9) Hook after_export.sevdesk
 * 10) In sevdesk_exports schreiben
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { config } from '../../../core/config';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

import { SevDeskClient, SevDeskApiError } from '../../../core/adapters/booking/sevdesk/sevdesk.client';
import { getApiToken, SevDeskNotConfiguredError } from '../../../core/adapters/booking/sevdesk/auth';
import { buildSevDeskVoucher } from '../../../core/adapters/booking/sevdesk/voucher.builder';
import { mapSkrToSevDeskAccountId } from '../../../core/adapters/booking/sevdesk/account-mapper';
import { mapTaxRuleId } from '../../../core/adapters/booking/sevdesk/tax-mapper';

import * as receiptRepo from '../../_shared/receipts/receipt.repository';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

import { pushInputSchema } from '../schemas/push.input';

const ACCEPTED_INPUT_STATUSES = new Set<string>(['archived', 'categorized']);

export interface PushHandlerDeps {
  /** Test-Hook: fertige SevDeskClient-Instanz */
  sevdeskClient?: SevDeskClient;
  /** Test-Hook für fetch */
  fetchImpl?: typeof fetch;
}

export function buildPushHandler(deps: PushHandlerDeps = {}) {
  return async function pushHandler(
    req: FastifyRequest<{ Params: { receiptId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = pushInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_profile, trace_id } = parsed.data;
    const { receiptId } = req.params;
    const customerId = customer_profile.customer_id;

    // Prüfen ob M06 aktiviert
    const modules = (customer_profile.modules_enabled as string[] | undefined) ?? [];
    if (!modules.includes('m06_sevdesk') && !modules.includes('M06')) {
      return reply.code(400).send(
        apiError('MODULE_NOT_ENABLED', 'M06 sevDesk ist für diesen Kunden nicht aktiviert.', {
          customer_id: customerId,
        }),
      );
    }

    const db: Pool = req.server.db;

    // 1) Receipt laden + Status prüfen
    let receipt = await receiptRepo.findById(db, receiptId, customerId);
    if (!receipt) {
      return reply
        .code(404)
        .send(apiError('NOT_FOUND', `Kein Receipt ${receiptId} für Customer ${customerId}.`));
    }
    if (!ACCEPTED_INPUT_STATUSES.has(receipt.status)) {
      return reply.code(422).send(
        apiError('INVALID_STATUS', `Receipt-Status '${receipt.status}' nicht akzeptiert für /exports/sevdesk.`, {
          status: receipt.status,
          accepted: Array.from(ACCEPTED_INPUT_STATUSES),
        }),
      );
    }

    // 2) Idempotenz: schon gepusht?
    const existingExport = (receipt.exports ?? []).find((e: unknown) => {
      const x = e as { target?: string; status?: string };
      return x.target === 'sevdesk' && x.status === 'pushed';
    });
    if (existingExport) {
      return reply.send(
        apiOk({
          receipt,
          receipt_patch: { status: receipt.status, exports: receipt.exports },
          already_pushed: true,
        }),
      );
    }

    try {
      // 3) Client initialisieren
      let client: SevDeskClient;
      if (deps.sevdeskClient) {
        client = deps.sevdeskClient;
      } else {
        const token = await getApiToken(db, customerId);
        client = new SevDeskClient({
          apiToken: token,
          customerId,
          fetchImpl: deps.fetchImpl,
        });
      }

      // SKR-Konto aus Kategorisierung
      const cat = (receipt.categorization as { skr_account?: string; skr03_konto?: string } | undefined) ?? {};
      const skrAccount = cat.skr_account ?? cat.skr03_konto ?? '';
      if (!skrAccount) {
        return reply.code(422).send(
          apiError('VALIDATION_FAILED', 'Receipt hat kein SKR-Konto — Kategorisierung muss vor sevDesk-Push laufen.', {
            receipt_id: receiptId,
          }),
        );
      }

      // Steuersatz ermitteln
      const fields = (
        (receipt.extraction as { fields?: Record<string, unknown> } | undefined)?.fields ?? {}
      ) as { tax_lines?: Array<{ rate: number; amount: number }> };

      const taxLines = fields.tax_lines ?? [];
      const dominantRate = taxLines.length > 0
        ? Math.round(
            [...taxLines].sort((a, b) => b.amount - a.amount)[0].rate *
              (taxLines[0].rate <= 1 ? 100 : 1),
          )
        : 19;

      // 4) Account + Tax Mapping auflösen
      const [accountingTypeId, taxRuleId] = await Promise.all([
        mapSkrToSevDeskAccountId(db, skrAccount, customerId),
        mapTaxRuleId(db, dominantRate, customerId),
      ]);

      // Voucher bauen
      let voucher = buildSevDeskVoucher({ receipt, accountingTypeId, taxRuleId });

      // 5) Hook before_export.sevdesk
      receipt = await hookRunner.run('before_export.sevdesk' as Parameters<typeof hookRunner.run>[0], {
        receipt,
        profile: customer_profile as { customer_id?: string; [k: string]: unknown },
        extra: { voucher },
      });

      // 6) Voucher pushen
      const saved = await client.saveVoucher(voucher);
      const voucherId = saved.objects.voucher.id;

      // 7) PDF hochladen + anhängen (optional — Fehler bricht Voucher nicht)
      try {
        const fileName = `${receiptId}.pdf`;
        // Dummy-PDF für MVP — in Produktion: Receipt-PDF aus Storage laden
        const dummyPdf = Buffer.from('PDF_PLACEHOLDER');
        const tempFile = await client.uploadTempFile(dummyPdf, fileName);
        await client.attachFileToVoucher(voucherId, tempFile.filename);
      } catch (attachErr) {
        logger.warn(
          { err: attachErr, voucher_id: voucherId },
          'sevDesk-Anhang fehlgeschlagen — Voucher steht',
        );
      }

      // 8) Receipt patchen
      const exportEntry = {
        target: 'sevdesk' as const,
        status: 'pushed' as const,
        external_id: String(voucherId),
        external_url: `https://my.sevdesk.de/#/fi/edit/type/VOU/id/${voucherId}`,
        pushed_at: new Date().toISOString(),
      };
      const otherExports = (receipt.exports ?? []).filter(
        (e: unknown) => (e as { target?: string }).target !== 'sevdesk',
      );
      const auditEvents = [
        ...asAuditEvents((receipt.audit as { events?: unknown } | undefined)?.events),
        { at: new Date().toISOString(), type: 'exported.sevdesk', actor: 'system' },
      ];
      const patchedReceipt: Receipt = {
        ...receipt,
        status: 'exported',
        exports: [...otherExports, exportEntry],
        audit: { events: auditEvents },
      };

      // 9) Hook after_export.sevdesk
      const afterReceipt = await hookRunner.run('after_export.sevdesk' as Parameters<typeof hookRunner.run>[0], {
        receipt: patchedReceipt,
        profile: customer_profile as { customer_id?: string; [k: string]: unknown },
        extra: { voucher_id: voucherId },
      });

      // Persist Receipt
      const finalReceipt = await receiptRepo.update(db, afterReceipt);

      // 10) sevdesk_exports schreiben (best-effort)
      void db
        .query(
          `INSERT INTO sevdesk_exports (receipt_id, customer_id, voucher_id, status)
           VALUES ($1, $2, $3, 'pushed')
           ON CONFLICT DO NOTHING`,
          [receiptId, customerId, String(voucherId)],
        )
        .catch((err) =>
          logger.warn({ err }, 'sevdesk_exports Insert fehlgeschlagen'),
        );

      // Audit-Log (best-effort)
      void db
        .query(
          `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)
           VALUES ($1, 'system', $2, $3, $4::jsonb)`,
          [
            receipt.customer_id,
            'pp.receipt.exported.sevdesk',
            receiptId,
            JSON.stringify({
              external_id: voucherId,
              skr_account: skrAccount,
              trace_id,
            }),
          ],
        )
        .catch(() => undefined);

      return reply.send(
        apiOk({
          receipt: finalReceipt,
          receipt_patch: {
            status: finalReceipt.status,
            exports: finalReceipt.exports,
          },
          events_to_emit: ['pp.receipt.exported'],
          module: 'M06',
        }),
      );
    } catch (err) {
      logger.error({ err, receiptId, customerId }, 'M06 sevDesk push fehlgeschlagen');

      if (err instanceof SevDeskNotConfiguredError) {
        return reply
          .code(412)
          .send(apiError('SEVDESK_NOT_CONFIGURED', err.message));
      }
      if (err instanceof SevDeskApiError) {
        return reply.code(502).send(
          apiError('EXTERNAL_API_FAILED', err.message, {
            status: err.status,
            body: err.body,
          }),
        );
      }
      return reply.code(502).send(
        apiError('EXTERNAL_API_FAILED', 'sevDesk-Push fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function asAuditEvents(
  v: unknown,
): { at: string; type: string; actor: string }[] {
  return Array.isArray(v) ? (v as { at: string; type: string; actor: string }[]) : [];
}

// Needed for config reference (unused directly but kept for type safety)
void config;
