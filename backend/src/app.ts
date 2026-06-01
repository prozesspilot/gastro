import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { hmacMiddleware } from './core/auth/hmac.middleware';
import { config } from './core/config';
import { setHookRunnerDeps } from './core/hooks/hook-runner';
import { hookRoutes } from './core/hooks/hook.routes';
import { requestLoggingPlugin } from './core/hooks/request-logging';
import { logger } from './core/logger';
import { httpRequestDuration, httpRequestsTotal, registry } from './core/metrics';
import { captureException } from './core/sentry';
import { createS3Client } from './core/storage/storage.service';
import { startWorker as startWebhookWorker } from './core/webhooks/webhook.queue';
import { internalCustomersRoutes } from './modules/_shared/customers/internal.routes';
import { operatorNotificationsRoutes } from './modules/_shared/customers/notifications.routes';
import { errorRoutes } from './modules/_shared/errors/error.routes';
import { receiptsCompleteRoutes } from './modules/_shared/receipts/complete.routes';
import { customerRoutes } from './modules/customers/customer.routes';
import { documentRoutes } from './modules/documents/document.routes';
import { dsgvoV2Routes } from './modules/dsgvo/dsgvo-v2.routes';
import { dsgvoRoutes } from './modules/dsgvo/routes';
import { invoiceRoutes } from './modules/invoices/invoice.routes';
import { belegeRoutes } from './modules/m01-receipt-intake/belege.routes';
import { m01ReceiptIntakeRoutes } from './modules/m01-receipt-intake/routes';
import { m02ArchiveRoutes } from './modules/m02-archive/routes';
import { categoriesRoutes } from './modules/m03-categorization/categories.routes';
import { m03CategorizationRoutes } from './modules/m03-categorization/routes';
import { m03OcrRoutes } from './modules/m03-ocr/ocr.routes';
import { m04DatevRoutes } from './modules/m04-datev/routes';
import { belegeLexwareRoutes } from './modules/m05-lexoffice/belege-routes';
import {
  m05CustomerLexofficeRoutes,
  m05IntegrationRoutes,
  m05LexofficeRoutes,
} from './modules/m05-lexoffice/routes';
import { m06AdvisorPortalRoutes } from './modules/m06-advisor-portal/routes';
import {
  m06CustomerSevdeskRoutes,
  m06IntegrationRoutes,
  m06SevdeskRoutes,
} from './modules/m06-sevdesk/routes';
import { m07SpreadsheetRoutes } from './modules/m07-spreadsheet/routes';
import { m08ReportingRoutes } from './modules/m08-reporting/routes';
import {
  m09CommunicationRoutes,
  m09InboundWebhookRoutes,
} from './modules/m09-supplier-comm/routes';
import { m10WhatsAppRoutes } from './modules/m10-whatsapp/routes';
import { m11ImapRoutes } from './modules/m11-imap/routes';
import { discordAuthRoutes } from './modules/m14-auth/auth.routes';
import { emergencyLoginRoutes } from './modules/m14-auth/emergency-login.routes';
import { kasseRoutes } from './modules/m15-pos-connector/kasse.routes';
import { sumupOauthRoutes } from './modules/m15-pos-connector/oauth.routes';
import { pluginSystemRoutes } from './modules/plugin-system/routes';
import { internalProfileRoutes, profileRoutes } from './modules/profiles/profile.routes';
import { receiptRoutes } from './modules/receipts/receipt.routes';
import { reportRoutes } from './modules/reports/report.routes';
import { routingPlanRoutes } from './modules/routing/plan.routes';
import { routingRoutes } from './modules/routing/routing.routes';
import { statsRoutes } from './modules/stats/routes';
import { tenantRoutes } from './modules/tenants/tenant.routes';
import { authProtectedRoutes, authPublicRoutes, usersRoutes } from './modules/users/routes';
import { docsRoutes } from './routes/docs';
import { healthRoutes } from './routes/health';
import { sseRoutes } from './routes/sse';
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

  // Hook-Runner verdrahten — lädt customer_hooks aus DB, signiert HTTP-Hooks.
  setHookRunnerDeps({ pool: db, pgcryptoKey: config.PP_PGCRYPTO_KEY });

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
  // T010/M12: Neue DSGVO-Routen (JWT + Two-Step + Rate-Limit) — VOR HMAC-Block
  // /api/v1/dsgvo/auskunft, /api/v1/dsgvo/auskunft/:id,
  // /api/v1/dsgvo/loeschung, /api/v1/dsgvo/loeschung/confirm
  await app.register(dsgvoV2Routes, { prefix: '/api/v1/dsgvo' });
  await app.register(authPublicRoutes, { prefix: '/api/v1/auth' });
  await app.register(authProtectedRoutes, { prefix: '/api/v1/auth' });
  await app.register(usersRoutes, { prefix: '/api/v1/users' });

  // Öffentliche Endpoints — kein Auth (D1)
  await app.register(healthRoutes, { prefix: '/api/v1' });

  // SSE-Endpoint — öffentlich (Webapp subscribt direkt, ohne HMAC)
  await app.register(sseRoutes, { prefix: '/api/v1' });

  // OpenAPI-Doku — öffentlich
  await app.register(docsRoutes);

  // D7: Webhook-Empfänger für n8n (kein HMAC, eigene Signaturprüfung)
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  // M09 Inbound-Mail-Webhook (kein HMAC — Mailgun/Postmark Webhook-Format)
  await app.register(m09InboundWebhookRoutes, { prefix: '/webhooks' });

  // /api/v1 — HMAC-Auth bewacht alle API-Routen (D3)
  await app.register(
    async (apiApp) => {
      apiApp.addHook('preHandler', hmacMiddleware);
      await apiApp.register(tenantRoutes, { prefix: '/tenants' });
      await apiApp.register(customerRoutes, { prefix: '/customers' });
      await apiApp.register(profileRoutes, { prefix: '/customers' });
      await apiApp.register(internalProfileRoutes, { prefix: '/internal' });
      await apiApp.register(documentRoutes, { prefix: '/documents' });
      await apiApp.register(routingRoutes, { prefix: '/routing' });
      await apiApp.register(m10WhatsAppRoutes, { prefix: '/internal/whatsapp' });
      await apiApp.register(m11ImapRoutes, { prefix: '/internal/imap' });
      await apiApp.register(receiptRoutes, { prefix: '/receipts' });
      await apiApp.register(m01ReceiptIntakeRoutes, { prefix: '/receipts' });
      await apiApp.register(m02ArchiveRoutes, { prefix: '/receipts' });
      await apiApp.register(m03OcrRoutes, { prefix: '/receipts' });
      // M03 Kategorisierung — Endpoint POST /receipts/:id/categorize
      await apiApp.register(m03CategorizationRoutes, { prefix: '/receipts' });
      // M03 Kategorien-Liste (GET /categories)
      await apiApp.register(categoriesRoutes, { prefix: '/categories' });
      // M05 Lexoffice-Push (POST /receipts/:id/exports/lexoffice)
      await apiApp.register(m05LexofficeRoutes, { prefix: '/receipts' });
      // M05 Customer-Exports (GET /customers/:id/exports/lexoffice)
      await apiApp.register(m05CustomerLexofficeRoutes, { prefix: '/customers' });
      // M05 Integration-Test + Sync (POST /integrations/lexoffice/test|sync-categories)
      await apiApp.register(m05IntegrationRoutes, { prefix: '/integrations/lexoffice' });
      // M06 sevDesk Push (POST /receipts/:id/exports/sevdesk)
      await apiApp.register(m06SevdeskRoutes, { prefix: '/receipts' });
      // M06 Customer-Exports (GET /customers/:id/exports/sevdesk)
      await apiApp.register(m06CustomerSevdeskRoutes, { prefix: '/customers' });
      // M06 Integration-Test + Sync (POST /integrations/sevdesk/test|sync-accounts)
      await apiApp.register(m06IntegrationRoutes, { prefix: '/integrations/sevdesk' });
      // M04 DATEV Export (POST/GET /customers/:id/datev/...)
      await apiApp.register(m04DatevRoutes, { prefix: '/customers' });
      // /receipts/:id/complete (Master-Workflow Final-Status)
      await apiApp.register(receiptsCompleteRoutes, { prefix: '/receipts' });
      await apiApp.register(m07SpreadsheetRoutes, { prefix: '/receipts' });
      await apiApp.register(reportRoutes, { prefix: '/reports' });
      // M08 Monatsreporting (customer-scoped: /customers/:id/reports/...)
      await apiApp.register(m08ReportingRoutes, { prefix: '/customers' });
      // Konzept-konformer Routing-Plan (parallel zu D9 routingRoutes /jobs)
      await apiApp.register(routingPlanRoutes, { prefix: '/routing' });
      // Internal-Endpoints für n8n (kein Tenant-Hook):
      // GET /api/v1/internal/customers, POST /api/v1/internal/notifications/operator
      await apiApp.register(internalCustomersRoutes, { prefix: '/internal' });
      await apiApp.register(operatorNotificationsRoutes, { prefix: '/internal' });
      // Pro-Hook-CRUD
      await apiApp.register(hookRoutes, { prefix: '/hooks' });
      // Error-Log (Pipeline-Fehler-Tracking)
      await apiApp.register(errorRoutes, { prefix: '/errors' });
      // Stats-Aggregationen (GET /customers/:customerId/stats)
      await apiApp.register(statsRoutes, { prefix: '/customers' });
      // M06 Steuerberater-Portal (GET/POST /advisor/...)
      await apiApp.register(m06AdvisorPortalRoutes, { prefix: '/advisor' });
      // T035 — Rechnungs-Verwaltung + Auto-Rechnungs-Generator
      await apiApp.register(invoiceRoutes, { prefix: '/invoices' });
      // Plugin-System (POST/GET/PUT/DELETE /plugins/...)
      await apiApp.register(pluginSystemRoutes, { prefix: '/plugins' });
      // DSGVO-Compliance (POST/GET /dsgvo/...)
      await apiApp.register(dsgvoRoutes, { prefix: '/dsgvo' });
      // M09 Lieferanten-Kommunikation (POST/GET /communications/...)
      await apiApp.register(m09CommunicationRoutes, { prefix: '/communications' });
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
