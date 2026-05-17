/**
 * M02 — Dropbox-OAuth-Credential-Service
 *
 * Analog zu drive-credentials.ts — liest OAuth2-Token aus
 * customer_credentials (kind = 'dropbox_oauth'). Das Klartext-JSON
 * `{ access_token, refresh_token?, account_id }` wird mit pgcrypto
 * AES-256-GCM ver-/entschlüsselt (Master-Key: PP_PGCRYPTO_KEY).
 *
 * Token-Refresh: Dropbox nutzt langlebige Offline-Access-Tokens. Falls ein
 * Short-Lived-Token abgelaufen ist, refreshen wir via
 * POST https://api.dropboxapi.com/oauth2/token.
 */

import type { Pool } from 'pg';
import { config } from '../../config';

export interface DropboxCredential {
  credentialId: string;
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  expiresAt?: Date;
}

export class DropboxCredentialNotFoundError extends Error {
  readonly code = 'CREDENTIAL_NOT_FOUND';
  constructor(public readonly customerId: string) {
    super(`Kein dropbox_oauth-Credential für customer_id=${customerId}.`);
    this.name = 'DropboxCredentialNotFoundError';
  }
}

interface DropboxTokenBlob {
  access_token: string;
  refresh_token?: string;
  account_id?: string;
  expires_at?: string; // ISO-String
}

export async function loadDropboxCredential(
  db: Pool,
  customerId: string,
): Promise<DropboxCredential> {
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error(
      'PP_PGCRYPTO_KEY nicht gesetzt — Dropbox-Credential kann nicht entschlüsselt werden.',
    );
  }

  const { rows } = await db.query<{
    credential_id: string;
    plaintext: string;
    expires_at: Date | null;
  }>(
    `SELECT credential_id,
            pgp_sym_decrypt(ciphertext, $2)::text AS plaintext,
            expires_at
       FROM customer_credentials
      WHERE customer_id = $1
        AND kind = 'dropbox_oauth'
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY rotated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [customerId, config.PP_PGCRYPTO_KEY],
  );

  const row = rows[0];
  if (!row) throw new DropboxCredentialNotFoundError(customerId);

  let parsed: DropboxTokenBlob;
  try {
    parsed = JSON.parse(row.plaintext) as DropboxTokenBlob;
  } catch {
    throw new Error(`Dropbox-Credential für ${customerId} ist kein valides JSON.`);
  }

  if (!parsed.access_token) {
    throw new Error(`Dropbox-Credential für ${customerId}: access_token fehlt.`);
  }

  return {
    credentialId: row.credential_id,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    accountId: parsed.account_id,
    expiresAt: parsed.expires_at ? new Date(parsed.expires_at) : undefined,
  };
}

interface DropboxRefreshResponse {
  access_token: string;
  expires_in?: number;
  token_type: string;
}

/**
 * Refresht den Access-Token via Dropbox offline_access Grant.
 * Persistiert den neuen Token in customer_credentials.
 */
export async function refreshDropboxCredential(
  db: Pool,
  customerId: string,
  cred: DropboxCredential,
): Promise<DropboxCredential> {
  if (!cred.refreshToken) {
    throw new Error(`Dropbox-Credential für ${customerId}: kein refresh_token vorhanden.`);
  }

  const appKey = process.env.DROPBOX_APP_KEY ?? '';
  const appSecret = process.env.DROPBOX_APP_SECRET ?? '';

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cred.refreshToken,
    client_id: appKey,
    client_secret: appSecret,
  });

  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Dropbox token refresh fehlgeschlagen (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as DropboxRefreshResponse;
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined;

  // Neuen Token in customer_credentials persistieren
  const newBlob: DropboxTokenBlob = {
    access_token: data.access_token,
    refresh_token: cred.refreshToken,
    account_id: cred.accountId,
    expires_at: expiresAt?.toISOString(),
  };

  await db.query(
    `UPDATE customer_credentials
        SET ciphertext = pgp_sym_encrypt($3, $4)::bytea,
            expires_at = $5,
            rotated_at = now()
      WHERE credential_id = $1
        AND customer_id   = $2`,
    [
      cred.credentialId,
      customerId,
      JSON.stringify(newBlob),
      config.PP_PGCRYPTO_KEY,
      expiresAt ?? null,
    ],
  );

  return {
    ...cred,
    accessToken: data.access_token,
    expiresAt,
  };
}
