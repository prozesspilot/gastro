/**
 * sevDesk Tax-Mapper.
 * Mappt Steuersätze (in %) auf sevDesk TaxRule-IDs.
 */

import type { Pool } from 'pg';
import { logger } from '../../../logger';
import type { SevDeskClient } from './sevdesk.client';

// Standard-Fallback-TaxRule-IDs für sevDesk (übliche Werte — können abweichen)
const DEFAULT_TAX_RULE_IDS: Record<number, number> = {
  19: 1, // 19% Regelbesteuerung
  7: 2, // 7% ermäßigt
  0: 5, // 0% / steuerfrei
};

/**
 * Gibt die sevDesk TaxRule-ID für einen Steuersatz zurück.
 * Fallback: Standard-Mapping nach DEFAULT_TAX_RULE_IDS.
 */
export async function mapTaxRuleId(
  pool: Pool,
  taxRatePct: number,
  customerId: string,
): Promise<number> {
  // 1. Kundenspezifisches Mapping
  const { rows } = await pool.query<{ sevdesk_tax_rule_id: number }>(
    `SELECT sevdesk_tax_rule_id
       FROM sevdesk_tax_rule_map
      WHERE customer_id = $1 AND tax_rate_pct = $2
      LIMIT 1`,
    [customerId, taxRatePct],
  );

  if (rows[0]) return rows[0].sevdesk_tax_rule_id;

  // 2. Default-Mapping
  const { rows: defaultRows } = await pool.query<{ sevdesk_tax_rule_id: number }>(
    `SELECT sevdesk_tax_rule_id
       FROM sevdesk_tax_rule_map
      WHERE customer_id = 'default' AND tax_rate_pct = $1
      LIMIT 1`,
    [taxRatePct],
  );

  if (defaultRows[0]) return defaultRows[0].sevdesk_tax_rule_id;

  // 3. Hard-coded Fallback
  const fallback = DEFAULT_TAX_RULE_IDS[taxRatePct] ?? DEFAULT_TAX_RULE_IDS[19];
  logger.warn(
    { customerId, taxRatePct, fallback },
    'sevDesk: kein TaxRule-Mapping gefunden, nutze Fallback',
  );
  return fallback;
}

/**
 * Synchronisiert TaxRules von der sevDesk API in die lokale Mapping-Tabelle.
 */
export async function syncTaxRules(
  pool: Pool,
  client: SevDeskClient,
  customerId: string,
): Promise<void> {
  const rules = await client.getTaxRules();
  logger.info({ customerId, count: rules.length }, 'sevDesk TaxRules synchronisieren');

  for (const rule of rules) {
    await pool.query(
      `INSERT INTO sevdesk_tax_rule_map (customer_id, tax_rate_pct, sevdesk_tax_rule_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, tax_rate_pct) DO UPDATE
         SET sevdesk_tax_rule_id = EXCLUDED.sevdesk_tax_rule_id`,
      [customerId, rule.taxRate, rule.id],
    );
  }

  logger.info({ customerId, count: rules.length }, 'sevDesk TaxRules synchronisiert');
}
