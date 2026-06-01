/**
 * M15 — POS-Credentials Repository
 *
 * DB-Queries für die pos_credentials Tabelle (Migration 022_pos_credentials.sql).
 * Tokens werden analog zu Discord-Tokens in m14-auth/users.repository.ts via
 * pgcrypto (pgp_sym_encrypt / pgp_sym_decrypt) verschlüsselt.
 *
 * Security:
 *   - Alle Queries parametrisiert (kein String-Concat)
 *   - Tokens werden als BYTEA gespeichert (pgcrypto AES-256)
 *   - Bei PP_PGCRYPTO_KEY leer (Dev/Test): empty BYTEA — Tokens werden NICHT gespeichert
 *   - Alle SQL-Queries explizit mit $N-Platzhaltern
 *
 * Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md §3.1
 */

import type { Pool } from 'pg';
import { logAuditEvent } from '../../core/audit/audit-log';
import { config } from '../../core/config';
import { captureException } from '../../core/sentry';

// ── Types ──────────────────────────────────────────────────────────────────

export type PosSystem = 'sumup_lite' | 'sumup_pos_pro';

export interface DbPosCredentials {
  id: string;
  tenant_id: string;
  pos_system: PosSystem;
  pos_account_id: string;
  /** Entschlüsselter Access-Token (leer string in Dev ohne PP_PGCRYPTO_KEY) */
  access_token: string;
  /** Entschlüsselter Refresh-Token (leer string in Dev ohne PP_PGCRYPTO_KEY) */
  refresh_token: string;
  token_expires_at: Date;
  scopes: string[] | null;
  active: boolean;
  /** Grund für Deaktivierung (z.B. 'refresh_failed', 'manual_disconnect'). NULL wenn active=true. */
  inactive_reason: string | null;
  created_at: Date;
  updated_at: Date;
  last_used_at: Date | null;
}

export interface UpsertPosCredentialsInput {
  tenantId: string;
  posSystem: PosSystem;
  posAccountId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string[];
}

export interface UpdatePosTokensInput {
  id: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

// ── Repository-Funktionen ──────────────────────────────────────────────────

/**
 * UPSERT für pos_credentials.
 *
 * INSERT mit ON CONFLICT (tenant_id, pos_system) DO UPDATE.
 * Bei Conflict: Tokens, Ablaufdatum, Scopes, last_used_at und active werden aktualisiert.
 *
 * DECISION: Token-Verschlüsselung analog zu upsertDiscordUser in m14-auth:
 * - Mit PP_PGCRYPTO_KEY: pgp_sym_encrypt(token::text, key::text)
 * - Ohne PP_PGCRYPTO_KEY (Dev/Test): ''::bytea
 */
export async function upsertPosCredentials(
  pool: Pool,
  input: UpsertPosCredentialsInput,
): Promise<{ id: string }> {
  const tokenExpiresIso = input.tokenExpiresAt.toISOString();
  const scopesArray = `{${input.scopes.map((s) => `"${s}"`).join(',')}}`;

  let query: string;
  let params: unknown[];

  if (config.PP_PGCRYPTO_KEY) {
    query = `
      INSERT INTO pos_credentials (
        tenant_id,
        pos_system,
        pos_account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        token_expires_at,
        scopes,
        active,
        inactive_reason,
        last_used_at
      ) VALUES (
        $1, $2, $3,
        pgp_sym_encrypt($4::text, $7::text),
        pgp_sym_encrypt($5::text, $7::text),
        $6::timestamptz,
        $8::text[],
        true,
        NULL,
        now()
      )
      ON CONFLICT (tenant_id, pos_system) DO UPDATE SET
        pos_account_id              = EXCLUDED.pos_account_id,
        access_token_encrypted      = pgp_sym_encrypt($4::text, $7::text),
        refresh_token_encrypted     = pgp_sym_encrypt($5::text, $7::text),
        token_expires_at            = EXCLUDED.token_expires_at,
        scopes                      = EXCLUDED.scopes,
        active                      = true,
        inactive_reason             = NULL,
        last_used_at                = NULL,
        updated_at                  = now()
      RETURNING id
    `;
    params = [
      input.tenantId, // $1
      input.posSystem, // $2
      input.posAccountId, // $3
      input.accessToken, // $4
      input.refreshToken, // $5
      tokenExpiresIso, // $6
      config.PP_PGCRYPTO_KEY, // $7
      scopesArray, // $8
    ];
  } else {
    // Dev/Test: keine Verschlüsselung — empty BYTEA
    query = `
      INSERT INTO pos_credentials (
        tenant_id,
        pos_system,
        pos_account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        token_expires_at,
        scopes,
        active,
        inactive_reason,
        last_used_at
      ) VALUES (
        $1, $2, $3,
        ''::bytea,
        ''::bytea,
        $4::timestamptz,
        $5::text[],
        true,
        NULL,
        now()
      )
      ON CONFLICT (tenant_id, pos_system) DO UPDATE SET
        pos_account_id              = EXCLUDED.pos_account_id,
        access_token_encrypted      = ''::bytea,
        refresh_token_encrypted     = ''::bytea,
        token_expires_at            = EXCLUDED.token_expires_at,
        scopes                      = EXCLUDED.scopes,
        active                      = true,
        inactive_reason             = NULL,
        last_used_at                = NULL,
        updated_at                  = now()
      RETURNING id
    `;
    params = [
      input.tenantId, // $1
      input.posSystem, // $2
      input.posAccountId, // $3
      tokenExpiresIso, // $4
      scopesArray, // $5
    ];
  }

  const result = await pool.query(query, params);
  return { id: result.rows[0].id as string };
}

/**
 * Lädt pos_credentials für einen Tenant + POS-System.
 * Entschlüsselt Tokens via pgp_sym_decrypt wenn PP_PGCRYPTO_KEY gesetzt.
 * Gibt null zurück wenn keine Credentials vorhanden.
 */
export async function getPosCredentials(
  pool: Pool,
  tenantId: string,
  posSystem: PosSystem,
): Promise<DbPosCredentials | null> {
  let query: string;
  let params: unknown[];

  if (config.PP_PGCRYPTO_KEY) {
    query = `
      SELECT
        id,
        tenant_id,
        pos_system,
        pos_account_id,
        pgp_sym_decrypt(access_token_encrypted, $3::text)  AS access_token,
        pgp_sym_decrypt(refresh_token_encrypted, $3::text) AS refresh_token,
        token_expires_at,
        scopes,
        active,
        inactive_reason,
        created_at,
        updated_at,
        last_used_at
      FROM pos_credentials
      WHERE tenant_id = $1
        AND pos_system = $2
    `;
    params = [tenantId, posSystem, config.PP_PGCRYPTO_KEY];
  } else {
    // Dev/Test: Tokens als leerer String zurückgeben
    query = `
      SELECT
        id,
        tenant_id,
        pos_system,
        pos_account_id,
        ''::text AS access_token,
        ''::text AS refresh_token,
        token_expires_at,
        scopes,
        active,
        inactive_reason,
        created_at,
        updated_at,
        last_used_at
      FROM pos_credentials
      WHERE tenant_id = $1
        AND pos_system = $2
    `;
    params = [tenantId, posSystem];
  }

  const result = await pool.query(query, params);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    pos_system: row.pos_system as PosSystem,
    pos_account_id: row.pos_account_id as string,
    access_token: (row.access_token as string | null) ?? '',
    refresh_token: (row.refresh_token as string | null) ?? '',
    token_expires_at: new Date(row.token_expires_at as string),
    scopes: row.scopes as string[] | null,
    active: row.active as boolean,
    inactive_reason: (row.inactive_reason as string | null) ?? null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    last_used_at: row.last_used_at ? new Date(row.last_used_at as string) : null,
  };
}

/**
 * Aktualisiert Tokens nach einem erfolgreichen Token-Refresh.
 * Setzt last_used_at auf now().
 */
export async function updatePosTokens(pool: Pool, input: UpdatePosTokensInput): Promise<void> {
  const tokenExpiresIso = input.tokenExpiresAt.toISOString();

  if (config.PP_PGCRYPTO_KEY) {
    await pool.query(
      `UPDATE pos_credentials SET
         access_token_encrypted  = pgp_sym_encrypt($2::text, $4::text),
         refresh_token_encrypted = pgp_sym_encrypt($3::text, $4::text),
         token_expires_at        = $5::timestamptz,
         last_used_at            = now(),
         updated_at              = now()
       WHERE id = $1`,
      [input.id, input.accessToken, input.refreshToken, config.PP_PGCRYPTO_KEY, tokenExpiresIso],
    );
  } else {
    // Dev/Test: keine Token-Speicherung, nur Ablaufdatum aktualisieren
    await pool.query(
      `UPDATE pos_credentials SET
         token_expires_at = $2::timestamptz,
         last_used_at     = now(),
         updated_at       = now()
       WHERE id = $1`,
      [input.id, tokenExpiresIso],
    );
  }
}

/**
 * Markiert pos_credentials als inaktiv (z.B. nach Refresh-Fehler oder 401).
 * DECISION: Soft-Delete via active=false statt DELETE — Audit-Trail bleibt erhalten.
 * Hard-DELETE ist über deletePosCredentials() möglich (für expliziten Disconnect).
 */
export async function markPosInactive(pool: Pool, id: string, reason: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE pos_credentials SET
         active          = false,
         inactive_reason = $2,
         updated_at      = now()
       WHERE id = $1`,
      [id, reason],
    );
  } catch (err) {
    // Fehler beim Markieren nicht werfen — würde den eigentlichen Fehler-Flow unterbrechen
    captureException(err, { module: 'm15-pos-connector', function: 'markPosInactive', reason });
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[m15] markPosInactive fehlgeschlagen: ${message}`);
  }
}

/**
 * Löscht pos_credentials für einen Tenant + POS-System (Hard-Delete für Disconnect).
 * Wird bei explizitem Disconnect durch Mitarbeiter verwendet.
 */
export async function deletePosCredentials(
  pool: Pool,
  tenantId: string,
  posSystem: PosSystem,
): Promise<{ deleted: boolean }> {
  const result = await pool.query(
    `DELETE FROM pos_credentials
     WHERE tenant_id = $1
       AND pos_system = $2
     RETURNING id`,
    [tenantId, posSystem],
  );
  return { deleted: (result.rowCount ?? 0) > 0 };
}

// ── T018: DSGVO-Cleanup ────────────────────────────────────────────────

export interface PurgedPosCredential {
  id: string;
  tenant_id: string;
  pos_system: PosSystem;
  pos_account_id: string;
  inactive_reason: string | null;
  inactive_since: Date;
}

/**
 * T018: Loescht alle pos_credentials die seit `retentionDays` deaktiviert sind
 * UND schreibt pro Loeschung einen `audit_log`-Eintrag — alles in EINER
 * Transaktion (Review-Fix #1 Atomicity).
 *
 * Vorher: DELETE + Audit waren separate Auto-Commit-Statements →
 * wenn die Connection zwischen DELETE-Commit und Audit-Insert crashte,
 * gab es geloeschte Rows ohne Audit-Eintrag → DSGVO-Compliance-Gap.
 *
 * Jetzt:
 *   BEGIN
 *     DELETE … RETURNING
 *     -- pro Row: set_config('app.tenant_id', <row.tenant_id>) + audit_log-INSERT
 *   COMMIT
 *
 * Bei jedem Fehler im Block: ROLLBACK → DELETE rueckabgewickelt, kein
 * orphaner Zustand.
 *
 * Audit-Ziel (Review-Fix #2, korrigiert): Der Eintrag geht in `audit_log`
 * (tenant-isoliert, mit tenant_id-Spalte + RLS), NICHT in `auth_audit_log`
 * (global, ohne tenant_id, fuer Login/Logout gedacht). Sonst taucht die
 * Loeschung bei einem DSGVO-Auskunftsersuchen NICHT im tenant-isolierten
 * Audit-Trail des Kunden auf. Der INSERT laeuft pro Row mit gesetztem
 * `app.tenant_id` → die RLS-INSERT-Policy `tenant_id = current_tenant_id()`
 * greift auch fuer die gastro_app-Rolle (kein Bypass noetig).
 *
 * ⚠️ RLS-Grenze beim DELETE (Review-Fix #2): `pos_credentials` hat aktuell
 * KEINE RLS (Migration 022), daher loescht der Cron als gastro_app heute
 * korrekt ueber alle Tenants. SOBALD T020 RLS auf pos_credentials aktiviert,
 * gibt der DELETE als gastro_app ein SILENT-EMPTY zurueck — T020 MUSS den Cron
 * dann auf eine Owner-Connection umstellen. Siehe Backlog
 * `T022-pos-cron-owner-connection`. Ein `set_config('app.bypass_rls')` waere
 * hier wirkungslos (greift nur fuer gastro_owner/Superuser).
 *
 * Token sind kein Geschaeftsdaten-Bestandteil — die 10-Jahres-Aufbewahrungs-
 * pflicht (§ 147 AO) gilt fuer Belege/Buchungen, NICHT fuer OAuth-Tokens.
 *
 * Idempotent: bei wiederholtem Aufruf ohne neue inactive-Rows nichts zu tun.
 */
/**
 * T018/T022: Loescht alle pos_credentials die seit `retentionDays` deaktiviert
 * sind UND schreibt pro Loeschung einen `audit_log`-Eintrag — alles in EINER
 * Transaktion (atomicity-Garantie fuer GoBD).
 *
 * T022-Fix: Das DELETE laeuft jetzt ueber die SECURITY DEFINER-Funktion
 * `delete_inactive_pos_credentials(retention_days)` (Migration 121), die als
 * gastro_owner laeuft → umgeht RLS auf pos_credentials korrekt. Vorher war der
 * direkte DELETE-Aufruf als gastro_app ein SILENT-EMPTY sobald RLS auf
 * pos_credentials aktiv wird.
 *
 * Atomicity (unveraendert): DELETE-Funktion + Audit-Inserts laufen in EINER
 * Transaktion. Bei Fehler → ROLLBACK → kein orphaner Zustand.
 *
 * Audit-Ziel: `audit_log` (tenant-isoliert), NICHT `auth_audit_log` (global).
 * Pro Row: app.current_tenant setzen → RLS-INSERT-Policy trifft zu.
 *
 * Token sind kein Geschaeftsdaten-Bestandteil — die 10-Jahres-Aufbewahrungspflicht
 * (§ 147 AO) gilt fuer Belege/Buchungen, NICHT fuer OAuth-Tokens.
 *
 * Idempotent: bei wiederholtem Aufruf ohne neue inactive-Rows nichts zu tun.
 */
export async function purgeInactivePosCredentials(
  pool: Pool,
  retentionDays: number,
  actorUserAgent = 'cron:pos-credentials-cleanup',
): Promise<PurgedPosCredential[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // T022: SECURITY DEFINER-Funktion fuer cross-tenant DELETE.
    // Laeuft als gastro_owner → is_rls_bypassed() = true (Rolle + GUC gesetzt
    // innerhalb der Funktion). Gibt dieselben Spalten wie vorher zurueck.
    const result = await client.query<{
      id: string;
      tenant_id: string;
      pos_system: PosSystem;
      pos_account_id: string;
      inactive_reason: string | null;
      updated_at: Date;
    }>('SELECT * FROM delete_inactive_pos_credentials($1)', [retentionDays]);

    const purged: PurgedPosCredential[] = result.rows.map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      pos_system: r.pos_system as PosSystem,
      pos_account_id: r.pos_account_id,
      inactive_reason: r.inactive_reason,
      inactive_since: r.updated_at,
    }));

    // Audit-Inserts in DERSELBEN Tx wie DELETE (Atomicity). Ziel: `audit_log`
    // (tenant-isoliert). Pro Row den Tenant-Context setzen, damit die RLS-INSERT-
    // Policy `tenant_id = current_tenant_id()` fuer gastro_app greift.
    // WICHTIG: GUC-Name ist app.current_tenant (current_tenant_id() liest diesen).
    for (const p of purged) {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [p.tenant_id]);
      await logAuditEvent(client, {
        tenantId: p.tenant_id,
        entityType: 'pos_credentials',
        entityId: p.id,
        eventType: 'pos_credentials.purged',
        actor: { type: 'system', id: actorUserAgent },
        payloadBefore: {
          pos_system: p.pos_system,
          pos_account_id: p.pos_account_id,
          inactive_reason: p.inactive_reason,
          inactive_since: p.inactive_since.toISOString(),
        },
        metadata: { retention_days: retentionDays },
      });
    }

    await client.query('COMMIT');
    return purged;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
