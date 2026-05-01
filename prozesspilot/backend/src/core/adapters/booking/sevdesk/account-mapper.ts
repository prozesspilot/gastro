/**
 * sevDesk Account-Mapper.
 * Mappt SKR-Konten auf sevDesk AccountingType-IDs.
 */

import type { Pool } from 'pg';
import type { SevDeskClient } from './sevdesk.client';
import { logger } from '../../../logger';

const FALLBACK_ACCOUNTING_TYPE_ID = 0; // Sonstiges

/**
 * Gibt die sevDesk AccountingType-ID für ein SKR-Konto zurück.
 * Fallback: 0 (Sonstiges), wenn kein Mapping existiert.
 */
export async function mapSkrToSevDeskAccountId(
  pool: Pool,
  skrKonto: string,
  customerId: string,
): Promise<number> {
  // 1. Kundenspezifisches Mapping suchen
  const { rows } = await pool.query<{ sevdesk_account_id: number }>(
    `SELECT sevdesk_account_id
       FROM sevdesk_account_map
      WHERE customer_id = $1 AND skr_account = $2
      LIMIT 1`,
    [customerId, skrKonto],
  );

  if (rows[0]) return rows[0].sevdesk_account_id;

  // 2. Default-Mapping versuchen (customer_id = 'default')
  const { rows: defaultRows } = await pool.query<{ sevdesk_account_id: number }>(
    `SELECT sevdesk_account_id
       FROM sevdesk_account_map
      WHERE customer_id = 'default' AND skr_account = $1
      LIMIT 1`,
    [skrKonto],
  );

  if (defaultRows[0]) return defaultRows[0].sevdesk_account_id;

  logger.warn({ customerId, skrKonto }, 'sevDesk: kein AccountingType-Mapping gefunden, nutze Fallback 0');
  return FALLBACK_ACCOUNTING_TYPE_ID;
}

/**
 * Synchronisiert AccountingTypes von der sevDesk API in die lokale Mapping-Tabelle.
 * Wird einmalig pro Kunde beim ersten Push aufgerufen (oder manuell via /sync-accounts).
 */
export async function syncAccountingTypes(
  pool: Pool,
  client: SevDeskClient,
  customerId: string,
): Promise<void> {
  const types = await client.getAccountingTypes();
  logger.info({ customerId, count: types.length }, 'sevDesk AccountingTypes synchronisieren');

  for (const at of types) {
    const skrKonto = at.accountNumber ?? at.name ?? String(at.id);
    await pool.query(
      `INSERT INTO sevdesk_account_map (customer_id, skr_account, sevdesk_account_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, skr_account) DO UPDATE
         SET sevdesk_account_id = EXCLUDED.sevdesk_account_id`,
      [customerId, skrKonto, at.id],
    );
  }

  logger.info({ customerId, count: types.length }, 'sevDesk AccountingTypes synchronisiert');
}
