/**
 * M02 — Drive-OAuth-Credential-Service
 *
 * Liest und persistiert die Google-Drive-OAuth-Tokens eines Customers in
 * `customer_credentials` (kind = 'drive_oauth'). Das Klartext-JSON
 * `{ access_token, refresh_token, expiry_ms }` wird mit pgcrypto
 * AES-256-GCM ver-/entschlüsselt (Master-Key: PP_PGCRYPTO_KEY).
 *
 * Token-Refresh: Beim 401-Pfad ruft der Adapter `saveDriveCredential` mit
 * dem neuen Access-Token + Expiry auf; der Refresh-Token bleibt erhalten.
 *
 * Sobald der zentrale credentialService aus D5 verfügbar ist, sollte dieser
 * Wrapper durch dessen `useCredential()`-Aufruf ersetzt werden.
 */

import type { Pool } from 'pg';
import { config } from '../../config';

export interface DriveCredential {
  credentialId: string;
  accessToken: string;
  refreshToken: string;
  expiryMs?: number;
  /** Optionale `root_folder_id` aus `customer_credentials.meta`. */
  rootFolderId?: string;
}

export class DriveCredentialNotFoundError extends Error {
  readonly code = 'CREDENTIAL_NOT_FOUND';
  constructor(public readonly customerId: string) {
    super(`Kein drive_oauth-Credential für customer_id=${customerId}.`);
    this.name = 'DriveCredentialNotFoundError';
  }
}

interface DriveTokenBlob {
  access_token: string;
  refresh_token: string;
  expiry_ms?: number;
}

export async function loadDriveCredential(db: Pool, customerId: string): Promise<DriveCredential> {
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error(
      'PP_PGCRYPTO_KEY nicht gesetzt — Drive-Credential kann nicht entschlüsselt werden.',
    );
  }

  const { rows } = await db.query<{
    credential_id: string;
    plaintext: string;
    meta: { root_folder_id?: string } | null;
  }>(
    `SELECT credential_id,
            pgp_sym_decrypt(ciphertext, $2)::text AS plaintext,
            meta
       FROM customer_credentials
      WHERE customer_id = $1
        AND kind = 'drive_oauth'
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY rotated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [customerId, config.PP_PGCRYPTO_KEY],
  );

  const row = rows[0];
  if (!row) throw new DriveCredentialNotFoundError(customerId);

  let parsed: DriveTokenBlob;
  try {
    parsed = JSON.parse(row.plaintext) as DriveTokenBlob;
  } catch {
    throw new Error(`Drive-Credential für ${customerId} ist kein valides JSON.`);
  }
  if (!parsed.access_token || !parsed.refresh_token) {
    throw new Error(`Drive-Credential für ${customerId}: access_token oder refresh_token fehlt.`);
  }
  return {
    credentialId: row.credential_id,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiryMs: parsed.expiry_ms,
    rootFolderId: row.meta?.root_folder_id,
  };
}

/**
 * Persistiert einen frischen Access-Token nach einem Refresh-Flow.
 * Refresh-Token bleibt unverändert (Google rotiert ihn üblicherweise nicht).
 */
export async function saveDriveCredential(
  db: Pool,
  customerId: string,
  credentialId: string,
  next: { accessToken: string; refreshToken: string; expiryMs?: number },
): Promise<void> {
  const blob: DriveTokenBlob = {
    access_token: next.accessToken,
    refresh_token: next.refreshToken,
    expiry_ms: next.expiryMs,
  };
  await db.query(
    `UPDATE customer_credentials
        SET ciphertext = pgp_sym_encrypt($3, $4)::bytea,
            rotated_at = now()
      WHERE credential_id = $1
        AND customer_id   = $2`,
    [credentialId, customerId, JSON.stringify(blob), config.PP_PGCRYPTO_KEY],
  );
}
