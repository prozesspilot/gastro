/**
 * M05 — Integration-Test und Sync-Categories Handler
 *
 *   POST /api/v1/integrations/lexoffice/test
 *   POST /api/v1/integrations/lexoffice/sync-categories
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';

import {
  LexofficeApiError,
  LexofficeNotConfiguredError,
  createLexofficeClientForCustomer,
} from '../../../core/adapters/booking/lexoffice/lexoffice.client';
import { config } from '../../../core/config';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

const testBodySchema = z.object({
  customer_id: z.string(),
});

const syncBodySchema = z.object({
  customer_id: z.string(),
});

export function buildIntegrationTestHandler() {
  return async function integrationTestHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = testBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id } = parsed.data;
    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    try {
      const client = await createLexofficeClientForCustomer(customer_id, {
        pool: db,
        redis,
        pgcryptoKey: config.PP_PGCRYPTO_KEY,
      });
      // Verbindungstest: Kategorien laden
      const categories = await client.listCategories();
      return reply.send(
        apiOk({
          ok: true,
          customer_id,
          categories_count: categories.length,
          message: 'Lexoffice-Verbindung erfolgreich.',
        }),
      );
    } catch (err) {
      if (err instanceof LexofficeNotConfiguredError) {
        return reply.code(412).send(apiError('LEXOFFICE_NOT_CONFIGURED', err.message));
      }
      if (err instanceof LexofficeApiError) {
        return reply.code(502).send(
          apiError('EXTERNAL_API_FAILED', err.message, {
            status: err.status,
          }),
        );
      }
      return reply.code(500).send(apiError('INTERNAL_ERROR', (err as Error).message));
    }
  };
}

export function buildSyncCategoriesHandler() {
  return async function syncCategoriesHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = syncBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id } = parsed.data;
    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    try {
      const client = await createLexofficeClientForCustomer(customer_id, {
        pool: db,
        redis,
        pgcryptoKey: config.PP_PGCRYPTO_KEY,
      });
      const categories = await client.listCategories();

      // Upsert alle Kategorien für den Kunden (type-Filter entfernt —
      // Lexoffice gibt Typen auf Deutsch zurück, kein 'expense')
      let synced = 0;
      for (const cat of categories) {
        await db
          .query(
            `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, category_name, source)
           VALUES ($1, $2, $3, $4, 'synced')
           ON CONFLICT (customer_id, skr_account) DO NOTHING`,
            [customer_id, `lexoffice_${cat.id}`, cat.id, cat.name],
          )
          .catch(() => {
            /* best-effort */
          });
        synced++;
      }

      return reply.send(
        apiOk({
          ok: true,
          customer_id,
          synced_count: synced,
          total_categories: categories.length,
          message: `${synced} Lexoffice-Kategorien synchronisiert.`,
        }),
      );
    } catch (err) {
      if (err instanceof LexofficeNotConfiguredError) {
        return reply.code(412).send(apiError('LEXOFFICE_NOT_CONFIGURED', err.message));
      }
      if (err instanceof LexofficeApiError) {
        return reply.code(502).send(
          apiError('EXTERNAL_API_FAILED', err.message, {
            status: err.status,
          }),
        );
      }
      return reply.code(500).send(apiError('INTERNAL_ERROR', (err as Error).message));
    }
  };
}
