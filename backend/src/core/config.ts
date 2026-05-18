import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),

  DATABASE_URL: z.string().default('postgres://pp:pp@localhost:5432/prozesspilot'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  MINIO_ENDPOINT: z.string().default('http://localhost:9000'),
  MINIO_ACCESS_KEY: z.string().default('pp'),
  MINIO_SECRET_KEY: z.string().default('pp-secret'),
  MINIO_BUCKET: z.string().default('prozesspilot-raw'),

  PP_HMAC_SECRET: z.string().default(''),
  PP_HMAC_TIMESTAMP_SKEW: z.coerce.number().default(300),
  // '1' = HMAC-Bypass aktiv. In Production VERBOTEN — Backend prüft und beendet sich.
  PP_AUTH_DISABLED: z
    .string()
    .transform((v) => v === '1')
    .default('0'),

  PP_PGCRYPTO_KEY: z.string().default(''),

  N8N_BASE_URL: z.string().default('http://localhost:5678'),
  N8N_BASIC_AUTH_USER: z.string().default('admin'),
  N8N_BASIC_AUTH_PASSWORD: z.string().default(''),
  // Shared secret für eingehende n8n-Webhooks (HMAC-SHA256)
  N8N_WEBHOOK_SECRET: z.string().default(''),

  CLAUDE_API_KEY: z.string().default(''),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
  GOOGLE_VISION_KEY_FILE: z.string().default(''),
  // M01 §15 — Timeout für OCR-Adapter (Default 15 s).
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  // D10: Opt-in Loki-Transport (npm install pino-loki, dann LOKI_URL setzen)
  LOKI_URL: z.string().optional(),

  // ── M10: WhatsApp Eingang ────────────────────────────────────────────────
  // Meta App Secret — wird zur Validierung der X-Hub-Signature-256 genutzt.
  WHATSAPP_APP_SECRET: z.string().default(''),
  // Initiale GET-Verify-Challenge bei Registrierung des Webhooks.
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  // Graph-API-Version (z. B. v19.0). Pro Customer überschreibbar via credential meta.
  WHATSAPP_GRAPH_API_VERSION: z.string().default('v19.0'),
  // Bucket für Original-Belege (M10 verwendet ihn implizit über MINIO_BUCKET;
  // separate Variable folgt der M10-Spec §14 für mögliche zukünftige Trennung).
  STORAGE_RAW_BUCKET: z.string().default('prozesspilot-raw'),

  // ── M07: Google Sheets / Google Drive OAuth ─────────────────────────────
  // Shared OAuth2-Client für Google Drive (M02) und Google Sheets (M07).
  // Pro Customer wird nur Refresh-Token + ggf. Access-Token in
  // customer_credentials hinterlegt; Client-ID/Secret sind global.
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(''),

  // ── M14: Auth (JWT + Refresh-Token + argon2) ────────────────────────────
  // Server-Start verweigert in Production, wenn JWT_SECRET leer ist (min 32 Byte).
  JWT_SECRET: z.string().default(''),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_REFRESH_COOKIE_NAME: z.string().default('pp_refresh'),
  // SameSite Strict für CSRF-Härtung; in Dev kann auch 'lax' nötig sein.
  AUTH_REFRESH_COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  AUTH_REFRESH_COOKIE_SECURE: z
    .string()
    .transform((v) => v === '1' || v === 'true')
    .default('1'),
  // Optional: einmalig zum Bootstrappen des ersten super_admin
  INITIAL_SUPER_ADMIN_EMAIL: z.string().default(''),
  INITIAL_SUPER_ADMIN_PASSWORD: z.string().default(''),

  // ── M14: Discord OAuth 2.0 ──────────────────────────────────────────────
  // Discord-App-Credentials (Developer Portal → OAuth2)
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  // Redirect-URI muss exakt mit Discord Developer Portal übereinstimmen.
  DISCORD_REDIRECT_URI: z.string().default('https://admin.prozesspilot.net/auth/discord/callback'),
  // Guild-ID des ProzessPilot-Team-Servers (Discord-Server).
  // Nur Mitglieder dieses Servers dürfen sich einloggen.
  DISCORD_GUILD_ID: z.string().default(''),
  // Bot-Token für Guild-Membership-Prüfung (GET /guilds/{id}/members/{userId}).
  // Getrennt vom OAuth-Flow — Bot muss im Server mit "Server Members Intent" sein.
  DISCORD_BOT_TOKEN: z.string().default(''),
  // Discord-Rollen-ID für die Geschäftsführer-Rolle im Server.
  // Mitglieder mit dieser Rolle erhalten die interne Rolle 'geschaeftsfuehrer'.
  DISCORD_ROLE_ID_GF: z.string().default(''),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Ungültige ENV-Konfiguration:', result.error.format());
    process.exit(1);
  }
  const cfg = result.data;
  if (cfg.NODE_ENV === 'production' && cfg.PP_AUTH_DISABLED) {
    console.error('FATAL: PP_AUTH_DISABLED=1 ist in Production verboten');
    process.exit(1);
  }
  // M14: JWT_SECRET ist in Production Pflicht (min 32 Zeichen).
  // Im Test/Dev wird ein deterministischer Default eingesetzt, damit Tests laufen.
  if (cfg.NODE_ENV === 'production' && cfg.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET fehlt oder kürzer als 32 Zeichen (M14 Spec §7)');
    process.exit(1);
  }
  // M14 Discord-OAuth: Core-Credentials müssen in Production gesetzt sein.
  if (cfg.NODE_ENV === 'production') {
    if (!cfg.DISCORD_CLIENT_ID) {
      console.error('FATAL: DISCORD_CLIENT_ID fehlt in Production');
      process.exit(1);
    }
    if (!cfg.DISCORD_CLIENT_SECRET) {
      console.error('FATAL: DISCORD_CLIENT_SECRET fehlt in Production');
      process.exit(1);
    }
    if (!cfg.DISCORD_GUILD_ID) {
      console.error('FATAL: DISCORD_GUILD_ID fehlt in Production');
      process.exit(1);
    }
    if (!cfg.DISCORD_BOT_TOKEN) {
      console.error(
        'FATAL: DISCORD_BOT_TOKEN fehlt in Production (M14: Guild-Check nicht möglich)',
      );
      process.exit(1);
    }
    if (!cfg.DISCORD_ROLE_ID_GF) {
      console.warn(
        'WARNUNG: DISCORD_ROLE_ID_GF nicht gesetzt — alle Guild-Mitglieder bekommen Rolle "mitarbeiter". Manuell in DB korrigieren.',
      );
    }
  }
  return cfg;
}

export const config = loadConfig();
