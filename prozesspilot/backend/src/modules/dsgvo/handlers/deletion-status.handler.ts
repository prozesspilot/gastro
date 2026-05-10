/**
 * GET /api/v1/dsgvo/delete-request/:id — Status des Loeschantrags
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { apiError, apiOk } from '../../../core/schemas/common';

export function buildDeletionStatusHandler() {
  return async function deletionStatusHandler(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id } = req.params;
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    try {
      const { rows } = await db.query(
        `SELECT request_id, customer_id, tenant_id, requested_by, reason,
                status, processed_at, deleted_tables, error_message, created_at
           FROM deletion_requests
          WHERE request_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );

      if (rows.length === 0) {
        return reply.code(404).send(apiError('NOT_FOUND', `Loeschantrag ${id} nicht gefunden`));
      }

      return reply.send(apiOk(rows[0]));
    } catch (err) {
      logger.error({ err, id, tenantId }, 'Status-Abfrage fehlgeschlagen');
      return reply
        .code(500)
        .send(apiError('INTERNAL_ERROR', 'Status konnte nicht abgefragt werden'));
    }
  };
}

/**
 * POST /api/v1/dsgvo/delete-request/:id/execute — Loeschung ausfuehren (Admin-only)
 */
export function buildExecuteDeletionHandler() {
  return async function executeDeletionHandler(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id } = req.params;
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    // Status → 'processing'
    const { rows: requestRows } = await db.query<{
      request_id: string;
      customer_id: string | null;
      status: string;
    }>(
      `UPDATE deletion_requests
          SET status = 'processing'
        WHERE request_id = $1 AND tenant_id = $2 AND status = 'pending'
        RETURNING request_id, customer_id, status`,
      [id, tenantId],
    );

    if (requestRows.length === 0) {
      return reply
        .code(404)
        .send(
          apiError(
            'NOT_FOUND_OR_INVALID_STATUS',
            `Loeschantrag ${id} nicht gefunden oder hat unguelitigen Status (nur 'pending' kann ausgefuehrt werden)`,
          ),
        );
    }

    const customerId = requestRows[0]?.customer_id ?? null;
    const deletedTables: Record<string, number> = {};

    try {
      if (customerId) {
        // Einzelnen Kunden loeschen

        // 1. plugin_executions (ueber Plugins des Kunden)
        const pluginRes = await db.query(
          `DELETE FROM plugin_executions
            WHERE plugin_id IN (
              SELECT plugin_id FROM plugin_registry WHERE tenant_id = $1
            )`,
          [tenantId],
        );
        deletedTables.plugin_executions = pluginRes.rowCount ?? 0;

        // 2. communications
        try {
          const commRes = await db.query('DELETE FROM communications WHERE customer_id = $1', [
            customerId,
          ]);
          deletedTables.communications = commRes.rowCount ?? 0;
        } catch {
          // Tabelle existiert moeglicherweise nicht
          deletedTables.communications = 0;
        }

        // 3. bulk_approvals
        try {
          const bulkRes = await db.query(
            'DELETE FROM bulk_approvals WHERE customer_id = $1 OR tenant_id = $2',
            [customerId, tenantId],
          );
          deletedTables.bulk_approvals = bulkRes.rowCount ?? 0;
        } catch {
          deletedTables.bulk_approvals = 0;
        }

        // 4. receipt_files (nur DB-Eintraege, kein S3-Call in MVP)
        try {
          const rfRes = await db.query(
            `DELETE FROM receipt_files
              WHERE receipt_id IN (SELECT receipt_id FROM receipts WHERE customer_id = $1)`,
            [customerId],
          );
          deletedTables.receipt_files = rfRes.rowCount ?? 0;
        } catch {
          deletedTables.receipt_files = 0;
        }

        // 5. receipts
        const recRes = await db.query('DELETE FROM receipts WHERE customer_id = $1', [customerId]);
        deletedTables.receipts = recRes.rowCount ?? 0;

        // 6. customer_profiles
        try {
          const cpRes = await db.query('DELETE FROM customer_profiles WHERE customer_id = $1', [
            customerId,
          ]);
          deletedTables.customer_profiles = cpRes.rowCount ?? 0;
        } catch {
          deletedTables.customer_profiles = 0;
        }
      }

      // Status → 'completed'
      await db.query(
        `UPDATE deletion_requests
            SET status = 'completed',
                processed_at = now(),
                deleted_tables = $1::jsonb
          WHERE request_id = $2`,
        [JSON.stringify(deletedTables), id],
      );

      logger.info(
        {
          request_id: id,
          tenant_id: tenantId,
          customer_id: customerId,
          deleted_tables: deletedTables,
        },
        'DSGVO-Loeschung ausgefuehrt',
      );

      return reply.send(
        apiOk({
          request_id: id,
          status: 'completed',
          deleted_tables: deletedTables,
          processed_at: new Date().toISOString(),
        }),
      );
    } catch (err) {
      const errMsg = (err as Error).message;

      await db
        .query(
          `UPDATE deletion_requests
            SET status = 'failed', error_message = $1, processed_at = now()
          WHERE request_id = $2`,
          [errMsg, id],
        )
        .catch(() => undefined);

      logger.error({ err, request_id: id, tenantId }, 'DSGVO-Loeschung fehlgeschlagen');
      return reply
        .code(500)
        .send(apiError('DELETION_FAILED', 'Loeschung fehlgeschlagen', { message: errMsg }));
    }
  };
}
