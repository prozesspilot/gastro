// Decision: Sentry-Initialisierung im Core-Layer, damit alle Module sie nutzen können,
// ohne direkt von @sentry/node abhängig zu sein. initSentry() muss vor Fastify-Setup
// aufgerufen werden, da Sentry Node Instrumentierung beim Import läuft.
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] SENTRY_DSN nicht gesetzt — Sentry deaktiviert');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION ?? 'unknown',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0.1,
  });
  console.log(`[Sentry] Initialisiert (env: ${process.env.NODE_ENV})`);
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}

export function captureMessage(msg: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureMessage(msg, level);
}
