/**
 * M14 — Discord OAuth 2.0 Service
 *
 * Kapselt alle Discord-API-Calls:
 *   - OAuth-URL-Generierung (authorize endpoint)
 *   - Code-zu-Token-Tausch (token endpoint)
 *   - User-Info-Abruf (/users/@me)
 *   - Guild-Membership-Prüfung (/guilds/{id}/members/{userId}) via Bot-Token
 *   - Rollen-Mapping: Discord-Rollen-IDs → interne Rolle
 *
 * Security: Tokens werden NICHT geloggt (nur discord_user_id und username).
 */

import { config } from '../../core/config';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_OAUTH_AUTHORIZE = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_ENDPOINT = `${DISCORD_API_BASE}/oauth2/token`;

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiscordTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // Sekunden
  token_type: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
}

export interface GuildMember {
  user: DiscordUser;
  roles: string[]; // Array von Rollen-IDs (als String)
  nick: string | null;
  joined_at: string;
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

/**
 * Gibt den OAuth-Authorization-URL mit CSRF-State-Token zurück.
 * Scopes: `identify` (User-Info) + `guilds` (Guild-Liste für Zugehörigkeit)
 *
 * DECISION: Wir prüfen Guild-Membership über den Bot-Token statt via
 * `guilds`-Scope, weil der Bot direkten Zugriff auf Member-Roles hat.
 * Der Scope `identify` reicht für den User-Info-Abruf.
 */
export function buildDiscordAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    redirect_uri: config.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  // KEIN prompt=none: das triggert bei Discord einen Deep-Link in die Desktop-App
  // ("zurück zum Browser") statt einer regulären Browser-Authorize-Seite.
  // Discord zeigt den Consent-Screen ohnehin nur beim ERSTEN Login pro App — danach
  // wird direkt der Code zurückgegeben, kein Re-Consent.
  return `${DISCORD_OAUTH_AUTHORIZE}?${params.toString()}`;
}

/**
 * Tauscht den OAuth-Authorization-Code gegen Access- und Refresh-Token.
 * Wirft einen Fehler bei Discord-API-Fehlern (HTTP 4xx/5xx).
 */
export async function exchangeCodeForTokens(code: string): Promise<DiscordTokens> {
  const body = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    client_secret: config.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.DISCORD_REDIRECT_URI,
  });

  const response = await fetch(DISCORD_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unbekannter Fehler');
    // SECURITY: kein Logging von Code oder Client-Secret
    throw new DiscordApiError(
      `Token-Exchange fehlgeschlagen (HTTP ${response.status})`,
      response.status,
      errorText,
    );
  }

  const data = (await response.json()) as DiscordTokens;
  return data;
}

/**
 * Ruft die Discord-User-Daten für den aktuell eingeloggten User ab.
 * Nutzt den Access-Token aus dem OAuth-Flow (Bearer-Auth).
 */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: {
      // SECURITY: Token nur im Authorization-Header, nicht geloggt
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unbekannter Fehler');
    throw new DiscordApiError(
      `User-Info-Abruf fehlgeschlagen (HTTP ${response.status})`,
      response.status,
      errorText,
    );
  }

  return response.json() as Promise<DiscordUser>;
}

/**
 * Prüft ob ein Discord-User Mitglied des konfigurierten Guilds ist.
 * Nutzt den Bot-Token (nicht den User-Access-Token).
 *
 * Gibt null zurück, wenn der User NICHT im Guild ist (404 von Discord).
 * Wirft bei anderen Fehlern (403, 5xx usw.) einen DiscordApiError.
 */
export async function checkGuildMembership(discordUserId: string): Promise<GuildMember | null> {
  const guildId = config.DISCORD_GUILD_ID;
  const botToken = config.DISCORD_BOT_TOKEN;

  // Im Dev/Test: falls Guild-ID oder Bot-Token fehlt, kein Fehler — gibt null zurück.
  // DECISION: Wir wollen Tests nicht zwingen, Discord-Credentials zu haben.
  // In Production prüft config.ts, dass DISCORD_GUILD_ID gesetzt ist.
  if (!guildId || !botToken) {
    return null;
  }

  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}`, {
    headers: {
      // SECURITY: Bot-Token nur im Authorization-Header, nicht geloggt
      Authorization: `Bot ${botToken}`,
    },
  });

  // 404: User ist nicht im Guild
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unbekannter Fehler');
    throw new DiscordApiError(
      `Guild-Membership-Prüfung fehlgeschlagen (HTTP ${response.status})`,
      response.status,
      errorText,
    );
  }

  return response.json() as Promise<GuildMember>;
}

/**
 * Mappt Discord-Rollen-IDs auf interne ProzessPilot-Rollen.
 *
 * Regeln:
 *   - Falls DISCORD_ROLE_ID_GF in memberRoles → 'geschaeftsfuehrer'
 *   - Sonst → 'mitarbeiter' (safe default)
 *
 * DECISION: 'support' wird nicht via Discord-Rolle gesetzt (noch keine Rolle
 * dafür konfigurierbar). Support-Accounts werden manuell in DB angelegt.
 */
export function mapDiscordRoleToInternalRole(
  memberRoles: string[],
): 'geschaeftsfuehrer' | 'mitarbeiter' {
  const gfRoleId = config.DISCORD_ROLE_ID_GF;
  if (gfRoleId && memberRoles.includes(gfRoleId)) {
    return 'geschaeftsfuehrer';
  }
  return 'mitarbeiter';
}

// ── Error-Klasse ───────────────────────────────────────────────────────────

/**
 * Fehler bei Discord-API-Calls. Enthält HTTP-Status für Upstream-Fehlerbehandlung.
 */
export class DiscordApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly discordErrorBody: string,
  ) {
    super(message);
    this.name = 'DiscordApiError';
  }
}
