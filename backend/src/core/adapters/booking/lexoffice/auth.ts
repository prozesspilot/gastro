/**
 * M05 — Lexoffice-Auth (API-Key-Modus, MVP).
 *
 * Lexoffice unterstützt OAuth2 + API-Keys. Wir nutzen API-Keys (einfacher),
 * verschlüsselt in customer_credentials (kind='lexoffice_api_key').
 */

import type { Pool } from 'pg';

export const LEXOFFICE_CREDENTIAL_KIND = 'lexoffice_api_key';

export class LexofficeNotConfiguredError extends Error {
  constructor(customerId: string) {
    super(`LEXOFFICE_NOT_CONFIGURED: kein API-Key für Customer ${customerId}`);
    this.name = 'LexofficeNotConfiguredError';
  }
}

export async function loadApiKey(
  pool: Pool,
  customerId: string,
  pgcryptoKey: string,
): Promise<string> {
  const { rows } = await pool.query<{ plaintext: string }>(
    `SELECT pgp_sym_decrypt(ciphertext, $1)::text AS plaintext
       FROM customer_credentials
      WHERE customer_id = $2 AND kind = $3
      ORDER BY rotated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [pgcryptoKey, customerId, LEXOFFICE_CREDENTIAL_KIND],
  );
  const plain = rows[0]?.plaintext;
  if (!plain) {
    throw new LexofficeNotConfiguredError(customerId);
  }
  return plain;
}
