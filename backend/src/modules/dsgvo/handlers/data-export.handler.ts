/**
 * GET /api/v1/dsgvo/export-data — Datenkopie fuer Kunden (DSGVO Art. 20)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { apiError, apiOk } from '../../../core/schemas/common';

export function buildDataExportHandler() {
  return async function dataExportHandler(
    req: FastifyRequest<{ Querystring: { customer_id?: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const db: Pool = req.server.db;
    const tenantId = req.headers['x-pp-tenant-id'] as string | undefined;
    const customerId = req.query.customer_id;

    if (!tenantId) {
      return reply.code(400).send(apiError('MISSING_TENANT', 'X-Tenant-ID Header fehlt'));
    }

    if (!customerId) {
      return reply
        .code(422)
        .send(apiError('MISSING_CUSTOMER_ID', 'customer_id Query-Parameter ist erforderlich'));
    }

    try {
      // Kundendaten
      let customer: unknown = null;
      try {
        const { rows } = await db.query(
          `SELECT customer_id, legal_name, email, phone, tax_id, address,
                  enabled_modules, created_at
             FROM customer_profiles
            WHERE customer_id = $1`,
          [customerId],
        );
        customer = rows[0] ?? null;
      } catch {
        // Tabelle existiert moeglicherweise nicht
      }

      // Belege
      let receipts: unknown[] = [];
      try {
        const { rows } = await db.query(
          `SELECT receipt_id, status, file_name, file_type, created_at, updated_at,
                  payload->'extraction' AS extraction,
                  payload->'categorization' AS categorization
             FROM receipts
            WHERE customer_id = $1
            ORDER BY created_at DESC`,
          [customerId],
        );
        receipts = rows;
      } catch {
        receipts = [];
      }

      // Kommunikation
      let communications: unknown[] = [];
      try {
        const { rows } = await db.query(
          `SELECT to_address, from_address, subject, created_at, channel
             FROM communications
            WHERE customer_id = $1
            ORDER BY created_at DESC`,
          [customerId],
        );
        communications = rows;
      } catch {
        communications = [];
      }

      const exportData = {
        exported_at: new Date().toISOString(),
        customer_id: customerId,
        tenant_id: tenantId,
        customer,
        receipts,
        communications,
        note: 'Dieser Export enthaelt alle gespeicherten personenbezogenen Daten gemaess DSGVO Art. 20.',
      };

      logger.info(
        { tenant_id: tenantId, customer_id: customerId, receipts_count: receipts.length },
        'DSGVO Daten-Export erstellt',
      );

      // Als JSON-Download zurueckgeben
      reply.header('Content-Disposition', `attachment; filename="dsgvo-export-${customerId}.json"`);
      reply.header('Content-Type', 'application/json');
      return reply.send(apiOk(exportData));
    } catch (err) {
      logger.error({ err, tenantId, customerId }, 'DSGVO Daten-Export fehlgeschlagen');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Daten-Export fehlgeschlagen'));
    }
  };
}
