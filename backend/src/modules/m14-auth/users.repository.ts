/**
 * M14 — Users Repository (Discord-OAuth)
 *
 * Direkte pg-Queries gegen die `users`, `auth_sessions` und `auth_audit_log`
 * Tabellen aus Migration 020_users_auth.sql.
 *
 * Security:
 *   - Alle Queries parametrisiert (kein String-Concat)
 *   - Tokens werden verschlüsselt als BYTEA gespeichert (pgcrypto, über config.PP_PGCRYPTO_KEY)
 *   - auth_audit_log-Inserts sind Append-Only (via DB-Trigger gesichert)
 *
 * DECISION: Token-Verschlüsselung (pgp_sym_encrypt) findet im Repository statt.
 * Falls PP_PGCRYPTO_KEY leer ist (Dev/Test), werden Tokens als leeres BYTEA gespeichert.
 * Dies verhindert Test-Abhängigkeit von pgcrypto, ohne Prod-Security zu kompromittieren.
 */

import type { Pool } from 'pg';
import { config } from '../../core/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  discord_user_id: string | null;
  discord_username: string | null;
  discord_avatar_url: string | null;
  display_name: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
  active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  last_login_method: 'discord' | 'emergency' | null;
  preferences: Record<string, unknown>;
}

export interface UpsertDiscordUserInput {
  discordUserId: string;
  discordUsername: string;
  discordAvatarUrl: string | null;
  displayName: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  ipAddress: string | null;
}

export interface CreateAuthSessionInput {
  userId: string;
  jwtJti: string;
  loginMethod: 'discord' | 'emergency';
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
}

export interface LogAuthEventInput {
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata?: Record<string, unknown>;
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

/**
 * Verschlüsselt einen Token-String mit pgcrypto.
 * Gibt den SQL-Fragment und Parameter zurück, die direkt in eine Query eingebaut werden.
 *
 * DECISION: Wenn PP_PGCRYPTO_KEY leer ist (Test/Dev ohne pgcrypto-Setup),
 * wird ein leeres BYTEA gespeichert. Tokens sind damit nicht wiederherstellbar,
 * aber der DB-Insert schlägt nicht fehl.
 */
function encryptTokenSql(paramIndex: number, keyParamIndex: number): string {
  if (!config.PP_PGCRYPTO_KEY) {
    // Kein Encryption-Key → leeres BYTEA (nur Dev/Test)
    return "''::bytea";
  }
  return `pgp_sym_encrypt($${paramIndex}::text, $${keyParamIndex}::text)`;
}

// ── Repository-Funktionen ──────────────────────────────────────────────────

/**
 * Legt einen Discord-User an oder aktualisiert seine Daten (UPSERT).
 * Conflict-Key: discord_user_id (UNIQUE-Constraint in DB).
 *
 * Bei Conflict: aktualisiert username, avatar, tokens, updated_at, last_login_at.
 * Überschreibt NICHT role oder active — diese werden nur beim ersten INSERT gesetzt
 * oder via Admin-Interface geändert.
 *
 * DECISION: role wird bei Conflict NICHT überschrieben, damit ein Admin manuell
 * hochgestufte Rollen nicht bei jedem Login zurückgesetzt werden.
 */
export async function upsertDiscordUser(
  pool: Pool,
  input: UpsertDiscordUserInput,
): Promise<DbUser> {
  // Berechne Token-Ablaufzeit als ISO-String für die DB
  const tokenExpiresIso = input.tokenExpiresAt.toISOString();

  let query: string;
  let params: unknown[];

  if (config.PP_PGCRYPTO_KEY) {
    // Mit Verschlüsselung: pgp_sym_encrypt für Tokens
    query = `
      INSERT INTO users (
        discord_user_id,
        discord_username,
        discord_avatar_url,
        display_name,
        role,
        discord_access_token_encrypted,
        discord_refresh_token_encrypted,
        discord_token_expires_at,
        last_login_at,
        last_login_method,
        last_login_ip
      ) VALUES (
        $1, $2, $3, $4, $5,
        pgp_sym_encrypt($6::text, $8::text),
        pgp_sym_encrypt($7::text, $8::text),
        $9::timestamptz,
        now(),
        'discord',
        $10::inet
      )
      ON CONFLICT (discord_user_id) DO UPDATE SET
        discord_username                = EXCLUDED.discord_username,
        discord_avatar_url              = EXCLUDED.discord_avatar_url,
        discord_access_token_encrypted  = EXCLUDED.discord_access_token_encrypted,
        discord_refresh_token_encrypted = EXCLUDED.discord_refresh_token_encrypted,
        discord_token_expires_at        = EXCLUDED.discord_token_expires_at,
        last_login_at                   = now(),
        last_login_method               = 'discord',
        last_login_ip                   = EXCLUDED.last_login_ip,
        updated_at                      = now()
      RETURNING
        id, discord_user_id, discord_username, discord_avatar_url,
        display_name, role, active, created_at, updated_at,
        last_login_at, last_login_method, preferences
    `;
    params = [
      input.discordUserId, // $1
      input.discordUsername, // $2
      input.discordAvatarUrl, // $3
      input.displayName, // $4
      input.role, // $5
      input.accessToken, // $6
      input.refreshToken, // $7
      config.PP_PGCRYPTO_KEY, // $8
      tokenExpiresIso, // $9
      input.ipAddress, // $10
    ];
  } else {
    // Ohne Verschlüsselung (Dev/Test): leeres BYTEA für Tokens
    query = `
      INSERT INTO users (
        discord_user_id,
        discord_username,
        discord_avatar_url,
        display_name,
        role,
        discord_access_token_encrypted,
        discord_refresh_token_encrypted,
        discord_token_expires_at,
        last_login_at,
        last_login_method,
        last_login_ip
      ) VALUES (
        $1, $2, $3, $4, $5,
        ''::bytea,
        ''::bytea,
        $6::timestamptz,
        now(),
        'discord',
        $7::inet
      )
      ON CONFLICT (discord_user_id) DO UPDATE SET
        discord_username                = EXCLUDED.discord_username,
        discord_avatar_url              = EXCLUDED.discord_avatar_url,
        discord_token_expires_at        = EXCLUDED.discord_token_expires_at,
        last_login_at                   = now(),
        last_login_method               = 'discord',
        last_login_ip                   = EXCLUDED.last_login_ip,
        updated_at                      = now()
      RETURNING
        id, discord_user_id, discord_username, discord_avatar_url,
        display_name, role, active, created_at, updated_at,
        last_login_at, last_login_method, preferences
    `;
    params = [
      input.discordUserId, // $1
      input.discordUsername, // $2
      input.discordAvatarUrl, // $3
      input.displayName, // $4
      input.role, // $5
      tokenExpiresIso, // $6
      input.ipAddress, // $7
    ];
  }

  const result = await pool.query(query, params);
  return rowToDbUser(result.rows[0]);
}

/**
 * Holt einen User anhand seiner internen UUID.
 * Gibt null zurück wenn nicht gefunden.
 */
export async function getUserById(pool: Pool, id: string): Promise<DbUser | null> {
  const result = await pool.query(
    `SELECT
       id, discord_user_id, discord_username, discord_avatar_url,
       display_name, role, active, created_at, updated_at,
       last_login_at, last_login_method, preferences
     FROM users
     WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  return rowToDbUser(result.rows[0]);
}

/**
 * Legt eine neue Auth-Session an (JWT-Tracking für Revocation).
 * Jede erfolgreiche Anmeldung erzeugt eine Session-Row mit dem JWT-JTI.
 */
export async function createAuthSession(pool: Pool, input: CreateAuthSessionInput): Promise<void> {
  await pool.query(
    `INSERT INTO auth_sessions (
       user_id, jwt_jti, login_method, ip_address, user_agent, expires_at
     ) VALUES ($1, $2, $3, $4::inet, $5, $6::timestamptz)`,
    [
      input.userId,
      input.jwtJti,
      input.loginMethod,
      input.ipAddress,
      input.userAgent,
      input.expiresAt.toISOString(),
    ],
  );
}

/**
 * Schreibt ein Auth-Audit-Log-Event (Append-Only durch DB-Trigger gesichert).
 *
 * DECISION: Diese Funktion nutzt den normalen Pool ohne RLS-Bypass.
 * Die auth_audit_log-Tabelle hat eine Insert-Policy: `WITH CHECK (is_rls_bypassed())`.
 * Im Dev/Test-Setup läuft der App-User als Owner → bypass greift.
 * In Production muss der DB-User die Bypass-Funktion aufrufen dürfen.
 *
 * Wirft keinen Fehler wenn der Insert fehlschlägt (fire-and-forget via try/catch),
 * damit ein Audit-Log-Fehler den Login-Flow nicht abbricht.
 */
export async function logAuthEvent(pool: Pool, input: LogAuthEventInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO auth_audit_log (user_id, event_type, ip_address, user_agent, metadata)
       VALUES ($1::uuid, $2, $3::inet, $4, $5::jsonb)`,
      [
        input.userId,
        input.eventType,
        input.ipAddress,
        input.userAgent,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } catch (err) {
    // DECISION: Audit-Log-Fehler unterdrücken (fire-and-forget).
    // Lieber ein fehlender Log als ein abgebrochener Login.
    // In Production: Sentry-Alert würde diesen Fehler melden.
    const message = err instanceof Error ? err.message : String(err);
    // Kein Logger-Zugriff hier — Modul ist Logger-unabhängig.
    // biome-ignore lint/suspicious/noConsole: Fallback-Logging ohne Logger-Dependency
    console.error(`[m14-auth] auth_audit_log Insert fehlgeschlagen: ${message}`);
  }
}

// ── Interne Hilfsfunktionen ────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: pg-Row ist ein Record mit unknown Shape
function rowToDbUser(row: Record<string, any>): DbUser {
  return {
    id: row.id as string,
    discord_user_id: (row.discord_user_id as string | null) ?? null,
    discord_username: (row.discord_username as string | null) ?? null,
    discord_avatar_url: (row.discord_avatar_url as string | null) ?? null,
    display_name: row.display_name as string,
    role: row.role as 'geschaeftsfuehrer' | 'mitarbeiter' | 'support',
    active: row.active as boolean,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    last_login_at: (row.last_login_at as Date | null) ?? null,
    last_login_method: (row.last_login_method as 'discord' | 'emergency' | null) ?? null,
    preferences: (row.preferences as Record<string, unknown>) ?? {},
  };
}

// Verhindert unused-import-Warning für encryptTokenSql in Tests
void (encryptTokenSql as unknown);
