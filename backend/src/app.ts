import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { hmacMiddleware } from './core/auth/hmac.middleware';
import { config } from './core/config';
import { requestLoggingPlugin } from './core/hooks/request-logging';
import { logger } from './core/logger';
import { httpRequestDuration, httpRequestsTotal, registry } from './core/metrics';
import { captureException } from './core/sentry';
import { createS3Client } from './core/storage/storage.service';
import { startWorker as startWebhookWorker } from './core/webhooks/webhook.queue';
// F1 (T047): nur noch die lebende belege/tenants-Welt + Auth + Health/SSE/Docs/Webhooks.
// Die tote /receipts+/customers-Welt (M02/M04/M06–M11, customers/receipts/profiles,
// routing, plugin-system, users, alt-Pfade von M01/M05/M12) wurde entfernt.
import { dsgvoV2Routes } from './modules/dsgvo/dsgvo-v2.routes';
import { chatPublicRoutes, chatStaffRoutes } from './modules/m-webchat/webchat.routes';
import { belegeRoutes } from './modules/m01-receipt-intake/belege.routes';
import { belegeCategorizeRoutes } from './modules/m03-categorization/belege-categorize.routes';
import { categoriesRoutes } from './modules/m03-categorization/categories.routes';
import { belegeLexwareRoutes } from './modules/m05-lexoffice/belege-routes';
import { discordAuthRoutes } from './modules/m14-auth/auth.routes';
import { emergencyLoginRoutes } from './modules/m14-auth/emergency-login.routes';
import { kasseRoutes } from './modules/m15-pos-connector/kasse.routes';
import { sumupOauthRoutes } from './modules/m15-pos-connector/oauth.routes';
import { wizardPublicRoutes, wizardStaffRoutes } from './modules/m16-wizard/wizard.routes';
import { docsRoutes } from './routes/docs';
import { healthRoutes } from './routes/health';
import { sseRoutes } from './routes/sse';
import { tenantsRoutes } from './routes/tenants.routes';
import { webhookRoutes } from './routes/webhooks';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    redis: InstanceType<typeof Redis>;
    // s3 wird via app.decorate('s3', createS3Client()) gesetzt (optional, da auch in m01 per deps injiziert)
    s3?: import('@aws-sdk/client-s3').S3Client;
  }
  interface FastifyRequest {
    // Decision: startTime für HTTP-Metriken, gesetzt im onRequest-Hook
    startTime?: number;
    // rawBody: Buffer für HMAC-Signaturberechnung
    rawBody?: Buffer;
  }
}

/**
 * T017: Parst die TRUST_PROXY-ENV-Variable in den von Fastify erwarteten Typ.
 *
 * Akzeptiert:
 *   ''            → false (kein Proxy-Trust)
 *   'true' | '1'  → true  (allen Proxies vertrauen)
 *   'loopback'    → string 'loopback' (Fastify/proxy-addr-Keyword: 127.0.0.1 + ::1)
 *   CIDR / IP     → string
 *   'a, b, c'     → string[]
 *
 * Exportiert für Test-Wiederverwendung (Review-Fix NH1: keine Duplikation).
 */
export function parseTrustProxy(raw: string): boolean | string | string[] {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  if (trimmed === 'true' || trimmed === '1') return true;
  // Komma-Liste → string[]
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return trimmed;
}

// biome-ignore lint/suspicious/noExplicitAny: Fastify-Generics erfordern explizite any für custom Logger-Typ
export async function buildApp(): Promise<FastifyInstance<any, any, any, any>> {
  const app = Fastify({
    // Im Test-Modus kein Logging-Output; sonst eigene Pino-Instanz
    logger: config.NODE_ENV === 'test' ? false : logger,
    // T017: req.ip + X-Forwarded-For-Verarbeitung hinter Reverse-Proxy
    //   (IONOS Loadbalancer + Caddy). Pflicht in Production fuer korrektes
    //   IP-Rate-Limiting (Notfall-Login, @fastify/rate-limit global).
    //   Default in Dev/Test: false (req.ip = direkte Connection-IP).
    trustProxy: parseTrustProxy(config.TRUST_PROXY),
  });

  const db = new Pool({ connectionString: config.DATABASE_URL });
  // lazyConnect: keine automatische Verbindung beim Start — erst bei erstem Command
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true });

  app.decorate('db', db);
  app.decorate('redis', redis);
  app.decorate('s3', createS3Client());

  // D3: Rohen Request-Body als Buffer in req.rawBody ablegen,
  // damit die HMAC-Middleware ihn für die Signaturberechnung nutzen kann.
  // Muss vor allen Routen registriert werden.
  app.addContentTypeParser(
    [
      'application/json',
      'text/plain',
      'application/octet-stream',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/webp',
    ],
    { parseAs: 'buffer' },
    (req, body, done) => {
      req.rawBody = body as Buffer;
      // JSON-Payload zusätzlich parsen, damit req.body weiterhin befüllt ist
      if (req.headers['content-type']?.startsWith('application/json')) {
        try {
          done(null, JSON.parse((body as Buffer).toString('utf-8')));
        } catch (err) {
          done(err as Error);
        }
      } else {
        done(null, body);
      }
    },
  );

  // D10: Request-Logging + TraceContext — direkt aufrufen (kein register()),
  // damit die Hooks global auf der Root-Instanz landen und für alle Routen gelten.
  await requestLoggingPlugin(app);

  // ── Prometheus: HTTP-Request-Metriken ─────────────────────────────────────
  // Decision: onRequest/onResponse-Hooks auf Root-Ebene für vollständige Abdeckung.
  // /metrics selbst wird nicht gemessen (exclude via Route-Check im onResponse).
  app.addHook('onRequest', async (request, _reply) => {
    request.startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url;
    // /metrics-Scraping nicht selbst in Metriken aufnehmen (vermeidet Rauschen)
    if (route === '/metrics') return;
    const duration = (Date.now() - (request.startTime ?? Date.now())) / 1000;
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };
    httpRequestDuration.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  });

  // ── Prometheus: /metrics Scrape-Endpoint ─────────────────────────────────
  // Decision: Kein Auth auf /metrics — Endpoint ist intern (nicht in /api/v1).
  // In Produktion über Firewall/Netzwerk-Policy absichern.
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // Security: Rate-Limiting — global 100 req/min pro Tenant oder IP (A05 OWASP)
  // Deaktiviert in Test-Modus um Tests nicht zu blockieren
  if (config.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      global: true,
      max: 100,
      timeWindow: '1 minute',
      keyGenerator: (req) => (req.headers['x-pp-tenant-id'] as string) || req.ip,
      errorResponseBuilder: (_req, _ctx) => ({
        ok: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Zu viele Anfragen. Bitte warte eine Minute.',
        },
      }),
    });
  }

  // M01: Multipart-Plugin für Beleg-Upload (max 20 MB, konfigurierbar)
  // DECISION: Registrierung VOR Cookie-Plugin und Auth-Routes, damit das Plugin
  // global verfügbar ist. limits.fileSize ist der erste Schutzwall gegen zu große Dateien.
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_SIZE_BYTES },
  });

  // M14: Cookie-Plugin für Refresh-Token-Cookie (HttpOnly, Secure, SameSite)
  await app.register(cookie);

  // M14: Auth-Routes — KEIN HMAC. JWT-geschützte Routes haben eigene Middleware.
  // Registriert VOR dem HMAC-Block, damit /api/v1/auth/* nicht durch HMAC läuft.
  // M14 Discord-OAuth-Routes (Reboot): /api/v1/auth/discord/login + /callback
  await app.register(discordAuthRoutes, { prefix: '/api/v1' });
  await app.register(emergencyLoginRoutes, { prefix: '/api/v1/auth' });
  // M15 SumUp-OAuth-Routes — VOR HMAC-Block (Callback ist öffentlicher Redirect-Endpoint)
  // /api/v1/m15/oauth/sumup/start, /api/v1/m15/oauth/sumup/callback, /api/v1/m15/sumup/disconnect/:tenantId
  await app.register(sumupOauthRoutes, { prefix: '/api/v1' });
  // T005/M15: Kasse-Sync + Z-Bon-Liste — JWT-geschuetzt unter /api/v1/m15
  await app.register(kasseRoutes, { prefix: '/api/v1/m15' });
  // M01 Belege-Routes — VOR HMAC-Block (JWT-geschützt, nicht HMAC)
  // /api/v1/belege/upload, /api/v1/belege, /api/v1/belege/:id
  await app.register(belegeRoutes, { prefix: '/api/v1/belege' });
  // T009/M05: Lexware-Office-Export-Routes — /api/v1/belege/:id/exports/lexware
  // und /api/v1/exports/lexware/batch (JWT-geschuetzt, nicht HMAC).
  await app.register(belegeLexwareRoutes, { prefix: '/api/v1' });
  // T048/M03/F2: Kategorisieren auf belege — /api/v1/belege/:id/categorize (JWT)
  await app.register(belegeCategorizeRoutes, { prefix: '/api/v1' });
  // T058/A3: Staff-Tenant-Listing — GET /api/v1/tenants (JWT, cross-tenant via
  // SECURITY-DEFINER list_tenants_for_staff(); KEIN TenantContext)
  await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
  // T016/Phase B: Onboarding-Wizard — VOR HMAC-Block.
  //  - Staff-Plugin (Session-Erstellung): m14StaffAuthHook + m14TenantContextHook
  //  - Public-Plugin (Wirt, Token = Credential): kein Staff-Cookie
  // Beide unter /api/v1/wizard; keine Route-Kollision (POST /sessions vs. /:token/*).
  await app.register(wizardStaffRoutes, { prefix: '/api/v1/wizard' });
  await app.register(wizardPublicRoutes, { prefix: '/api/v1/wizard' });
  // T068/Phase C: Web-Chat-Widget — VOR HMAC-Block.
  //  - Staff-Plugin (Session erzeugen/widerrufen): m14StaffAuthHook + m14TenantContextHook
  //  - Public-Plugin (Wirt, Token = Credential): kein Staff-Cookie
  // Beide unter /api/v1/chat; keine Route-Kollision (POST /sessions vs. GET /:token).
  await app.register(chatStaffRoutes, { prefix: '/api/v1/chat' });
  await app.register(chatPublicRoutes, { prefix: '/api/v1/chat' });
  // T010/M12: Neue DSGVO-Routen (JWT + Two-Step + Rate-Limit) — VOR HMAC-Block
  // /api/v1/dsgvo/auskunft, /api/v1/dsgvo/auskunft/:id,
  // /api/v1/dsgvo/loeschung, /api/v1/dsgvo/loeschung/confirm
  await app.register(dsgvoV2Routes, { prefix: '/api/v1/dsgvo' });

  // Öffentliche Endpoints — kein Auth (D1)
  await app.register(healthRoutes, { prefix: '/api/v1' });

  // SSE-Endpoint — öffentlich (Webapp subscribt direkt, ohne HMAC)
  await app.register(sseRoutes, { prefix: '/api/v1' });

  // OpenAPI-Doku — öffentlich
  await app.register(docsRoutes);

  // D7: Webhook-Empfänger für n8n (kein HMAC, eigene Signaturprüfung)
  await app.register(webhookRoutes, { prefix: '/webhooks' });

  // /api/v1 — HMAC-Auth (D3). Nach F1 (T047) nur noch die lebende Kategorien-Liste;
  // die tote /receipts+/customers-Welt wurde entfernt (siehe CLAUDE.md §3).
  await app.register(
    async (apiApp) => {
      apiApp.addHook('preHandler', hmacMiddleware);
      // M03 Kategorien-Liste (GET /categories, in-memory SYSTEM_CATEGORIES)
      await apiApp.register(categoriesRoutes, { prefix: '/categories' });
    },
    { prefix: '/api/v1' },
  );

  // Webhook-Retry-Worker — nicht im Test, um zufällige DB-Zugriffe nach
  // Test-Cleanup zu vermeiden.
  const stopWorker = config.NODE_ENV === 'test' ? (): void => undefined : startWebhookWorker(db);

  app.addHook('onClose', async () => {
    stopWorker();
    await db.end();
    redis.disconnect();
  });

  // Fehler-Handler: In Produktion keine Stack-Traces oder DB-Fehlermeldungen leaken (A03 OWASP)
  if (config.NODE_ENV === 'production') {
    app.setErrorHandler((error, request, reply) => {
      logger.error({ err: error }, 'Unbehandelter Fehler');
      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 400 && statusCode < 500) {
        // Client-Fehler: sichere Nachricht weitergeben
        reply.code(statusCode).send({
          ok: false,
          error: { code: error.code ?? 'CLIENT_ERROR', message: error.message },
        });
      } else {
        // Server-Fehler: an Sentry melden + keine Details nach außen leaken
        captureException(error, {
          tenant_id: request.headers['x-tenant-id'],
          method: request.method,
          url: request.url,
        });
        reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' },
        });
      }
    });
  } else {
    // Dev + Test: Fehler sichtbar machen — process.stderr bypasses vitest capture
    app.setErrorHandler((error, request, reply) => {
      process.stderr.write(`\n[Fastify Error] ${error.message}\n${error.stack ?? ''}\n`);
      // Dev: Sentry ebenfalls informieren wenn SENTRY_DSN gesetzt (z.B. Staging-DSN)
      if ((error.statusCode ?? 500) >= 500) {
        captureException(error, {
          tenant_id: request.headers['x-tenant-id'],
          method: request.method,
          url: request.url,
        });
      }
      reply.code(error.statusCode ?? 500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      });
    });
  }

  return app;
}
