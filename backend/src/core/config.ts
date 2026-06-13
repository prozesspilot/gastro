import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),

  DATABASE_URL: z.string().default('postgres://pp:pp@localhost:5432/prozesspilot'),
  // Optional: separate Owner-Connection für Migrations. In Production läuft
  // Backend-Runtime mit gastro_app-Rolle (non-privileged, kein CREATE auf
  // public-Schema). Migrations brauchen aber CREATE — daher hier optional
  // eine zweite URL mit pp-Owner-Credentials. Fallback: DATABASE_URL.
  DATABASE_URL_MIGRATE: z.string().optional(),
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
  // CLAUDE.md §5.4 — Google Vision API muss in EU-Region laufen (DSGVO).
  // 'eu-vision.googleapis.com' = europe-west3 (Frankfurt). Override nur für
  // Tests/Local-Dev sinnvoll.
  VISION_API_ENDPOINT: z.string().default('eu-vision.googleapis.com'),
  // M01 §15 — Timeout für OCR-Adapter (Default 15 s).
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  // T007 — BullMQ-Worker für OCR. '0' deaktiviert das Auto-Enqueue beim Upload
  // (z. B. in Tests). Standard: aktiv.
  OCR_QUEUE_ENABLED: z
    .string()
    .transform((v) => v !== '0' && v.toLowerCase() !== 'false')
    .default('1'),
  // T007 — Wieviele Vision-API-Calls pro Tenant pro Kalendertag maximal.
  // Schutz vor Runaway-Kosten (M01 Sicherheits-Anker).
  OCR_DAILY_LIMIT_PER_TENANT: z.coerce.number().int().positive().default(1000),
  // T007 — Max. Retry-Versuche pro OCR-Job (BullMQ attempts). Nach Erreichen
  // wird der Beleg auf status='error' gesetzt + Discord-Alert.
  OCR_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // T007 — Discord-Webhook für OCR-Failure-Alerts (optional). Wenn leer, wird
  // nur geloggt — kein extern sichtbarer Side-Effect.
  DISCORD_OPS_WEBHOOK_URL: z.string().default(''),

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

  // ── Webapp-URL ──────────────────────────────────────────────────────────
  // Basis-URL der Mitarbeiter-Webapp (admin.prozesspilot.net). Wird für
  // OAuth-Redirects genutzt (z.B. SumUp-Callback → Webapp-Tenant-Seite).
  WEBAPP_URL: z.string().default('http://localhost:5173'),

  // ── T018: DSGVO-Cleanup fuer POS-Credentials ───────────────────────────
  // Inaktive pos_credentials werden nach dieser Frist (Tage) endgueltig
  // geloescht. Default 30 Tage. Token sind kein Geschaeftsdaten-Bestandteil,
  // fallen nicht unter 10-Jahres-Aufbewahrungspflicht (§ 147 AO).
  POS_CREDENTIALS_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // ── T017: trustProxy für Reverse-Proxy-Setups (IONOS, Caddy) ─────────────
  // Fastify-Konfig fuer req.ip + X-Forwarded-For-Verarbeitung.
  // Akzeptiert:
  //   ''            → Default (Dev/Test): kein Proxy-Trust, req.ip ist die direkte Connection-IP
  //   'true' | '1'  → ALLEN Proxies vertrauen (einfach, aber unsicher in offenen Netzen)
  //   CIDR | IP     → konkrete IONOS-LB-IP/-Range, z. B. '10.0.0.0/8' oder '203.0.113.5'
  //   'a, b, c'     → Komma-getrennte Liste (mehrere CIDRs / IPs)
  // Production-Empfehlung (Sicherheits-Anker T017): IONOS-Loadbalancer-CIDR.
  TRUST_PROXY: z.string().default(''),

  // ── M01: Beleg-Upload ──────────────────────────────────────────────────
  // Maximale Dateigröße beim Upload (Default 20 MB).
  MAX_UPLOAD_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
  // TTL für Presigned-Download-URLs in Sekunden (Default 15 Min).
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // ── T010 / M12: DSGVO ───────────────────────────────────────────────────
  // Max DSGVO-Anträge pro Tenant pro 24h (Missbrauchs-/DoS-Schutz).
  DSGVO_REQUESTS_PER_DAY_LIMIT: z.coerce.number().int().positive().default(5),
  // TTL des Loeschungs-Confirm-Tokens in Sekunden (Default 30 min).
  DSGVO_CONFIRM_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  // ZIP-Export wird nach N Tagen aus MinIO geloescht (Auto-Expire).
  // T010 Review-Fix M2: von 14 auf 3 gesenkt. Signed-URL mit voller PII soll
  // nicht 2 Wochen rumliegen — Leak in Mail-Logs/Browser-History exponiert
  // sonst die Daten dauerhaft. Status-Endpoint regeneriert Signed-URL bei
  // Bedarf (siehe auskunft-status.handler.ts).
  DSGVO_EXPORT_TTL_DAYS: z.coerce.number().int().positive().default(3),
  // BullMQ-Queue fuer DSGVO-Auskunfts-ZIP-Builds. '0' deaktiviert das Auto-
  // Enqueue (z. B. in Tests). Standard: aktiv.
  DSGVO_QUEUE_ENABLED: z
    .string()
    .transform((v) => v !== '0' && v.toLowerCase() !== 'false')
    .default('1'),

  // ── SMTP (geteilt von M04 DATEV-Mail, M09 Lieferanten-Comm, M12 DSGVO) ──
  // Pflicht in Production fuer DSGVO-Auskunfts-Versand. In Dev/Test leer
  // lassen -> Mail wird nur geloggt (Dry-Run-Mode).
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('noreply@prozesspilot.net'),

  // ── M15: SumUp OAuth 2.0 ────────────────────────────────────────────────
  // SumUp Developer Portal → Apps → ProzessPilot POS-Connector
  // Setup: https://developer.sumup.com (App registrieren, Redirect-URI eintragen)
  SUMUP_CLIENT_ID: z.string().default(''),
  SUMUP_CLIENT_SECRET: z.string().default(''),
  SUMUP_REDIRECT_URI: z
    .string()
    .default('https://api.prozesspilot.net/api/v1/m15/oauth/sumup/callback'),
  SUMUP_API_BASE_URL: z.string().default('https://api.sumup.com'),

  // ── M14: Discord OAuth 2.0 ──────────────────────────────────────────────
  // Discord-App-Credentials (Developer Portal → OAuth2)
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  // Redirect-URI muss exakt mit Discord Developer Portal übereinstimmen UND auf
  // den Backend-Callback-Pfad `/api/v1/auth/discord/callback` zeigen (Route
  // `/auth/discord/callback` + Prefix `/api/v1`, via nginx `/api/`-Proxy ans
  // Backend). Ohne `/api/v1` landet Discord auf dem SPA-Fallback → stiller Loop.
  DISCORD_REDIRECT_URI: z
    .string()
    .default('https://admin.prozesspilot.net/api/v1/auth/discord/callback'),
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
  // pgcrypto-Key ist in Production Pflicht — Discord-Tokens, TOTP-Secrets,
  // SumUp-Tokens würden sonst unverschlüsselt gespeichert.
  if (cfg.NODE_ENV === 'production' && !cfg.PP_PGCRYPTO_KEY) {
    console.error(
      'FATAL: PP_PGCRYPTO_KEY fehlt in Production — Token-Encryption inaktiv (Discord, TOTP, SumUp)',
    );
    process.exit(1);
  }

  // T017: TRUST_PROXY ist in Production PFLICHT — sonst zeigt req.ip immer
  // die Reverse-Proxy-IP und das IP-Rate-Limit ist als DoS-Vektor ausnutzbar
  // (ein Angreifer kann Geschaeftsfuehrer aus dem Notfall-Login aussperren).
  // Hard-Fail (Review-Fix M2): besser kein Backend als ein Backend mit
  // gebrochenem Login-Rate-Limit. Recommended: TRUST_PROXY=loopback.
  if (cfg.NODE_ENV === 'production' && !cfg.TRUST_PROXY) {
    console.error(
      'FATAL: TRUST_PROXY fehlt in Production — req.ip waere die Reverse-Proxy-IP, IP-Rate-Limit waere DoS-Vektor (Geschaeftsfuehrer aussperrbar). Setze TRUST_PROXY=loopback (Caddy auf gleichem Host) oder CIDR fuer externen LB.',
    );
    process.exit(1);
  }

  // WEBAPP_URL sollte in Production HTTPS nutzen.
  if (cfg.NODE_ENV === 'production' && !cfg.WEBAPP_URL.startsWith('https://')) {
    console.warn('WARNUNG: WEBAPP_URL in Production sollte mit https:// beginnen');
  }

  // M15 SumUp-OAuth: Warnung wenn Credentials in Production leer sind.
  if (cfg.NODE_ENV === 'production') {
    if (!cfg.SUMUP_CLIENT_ID || !cfg.SUMUP_CLIENT_SECRET) {
      console.warn(
        'WARNUNG: SUMUP_CLIENT_ID oder SUMUP_CLIENT_SECRET nicht gesetzt — M15 POS-Connector inaktiv.',
      );
    }
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
    // Der Discord-Callback ist unter /api/v1/auth/discord/callback registriert.
    // Endet die Redirect-URI auf einem anderen Pfad (klassisch: /api/v1 vergessen),
    // schickt Discord den Browser auf den SPA-Fallback statt ans Backend → der
    // OAuth-Code wird nie getauscht → stiller Login-Loop. Derselbe Wert MUSS im
    // Discord Developer Portal (OAuth2 → Redirects) eingetragen sein.
    if (!cfg.DISCORD_REDIRECT_URI.endsWith('/api/v1/auth/discord/callback')) {
      console.warn(
        `WARNUNG: DISCORD_REDIRECT_URI ("${cfg.DISCORD_REDIRECT_URI}") endet nicht auf "/api/v1/auth/discord/callback" — Discord-Login läuft sonst in einen stillen Loop (Callback trifft den SPA-Fallback statt das Backend). Korrekt z.B. https://admin.prozesspilot.net/api/v1/auth/discord/callback — denselben Wert im Discord Developer Portal eintragen.`,
      );
    }
  }
  return cfg;
}

export const config = loadConfig();
