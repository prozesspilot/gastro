/**
 * M10 — Credential-Service (lokaler Wrapper)
 *
 * Liefert WhatsApp-Access-Token + Meta-Daten (z. B. graph_api_version)
 * aus customer_credentials. Klartext-Decryption via pgcrypto/pgp_sym_decrypt
 * mit dem Master-Key PP_PGCRYPTO_KEY.
 *
 * Hinweis: Sobald D5 (Sprint-0) den globalen `credentialService` exponiert,
 * sollte dieser Wrapper durch dessen `useCredential()`-Aufruf ersetzt werden.
 * Bis dahin kapseln wir die Logik hier — siehe M10-README.md "Decisions".
 *
 * Spec-Referenz:
 *   M10 §9.1 (Credential-Schema)
 *   02_Kundenprofil_System.md §2.1, §4.3
 *   Foundation_Spec.md §D5
 */

import type { Pool } from 'pg';
import { config } from '../../../core/config';

export interface WaCredential {
  credentialId: string;
  accessToken: string;
  phoneNumberId?: string;
  graphApiVersion: string;
}

export class CredentialNotFoundError extends Error {
  readonly code = 'CREDENTIAL_NOT_FOUND';
  constructor(public readonly customerId: string) {
    super(`Kein wa_access_token für customer_id=${customerId}.`);
    this.name = 'CredentialNotFoundError';
  }
}

/**
 * Lädt das WhatsApp-Access-Token (kind = 'wa_access_token') eines Kunden
 * und entschlüsselt es mit dem konfigurierten pgcrypto-Master-Key.
 */
export async function loadWaCredential(db: Pool, customerId: string): Promise<WaCredential> {
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error(
      'PP_PGCRYPTO_KEY ist nicht gesetzt — Credential kann nicht entschlüsselt werden.',
    );
  }

  const { rows } = await db.query<{
    credential_id: string;
    access_token: string;
    meta: { phone_number_id?: string; graph_api_version?: string } | null;
  }>(
    `SELECT credential_id,
            pgp_sym_decrypt(ciphertext, $2)::text AS access_token,
            meta
       FROM customer_credentials
      WHERE customer_id = $1
        AND kind = 'wa_access_token'
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY rotated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [customerId, config.PP_PGCRYPTO_KEY],
  );

  const row = rows[0];
  if (!row) throw new CredentialNotFoundError(customerId);

  return {
    credentialId: row.credential_id,
    accessToken: row.access_token,
    phoneNumberId: row.meta?.phone_number_id,
    graphApiVersion: row.meta?.graph_api_version ?? config.WHATSAPP_GRAPH_API_VERSION,
  };
}
