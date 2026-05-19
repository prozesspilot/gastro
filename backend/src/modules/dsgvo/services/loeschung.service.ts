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

  // T010 Review-Fix B1: Validierung gegen zu generische / kurze Emails.
  // Ohne diesen Check könnte z.B. 'a@b.de' (8 Zeichen ohne Validierung) bei
  // exaktem JSONB-Match noch viele Lieferanten treffen — dieser Anker ist
  // doppelt: Length + Format. Mindestens 'x@y.zz' = 6, wir verlangen 8.
  if (normalized.length < 8 || !normalized.includes('@')) {
    throw new Error(
      `DSGVO-Anonymisierung abgebrochen: Subject-Email zu kurz/ungültig (length=${normalized.length})`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    // 1. Belege anonymisieren — **exakter** JSONB-Pfad-Match auf supplier_email
    //
    // T010 Review-Fix B1: Volltext-ILIKE durch exakten JSONB-Pfad-Match ersetzt.
    // Vorher würde z.B. `a@b.de` alle Belege treffen, die irgendwo den String
    // 'b.de' im Payload haben — irreversible PII-Vernichtung in fremden Belegen.
    //
    // T010 Review-Fix B2: supplier_address wird jetzt auch anonymisiert
    // (war im Doc-Block versprochen, aber im Code nicht umgesetzt).
    const belegeAffected = await client.query<{ id: string }>(
      `UPDATE belege
          SET supplier_name = NULL,
              payload = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(payload, '{}'::jsonb),
                    '{extraction,fields,supplier_email}', '"<REDACTED:DSGVO>"'::jsonb, true
                  ),
                  '{extraction,fields,supplier_address}', '"<REDACTED:DSGVO>"'::jsonb, true
                ),
                '{extraction,raw_text}', '"<REDACTED:DSGVO>"'::jsonb, true
              )
        WHERE tenant_id = $1
          AND LOWER(payload->'extraction'->'fields'->>'supplier_email') = $2
       RETURNING id`,
      [tenantId, normalized],
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
          JSON.stringify({
            redacted_fields: ['supplier_name', 'supplier_email', 'supplier_address', 'raw_text'],
          }),
          JSON.stringify({ dsgvo_request_id: requestId }),
        ],
      );
    }

    // 3. Users: falls Subject ein Mitarbeiter ist, redigieren wir email +
    //    display_name. Account bleibt erhalten (Foreign-Keys auf audit_log etc.).
    //
    // T010 Review-Fix M6: Schema-Fallback (try/catch um UPDATE) entfernt.
    // users.deleted_at MUSS via Migration existieren — Runtime-Try ist
    // Anti-Pattern. Falls die Spalte fehlt: Migration 080 wurde übersprungen,
    // dann ist ein Hard-Fail richtig (gibt klaren Hinweis was zu tun ist).
    let affectedUserIds: string[] = [];
    const usersAffected = await client.query<{ id: string }>(
      `UPDATE users
          SET email = $2,
              display_name = $2,
              deleted_at = COALESCE(deleted_at, now())
        WHERE LOWER(email) = $1
        RETURNING id`,
      [normalized, REDACTED],
    );
    affectedUserIds = usersAffected.rows.map((r) => r.id);

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
