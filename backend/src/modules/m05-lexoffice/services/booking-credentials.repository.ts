/**
 * T009/M05 — Repository fuer booking_credentials (Lexware Office API-Tokens
 * pro Tenant). Pgcrypto-Decrypt erfolgt innerhalb derselben Tx.
 *
 * Pattern uebernommen aus modules/m15-pos-connector/pos-credentials.repository.ts
 * (analog SumUp-OAuth-Token-Speicher).
 */

import type { Pool, PoolClient } from 'pg';
import { type AuditActor, logAuditEvent } from '../../../core/audit/audit-log';
import { config } from '../../../core/config';

export type BookingProvider = 'lexware_office' | 'sevdesk' | 'datev_online';

export interface BookingCredential {
  id: string;
  tenant_id: string;
  provider: BookingProvider;
  display_name: string | null;
  auto_push: boolean;
  active: boolean;
  deactivation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  last_used_at: Date | null;
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  // T041: Key MUSS app.current_tenant sein (von RLS-Policy current_tenant_id() gelesen).
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

/**
 * Speichert/aktualisiert einen Token. Existiert bereits einer fuer
 * (tenant, provider), wird er ueberschrieben (Token-Rotation).
 *
 * Audit-Log: booking_credentials.upserted (kein Token-Klartext im Log).
 */
export async function upsertBookingCredential(
  pool: Pool,
  input: {
    tenantId: string;
    provider: BookingProvider;
    apiTokenPlaintext: string;
    displayName?: string | null;
    autoPush?: boolean;
    /** Staff-User-ID (Bootstrap/Settings-Route). Ergibt actor={type:'staff',id}. */
    actorUserId?: string;
    /** Alternativ direkt der Audit-Actor (z. B. {type:'customer',id:null} im Wizard). */
    actor?: AuditActor;
  },
): Promise<BookingCredential> {
  // Wizard-Flow (T084) hat keinen Staff-User → Customer-Actor. Bestehende Aufrufer
  // (Bootstrap-Skript/Staff-Route) übergeben actorUserId → Staff-Actor (rückwärtskompatibel).
  const actor: AuditActor = input.actor ?? { type: 'staff', id: input.actorUserId ?? null };
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error(
      'PP_PGCRYPTO_KEY ist leer — Booking-Token kann nicht verschluesselt gespeichert werden.',
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    const result = await client.query<BookingCredential>(
      `INSERT INTO booking_credentials
         (tenant_id, provider, api_token_encrypted, display_name, auto_push)
       VALUES (
         $1, $2,
         pgp_sym_encrypt($3, $4),
         $5, COALESCE($6, false)
       )
       ON CONFLICT (tenant_id, provider) DO UPDATE
         SET api_token_encrypted = pgp_sym_encrypt($3, $4),
             display_name        = COALESCE($5, booking_credentials.display_name),
             auto_push           = COALESCE($6, booking_credentials.auto_push),
             active              = true,
             deactivation_reason = NULL
       RETURNING id, tenant_id, provider, display_name, auto_push, active,
                 deactivation_reason, created_at, updated_at, last_used_at`,
      [
        input.tenantId,
        input.provider,
        input.apiTokenPlaintext,
        config.PP_PGCRYPTO_KEY,
        input.displayName ?? null,
        input.autoPush ?? null,
      ],
    );

    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'tenant_settings',
      entityId: result.rows[0].id,
      eventType: 'booking_credentials.upserted',
      actor,
      payloadAfter: {
        provider: input.provider,
        auto_push: input.autoPush ?? false,
        has_token: true,
      },
    });

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Holt einen entschluesselten Token. Wirft wenn nicht vorhanden oder
 * deaktiviert. Wird NUR aufgerufen wenn der Export tatsaechlich an
 * Lexoffice geht — niemals zur Anzeige im UI.
 */
export async function getBookingTokenDecrypted(
  pool: Pool,
  tenantId: string,
  provider: BookingProvider,
): Promise<{ token: string; credential: BookingCredential }> {
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error('PP_PGCRYPTO_KEY ist leer — Booking-Token kann nicht entschluesselt werden.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<BookingCredential & { token_plain: string }>(
      `SELECT id, tenant_id, provider, display_name, auto_push, active,
              deactivation_reason, created_at, updated_at, last_used_at,
              pgp_sym_decrypt(api_token_encrypted, $3)::text AS token_plain
         FROM booking_credentials
        WHERE tenant_id = $1 AND provider = $2 AND active = true`,
      [tenantId, provider, config.PP_PGCRYPTO_KEY],
    );

    if (result.rows.length === 0) {
      await client.query('COMMIT');
      throw new BookingCredentialNotConfiguredError(
        `Kein aktiver ${provider}-Token fuer Tenant gefunden.`,
      );
    }

    // last_used_at hochzaehlen (best-effort, kein audit-Log fuer jeden Read)
    await client.query(
      `UPDATE booking_credentials SET last_used_at = now()
        WHERE id = $1`,
      [result.rows[0].id],
    );

    await client.query('COMMIT');
    const { token_plain, ...credential } = result.rows[0];
    return { token: token_plain, credential };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export class BookingCredentialNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingCredentialNotConfiguredError';
  }
}

/**
 * Listet Booking-Credentials eines Tenants (ohne Token). Wird vom Settings-UI
 * verwendet — Mitarbeiter sieht „aktiv/inaktiv" + Provider, nie den Token.
 */
export async function listBookingCredentials(
  pool: Pool,
  tenantId: string,
): Promise<BookingCredential[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<BookingCredential>(
      `SELECT id, tenant_id, provider, display_name, auto_push, active,
              deactivation_reason, created_at, updated_at, last_used_at
         FROM booking_credentials
        WHERE tenant_id = $1
        ORDER BY provider`,
      [tenantId],
    );

    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
