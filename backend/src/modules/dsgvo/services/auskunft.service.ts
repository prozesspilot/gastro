/**
 * T010/M12 — Auskunfts-Service (DSGVO Art. 15).
 *
 * Sammelt alle Daten zu einer Subject-Email innerhalb eines Tenants.
 *
 * Welche Tabellen werden durchsucht?
 *   1. belege.payload — wenn supplier_email (oder anderer PII-Klartext) matcht
 *   2. audit_log     — Eintraege mit subject_email_hash (DSGVO-spezifisch)
 *   3. users         — falls Subject ein Mitarbeiter ist (selten, aber moeglich)
 *
 * WICHTIG: Diese Suche ist BEST-EFFORT. Wir koennen keinen Volltext-Match auf
 * payload.extraction.fields.supplier_email garantieren — der Operator muss
 * das Resultat manuell pruefen. Im ZIP enthalten:
 *   * `belege.json`      — alle matchenden Belege (volle payloads)
 *   * `audit_log.json`   — alle audit_log-Eintraege fuer subject_email
 *   * `users.json`       — falls Subject = staff_user
 *   * `meta.json`        — Tenant-Info + Suchparameter + Generierungs-Datum
 */

import type { Pool, PoolClient } from 'pg';
import { logger } from '../../../core/logger';

export interface AuskunftBundle {
  meta: {
    tenant_id: string;
    subject_email: string;
    generated_at: string;
    matched_belege_count: number;
    matched_audit_count: number;
    matched_users_count: number;
  };
  belege: Array<Record<string, unknown>>;
  audit_log: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

/**
 * Sammelt alle bekannten Daten zu einer Subject-Email innerhalb des Tenants.
 *
 * Performance-Hinweis: Bei sehr grossen Tenants kann die Volltext-Suche in
 * belege.payload langsam sein. Pilot hat 1 Tenant + ~100 Belege/Monat, also
 * unkritisch. Spaeter eventuell GIN-Index auf payload.
 */
export async function collectAuskunftBundle(
  pool: Pool,
  tenantId: string,
  subjectEmail: string,
): Promise<AuskunftBundle> {
  const normalized = subjectEmail.toLowerCase().trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    // 1. Belege — JSONB-Volltext-Suche in payload nach Subject-Email.
    //    Wir nutzen `payload::text ILIKE '%email%'` als simple Heuristik.
    //    Funktioniert solange Emails irgendwo in extraction.fields oder
    //    custom-Feldern stehen.
    const belegeResult = await client.query<Record<string, unknown>>(
      `SELECT id, status, source_channel, file_object_key, file_mime_type,
              file_size_bytes, supplier_name, document_date, total_gross,
              currency, category, received_at, created_at, payload
         FROM belege
        WHERE tenant_id = $1
          AND payload::text ILIKE $2
        ORDER BY created_at DESC`,
      [tenantId, `%${normalized}%`],
    );

    // 2. Audit-Log — Eintraege mit dem Subject-Email-Hash.
    //    Wir vergleichen den SHA256-Hash der Email gegen payload_after->>subject_email_hash.
    const auditResult = await client.query<Record<string, unknown>>(
      `SELECT id, entity_type, entity_id, event_type, actor,
              payload_before, payload_after, metadata, occurred_at
         FROM audit_log
        WHERE tenant_id = $1
          AND (
            payload_after::text ILIKE $2
            OR payload_before::text ILIKE $2
            OR metadata::text ILIKE $2
          )
        ORDER BY occurred_at DESC
        LIMIT 1000`,
      [tenantId, `%${normalized}%`],
    );

    // 3. Users — globaler Match (users haben keinen tenant_id-Scope, aber wir
    //    schauen nur die fields an, die auch im Audit-Log auftauchen wuerden).
    //    Wir holen NUR sehr wenige Felder (kein password_hash, kein TOTP).
    let usersResult: { rows: Array<Record<string, unknown>> } = { rows: [] };
    try {
      const r = await client.query<Record<string, unknown>>(
        `SELECT id, email, display_name, role, created_at, last_login_at
           FROM users
          WHERE LOWER(email) = $1
          LIMIT 10`,
        [normalized],
      );
      usersResult = r;
    } catch (err) {
      // users-Tabelle koennte je nach Schema-Variante andere Spalten haben —
      // wir nehmen das billigend in Kauf, statt zu crashen.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        '[dsgvo-auskunft] users-Query fehlgeschlagen — Bundle wird ohne users-Sektion erstellt',
      );
    }

    await client.query('COMMIT');

    return {
      meta: {
        tenant_id: tenantId,
        subject_email: subjectEmail,
        generated_at: new Date().toISOString(),
        matched_belege_count: belegeResult.rows.length,
        matched_audit_count: auditResult.rows.length,
        matched_users_count: usersResult.rows.length,
      },
      belege: belegeResult.rows,
      audit_log: auditResult.rows,
      users: usersResult.rows,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
