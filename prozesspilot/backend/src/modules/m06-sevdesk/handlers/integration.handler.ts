/**
 * M06 — Integration-Handlers
 *   POST /api/v1/integrations/sevdesk/test
 *   POST /api/v1/integrations/sevdesk/sync-accounts
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

import { SevDeskClient } from '../../../core/adapters/booking/sevdesk/sevdesk.client';
import { getApiToken, SevDeskNotConfiguredError } from '../../../core/adapters/booking/sevdesk/auth';
import { syncAccountingTypes } from '../../../core/adapters/booking/sevdesk/account-mapper';
import { syncTaxRules } from '../../../core/adapters/booking/sevdesk/tax-mapper';

const testInputSchema = z.object({
  customer_id: z.string().min(1),
});

const syncInputSchema = z.object({
  customer_id: z.string().min(1),
});

export function buildIntegrationTestHandler() {
  return async function integrationTestHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = testInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id } = parsed.data;
    const db: Pool = req.server.db;

    try {
      const token = await getApiToken(db, customer_id);
      const client = new SevDeskClient({ apiToken: token, customerId: customer_id });
      const result = await client.testConnection();

      return reply.send(
        apiOk({
          ok: result.ok,
          organization_name: result.organizationName,
          customer_id,
        }),
      );
    } catch (err) {
      if (err instanceof SevDeskNotConfiguredError) {
        return reply.code(412).send(apiError('SEVDESK_NOT_CONFIGURED', err.message));
      }
      logger.error({ err, customer_id }, 'M06 integration-test fehlgeschlagen');
      return reply.code(502).send(apiError('EXTERNAL_API_FAILED', 'sevDesk Verbindungstest fehlgeschlagen.', {
        message: (err as Error).message,
      }));
    }
  };
}

export function buildSyncAccountsHandler() {
  return async function syncAccountsHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = syncInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id } = parsed.data;
    const db: Pool = req.server.db;

    try {
      const token = await getApiToken(db, customer_id);
      const client = new SevDeskClient({ apiToken: token, customerId: customer_id });

      await Promise.all([
        syncAccountingTypes(db, client, customer_id),
        syncTaxRules(db, client, customer_id),
      ]);

      return reply.send(
        apiOk({
          ok: true,
          message: 'AccountingTypes und TaxRules synchronisiert.',
          customer_id,
        }),
      );
    } catch (err) {
      if (err instanceof SevDeskNotConfiguredError) {
        return reply.code(412).send(apiError('SEVDESK_NOT_CONFIGURED', err.message));
      }
      logger.error({ err, customer_id }, 'M06 sync-accounts fehlgeschlagen');
      return reply.code(502).send(apiError('EXTERNAL_API_FAILED', 'sevDesk Sync fehlgeschlagen.', {
        message: (err as Error).message,
      }));
    }
  };
}
