/**
 * T089/M08 — Repository für `report_deliveries` (belege-Welt, RLS via withTenant).
 *
 * Ein Delivery-Row = ein Versand eines Reports an einen Empfänger über einen
 * Kanal. Idempotent über UNIQUE (report_id, channel, recipient_hash): erneuter
 * Versand (z. B. nach 'failed') setzt denselben Row zurück auf 'pending', statt
 * einen zweiten anzulegen.
 *
 * `recipient_hash` ist PII-frei (SHA256-Hex der Mail) — die echte Adresse steht
 * nur in tenants.advisor_email.
 */

import type { PoolClient } from 'pg';

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface UpsertDeliveryInput {
  reportId: string;
  channel: 'email';
  recipientHash: string;
}

/**
 * Legt einen Delivery-Row an oder setzt den vorhandenen auf 'pending' zurück
 * (Idempotenz). Erwartet einen Client mit aktiver Transaktion + Tenant-GUC.
 */
export async function upsertPendingDelivery(
  client: PoolClient,
  tenantId: string,
  input: UpsertDeliveryInput,
): Promise<string> {
  const res = await client.query(
    `INSERT INTO report_deliveries (tenant_id, report_id, channel, recipient_hash, status)
       VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (report_id, channel, recipient_hash)
       DO UPDATE SET status = 'pending', external_id = NULL, error = NULL, updated_at = now()
     RETURNING id`,
    [tenantId, input.reportId, input.channel, input.recipientHash],
  );
  return res.rows[0].id as string;
}

export interface DeliveryResultInput {
  id: string;
  status: Extract<DeliveryStatus, 'sent' | 'failed'>;
  externalId?: string | null;
  error?: string | null;
}

/** Schreibt das Versand-Ergebnis (sent/failed) in einen vorhandenen Delivery-Row. */
export async function markDeliveryResult(
  client: PoolClient,
  input: DeliveryResultInput,
): Promise<void> {
  await client.query(
    `UPDATE report_deliveries
        SET status = $2, external_id = $3, error = $4, updated_at = now()
      WHERE id = $1`,
    [input.id, input.status, input.externalId ?? null, input.error ?? null],
  );
}
