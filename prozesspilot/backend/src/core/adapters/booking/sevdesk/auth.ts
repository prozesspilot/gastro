/**
 * sevDesk — Auth (API-Token, kind='sevdesk_api_token').
 * Token wird im Authorization-Header OHNE Bearer-Prefix gesendet.
 */

import type { Pool } from 'pg';

export const SEVDESK_CREDENTIAL_KIND = 'sevdesk_api_token';

export class SevDeskNotConfiguredError extends Error {
  constructor(customerId: string) {
    super(`SEVDESK_NOT_CONFIGURED: kein API-Token für Customer ${customerId}`);
    this.name = 'SevDeskNotConfiguredError';
  }
}

export async function getApiToken(pool: Pool, customerId: string): Promise<string> {
  const { rows } = await pool.query<{ encrypted_value: Buffer }>(
    `SELECT encrypted_value
       FROM customer_credentials
      WHERE customer_id = $1 AND kind = $2
      LIMIT 1`,
    [customerId, SEVDESK_CREDENTIAL_KIND],
  );

  const row = rows[0];
  if (!row) {
    throw new SevDeskNotConfiguredError(customerId);
  }

  // encrypted_value wird als Buffer gespeichert — wir lesen es als plaintext UTF-8 zurück.
  // Für Produktions-Nutzung: pgp_sym_decrypt analog zu Lexoffice.
  // Hier: direkte Speicherung als UTF-8 (MVP).
  return row.encrypted_value.toString('utf-8');
}

/**
 * Speichert einen API-Token für einen Kunden (Test-Helper).
 */
export async function storeApiToken(pool: Pool, customerId: string, token: string): Promise<void> {
  await pool.query(
    `INSERT INTO customer_credentials (customer_id, kind, encrypted_value)
     VALUES ($1, $2, $3::bytea)
     ON CONFLICT (customer_id, kind) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value`,
    [customerId, SEVDESK_CREDENTIAL_KIND, Buffer.from(token, 'utf-8')],
  );
}
