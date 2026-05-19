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
    // T010 Review-Fix: Belege-Query — exakter JSONB-Pfad-Match statt Volltext-ILIKE
    // (analog zum B1-Fix in loeschung.service.ts). Verhindert, dass z.B. 'a@b.de'
    // auch fremde Belege mit substring 'b.de' im Payload trifft.
    const belegeResult = await client.query<Record<string, unknown>>(
      `SELECT id, status, source_channel, file_object_key, file_mime_type,
              file_size_bytes, supplier_name, document_date, total_gross,
              currency, category, received_at, created_at, payload
         FROM belege
        WHERE tenant_id = $1
          AND LOWER(payload->'extraction'->'fields'->>'supplier_email') = $2
        ORDER BY created_at DESC`,
      [tenantId, normalized],
    );

    // 2. Audit-Log — nur DSGVO-relevante Events für diesen Subject.
    //
    // T010 Review-Fix M3: Vorher wurde mit ILIKE auf payload_text gesucht,
    // wodurch Audit-Events anderer User ins ZIP geraten konnten (z.B. wenn
    // ein anderer User die gleiche Substring in seinem Display-Name hat).
    //
    // Neu: strikter Filter auf actor.id = subject_user_id ODER auf DSGVO-
    // Events, die diesen Subject explizit nennen. Wenn der Subject kein
    // bekannter User ist (z.B. ext. Lieferant), fallback auf actor-Filter
    // mit dem Subject-User aus der vorherigen Belege-Anonymisierung.
    const auditResult = await client.query<Record<string, unknown>>(
      `SELECT id, entity_type, entity_id, event_type, actor,
              payload_before, payload_after, metadata, occurred_at
         FROM audit_log
        WHERE tenant_id = $1
          AND (
            -- Events VOM Subject selbst (Login, eigene Aktionen)
            actor->>'email' = $2
            OR actor->>'id' IN (SELECT id::text FROM users WHERE LOWER(email) = $2)
            -- DSGVO-Events MIT diesem Subject
            OR (event_type LIKE 'dsgvo.%' AND metadata->>'subject_email' = $2)
          )
        ORDER BY occurred_at DESC
        LIMIT 1000`,
      [tenantId, normalized],
    );

    // 3. Users — globaler Match (users.tenant_id existiert absichtlich nicht,
    //    siehe Migration 020 Zeile 64: "Mitarbeiter sehen alle Tenants per Rolle").
    //    DSGVO-Auskunft für einen Staff-User ist daher tenant-unabhängig
    //    legitim: der Subject erfährt nur seine eigenen Profil-Daten (Email,
    //    Discord, Rolle, Login-Zeiten) — keine Daten ANDERER Tenants.
    //    Wir holen NUR sehr wenige Felder (kein password_hash, kein TOTP).
    //
    // T010 Review-Fix M6-artig: try/catch um die Query entfernt. Bei Schema-
    // Mismatch sollte ein klarer Fehler kommen, nicht stilles Schlucken.
    const usersResult = await client.query<Record<string, unknown>>(
      `SELECT id, email, display_name, role, created_at, last_login_at
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 10`,
      [normalized],
    );

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
