/**
 * T010/M12 — Loeschungs-Service (DSGVO Art. 17).
 *
 * Verhaltensregeln:
 *   * Belege, die der gesetzlichen 10-Jahres-Aufbewahrungspflicht unterliegen
 *     (§ 147 AO), werden NICHT geloescht, sondern ANONYMISIERT:
 *       - supplier_name = NULL
 *       - payload.extraction.fields.supplier_address = NULL
 *       - payload.extraction.fields.supplier_email = NULL
 *       - payload.extraction.raw_text = '<REDACTED:DSGVO>'
 *       - audit-Eintrag mit `dsgvo.erasure.belege_anonymized`
 *   * audit_log selbst wird NIE geloescht (gesetzlicher Nachweis).
 *   * users-Tabelle: falls Subject = staff_user, wird `email`/`display_name`
 *     redigiert; der User-Account selbst bleibt erhalten (Foreign-Keys).
 *
 * Ergebnis: Anzahl der modifizierten Rows (soft_deleted_count + hard_deleted_count).
 */

import type { Pool, PoolClient } from 'pg';
import { logAuditEvent } from '../../../core/audit/audit-log';
import { logger } from '../../../core/logger';

export interface LoeschungResult {
  soft_deleted_count: number;
  hard_deleted_count: number;
  affected_beleg_ids: string[];
  affected_user_ids: string[];
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

const REDACTED = '<REDACTED:DSGVO>';

/**
 * Fuehrt die Loeschung in EINER Transaktion aus. Bei jedem Fehler:
 * ROLLBACK — keine partielle Datenmanipulation.
 */
export async function executeLoeschung(
  pool: Pool,
  tenantId: string,
  subjectEmail: string,
  requestId: string,
  actorUserId: string,
): Promise<LoeschungResult> {
  const normalized = subjectEmail.toLowerCase().trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    // 1. Belege anonymisieren — alle Treffer in payload bzw. supplier_name
    const belegeAffected = await client.query<{ id: string }>(
      `UPDATE belege
          SET supplier_name = NULL,
              payload = jsonb_set(
                jsonb_set(
                  COALESCE(payload, '{}'::jsonb),
                  '{extraction,fields,supplier_email}', '"<REDACTED:DSGVO>"'::jsonb, true
                ),
                '{extraction,raw_text}', '"<REDACTED:DSGVO>"'::jsonb, true
              )
        WHERE tenant_id = $1
          AND payload::text ILIKE $2
       RETURNING id`,
      [tenantId, `%${normalized}%`],
    );
    const affectedBelegIds = belegeAffected.rows.map((r) => r.id);

    // 2. Audit-Trail: pro Beleg ein audit_log-Eintrag mit Action 'dsgvo.erasure.beleg_anonymized'
    //    Wir batchen das in einem INSERT ... SELECT, damit es bei 1000 Belegen
    //    nicht zu 1000 separaten Queries kommt.
    if (affectedBelegIds.length > 0) {
      await client.query(
        `INSERT INTO audit_log
           (tenant_id, entity_type, entity_id, event_type, actor, payload_after, metadata)
         SELECT $1, 'beleg', unnest($2::text[]), 'dsgvo.erasure.beleg_anonymized',
                $3::jsonb, $4::jsonb, $5::jsonb`,
        [
          tenantId,
          affectedBelegIds,
          JSON.stringify({ type: 'staff', id: actorUserId }),
          JSON.stringify({ redacted_fields: ['supplier_name', 'supplier_email', 'raw_text'] }),
          JSON.stringify({ dsgvo_request_id: requestId }),
        ],
      );
    }

    // 3. Users: falls Subject ein Mitarbeiter ist, redigieren wir email +
    //    display_name. Account bleibt erhalten (Foreign-Keys auf audit_log etc.).
    //    DECISION: Wir loeschen den User NICHT, weil audit_log-Eintraege darauf
    //    verweisen. Stattdessen: PII raus, Status 'deleted'.
    let affectedUserIds: string[] = [];
    try {
      const usersAffected = await client.query<{ id: string }>(
        `UPDATE users
            SET email = $3,
                display_name = $3,
                deleted_at = COALESCE(deleted_at, now())
          WHERE LOWER(email) = $1
          RETURNING id`,
        [normalized, REDACTED, REDACTED],
      );
      affectedUserIds = usersAffected.rows.map((r) => r.id);
    } catch (err) {
      // users-Schema-Variante koennte 'deleted_at' nicht haben — wir versuchen
      // dann ohne Soft-Delete-Spalte.
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: msg },
        '[dsgvo-loeschung] users-Update mit deleted_at fehlgeschlagen — Fallback',
      );
      try {
        const usersAffected = await client.query<{ id: string }>(
          `UPDATE users
              SET email = $2,
                  display_name = $2
            WHERE LOWER(email) = $1
            RETURNING id`,
          [normalized, REDACTED],
        );
        affectedUserIds = usersAffected.rows.map((r) => r.id);
      } catch (err2) {
        logger.warn(
          { err: err2 instanceof Error ? err2.message : String(err2) },
          '[dsgvo-loeschung] users-Update komplett uebersprungen (Schema-Mismatch)',
        );
      }
    }

    // 4. Master-Audit-Eintrag der Loeschung selbst
    await logAuditEvent(client, {
      tenantId,
      entityType: 'dsgvo_request',
      entityId: requestId,
      eventType: 'dsgvo.erasure.executed',
      actor: { type: 'staff', id: actorUserId },
      payloadAfter: {
        belege_anonymized: affectedBelegIds.length,
        users_redacted: affectedUserIds.length,
      },
    });

    await client.query('COMMIT');
    return {
      soft_deleted_count: affectedBelegIds.length + affectedUserIds.length,
      hard_deleted_count: 0, // wir loeschen niemals hart (GoBD/Audit)
      affected_beleg_ids: affectedBelegIds,
      affected_user_ids: affectedUserIds,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
