/**
 * M07 — POST /api/v1/receipts/:receipt_id/exports/spreadsheet
 *
 * Logik exakt nach M07 §7.1 Pseudocode:
 *   1) Receipt laden + assertStatus ['archived','categorized']
 *   2) Adapter über Factory wählen (provider aus profile.integrations.spreadsheet)
 *   3) Tab-Name rendern (Jahres-Rotation)
 *   4) ensureTabExists / ensureHeader
 *   5) Idempotenz: findRowByReceiptId → updateRow ODER appendRow
 *   6) receipt.exports patchen (filter + push)
 *   7) status := 'exported' (wenn nicht bereits gesetzt)
 *   8) audit.log + events.emit('pp.receipt.exported')
 *
 * Idempotenz: Zweimaliger Aufruf für dieselbe receipt_id schreibt KEINE
 * neue Zeile, sondern aktualisiert die bekannte (siehe Cache-Tabelle
 * spreadsheet_row_index). Receipt selbst wird ebenfalls patched.
 *
 * Fehler:
 *   404 NOT_FOUND       — Receipt unbekannt
 *   409 CONFLICT        — Status nicht in ['archived','categorized']
 *   422 VALIDATION      — Body-Schema fehlt/falsch
 *   502 EXTERNAL_FAILED — Sheets-API-Fehler
 *   422 HEADER_CONFLICT — Header in Sheet weicht ab (Operator-Alert)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

import {
  HeaderConflictError,
  type SpreadsheetProviderId,
  spreadsheetAdapterFactory,
} from '../../../core/adapters/spreadsheet/factory';
import { hookRunner } from '../../../core/hooks/hook-runner';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

import * as receiptRepo from '../../_shared/receipts/receipt.repository';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

import { type CustomerProfile, appendInputSchema } from '../schemas/append.input';
import { writeAudit } from '../services/audit.service';
import { COLUMNS } from '../services/columns';
import { emitExportEvent } from '../services/event-emitter';
import { type ExtraColumnDef, buildHeaders, buildRow } from '../services/row-builder';
import { DEFAULT_TAB_TEMPLATE, renderTabName } from '../services/tab-name-resolver';

const ACCEPTED_INPUT_STATUSES = new Set<string>(['archived', 'categorized']);

export interface AppendHandlerDeps {
  /** Test-Hook: Adapter-Factory injizierbar. */
  adapterFactory?: typeof spreadsheetAdapterFactory;
}

export function buildAppendHandler(deps: AppendHandlerDeps = {}) {
  const factory = deps.adapterFactory ?? spreadsheetAdapterFactory;

  return async function appendHandler(
    req: FastifyRequest<{ Params: { receipt_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = appendInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_profile, trace_id } = parsed.data;
    const { receipt_id } = req.params;
    const customerId = customer_profile.customer_id;

    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

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
        apiError(
          'CONFLICT',
          `Receipt-Status '${receipt.status}' nicht akzeptiert für /exports/spreadsheet.`,
          {
            status: receipt.status,
            accepted: Array.from(ACCEPTED_INPUT_STATUSES),
          },
        ),
      );
    }

    const cfg = customer_profile.integrations.spreadsheet;
    const provider: SpreadsheetProviderId = cfg.provider;
    const sheetId = cfg.config.sheet_id;
    const template = cfg.config.tab_name_template ?? cfg.config.tab_name ?? DEFAULT_TAB_TEMPLATE;

    try {
      // Hook before_export.spreadsheet (M07 vor §7) — derzeit no-op
      receipt = await hookRunner.run(
        'after_archive', // closest existing point; spreadsheet hook folgt mit Foundation-Update
        {
          receipt,
          profile: customer_profile as unknown as CustomerProfile & Record<string, unknown>,
        },
      );

      // 2) Adapter
      const adapter = factory.for(provider);
      const ctx = { db };

      // 3) Tab-Name (Jahres-Rotation)
      const tabName = renderTabName(template, receipt);

      // 4) Tab + Header sicherstellen
      await adapter.ensureTabExists(ctx, customerId, sheetId, tabName);

      const extraColumns: ExtraColumnDef[] =
        (customer_profile.custom?.spreadsheet_extra_columns as ExtraColumnDef[] | undefined) ?? [];
      const fullColumns = [...COLUMNS, ...buildHeaders(extraColumns).map((header) => ({ header }))];

      await adapter.ensureHeader(ctx, customerId, sheetId, tabName, fullColumns);

      // 5) Row bauen
      const row = buildRow(receipt, { extraColumns });

      // 6) Idempotenz: bekannte Zeile?
      const existingRow = await adapter.findRowByReceiptId(
        ctx,
        customerId,
        sheetId,
        tabName,
        receipt_id,
      );

      const result = existingRow
        ? await adapter.updateRow(
            ctx,
            customerId,
            sheetId,
            tabName,
            receipt_id,
            existingRow.row_index,
            row,
          )
        : await adapter.appendRow(ctx, customerId, sheetId, tabName, receipt_id, row);

      // 7) Receipt patchen
      const exportEntry = {
        target: provider,
        status: 'pushed' as const,
        external_id: `${sheetId}:${tabName}!A${result.row_index}`,
        external_url: result.url,
        pushed_at: new Date().toISOString(),
      };

      const otherExports = (receipt.exports ?? []).filter(
        (e: unknown): boolean => (e as { target?: string }).target !== provider,
      );

      const auditEvents =
        (receipt.audit as { events?: { at: string; type: string; actor: string }[] } | undefined)
          ?.events ?? [];

      const patched: Receipt = {
        ...receipt,
        status: receipt.status === 'exported' ? receipt.status : ('exported' as const),
        exports: [...otherExports, exportEntry],
        audit: {
          events: [
            ...auditEvents,
            { at: new Date().toISOString(), type: 'exported', actor: 'system' },
          ],
        },
      };

      const saved = await receiptRepo.update(db, patched);

      // 8) Audit + Event
      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: `exported.${provider}`,
        payload: {
          provider,
          sheet_id: sheetId,
          tab: tabName,
          row_index: result.row_index,
          url: result.url,
          mode: existingRow ? 'update' : 'append',
        },
        traceId: trace_id,
      });
      void emitExportEvent(redis, 'pp.receipt.exported', {
        receipt_id: saved.receipt_id,
        customer_id: saved.customer_id,
        status: saved.status,
        target: provider,
        external_id: exportEntry.external_id,
        external_url: exportEntry.external_url,
        trace_id,
      });

      return reply.send(
        apiOk({
          receipt: saved,
          receipt_patch: {
            status: saved.status,
            exports: saved.exports,
          },
          events_to_emit: ['pp.receipt.exported'],
          module: 'M07',
        }),
      );
    } catch (err) {
      if (err instanceof HeaderConflictError) {
        logger.warn({ err, receipt_id, customerId }, 'M07 Header-Konflikt — Operator-Alert');
        void writeAudit(db, {
          customerId,
          receiptId: receipt_id,
          eventType: 'export_failed.spreadsheet.header_conflict',
          payload: {
            sheet_id: err.sheetId,
            tab: err.tab,
            expected: err.expected,
            actual: err.actual,
          },
          traceId: trace_id,
        });
        void emitExportEvent(redis, 'pp.receipt.export_failed', {
          receipt_id,
          customer_id: customerId,
          status: 'error',
          target: provider,
          error: err.message,
          trace_id,
        });
        return reply.code(422).send(
          apiError('HEADER_CONFLICT', err.message, {
            sheet_id: err.sheetId,
            tab: err.tab,
            expected: err.expected,
            actual: err.actual,
          }),
        );
      }

      logger.error({ err, receipt_id, customerId }, 'M07 spreadsheet append fehlgeschlagen');
      void writeAudit(db, {
        customerId,
        receiptId: receipt_id,
        eventType: 'pp.receipt.export_failed',
        payload: { error: (err as Error).message, target: provider },
        traceId: trace_id,
      });
      void emitExportEvent(redis, 'pp.receipt.export_failed', {
        receipt_id,
        customer_id: customerId,
        status: 'error',
        target: provider,
        error: (err as Error).message,
        trace_id,
      });
      return reply.code(502).send(
        apiError('EXTERNAL_API_FAILED', 'Spreadsheet-Append fehlgeschlagen.', {
          message: (err as Error).message,
          target: provider,
        }),
      );
    }
  };
}
