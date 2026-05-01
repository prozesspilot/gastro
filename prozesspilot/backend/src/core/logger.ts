/**
 * D10 — Strukturiertes Logging (pino)
 *
 * Zentrale Logger-Instanz mit:
 *   - Feldredaktion für Secrets
 *   - pino-pretty in Development
 *   - getLogger() liefert einen Child-Logger mit aktuellem TraceContext
 *
 * Opt-in Loki-Transport:
 *   npm install pino-loki
 *   LOKI_URL=http://localhost:3100 → Logs werden an Grafana Loki gesendet.
 *
 * Öffentliche API:
 *   logger      — Root-Logger (für Startup, Shutdown, Background)
 *   getLogger() — Child-Logger mit traceId/tenantId aus AsyncLocalStorage
 */

import pino, { type Logger } from 'pino';
import { getTraceContext } from './trace';

// ── Pino-Konfiguration ────────────────────────────────────────────────────────

const level  = process.env.LOG_LEVEL  ?? 'info';
const isDev  = (process.env.NODE_ENV ?? 'development') === 'development';
const lokiUrl = process.env.LOKI_URL;

// Basis-Optionen (kein Transport — wird unten ggf. überschrieben)
const baseOptions: pino.LoggerOptions = {
  level,
  redact: {
    paths: [
      '*.password',
      '*.api_key',
      '*.ciphertext',
      '*.authorization',
      '*.secret',
      '*.PP_HMAC_SECRET',
      '*.PP_PGCRYPTO_KEY',
    ],
    censor: '[REDACTED]',
  },
};

// ── Transport-Konfiguration ───────────────────────────────────────────────────

function buildTransport(): pino.TransportMultiOptions | pino.TransportSingleOptions | undefined {
  const targets: pino.TransportTargetOptions[] = [];

  if (isDev) {
    targets.push({
      target:  'pino-pretty',
      level,
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
    });
  } else {
    // Production: JSON nach stdout
    targets.push({ target: 'pino/file', level, options: { destination: 1 } });
  }

  if (lokiUrl) {
    // pino-loki muss separat installiert werden: npm install pino-loki
    // Aktivierung: LOKI_URL=http://localhost:3100
    targets.push({
      target:  'pino-loki',
      level,
      options: {
        host:       lokiUrl,
        labels:     { app: 'prozesspilot', env: process.env.NODE_ENV ?? 'development' },
        batching:   true,
        interval:   5,
      },
    });
  }

  if (targets.length === 0) return undefined;
  if (targets.length === 1) {
    const [t] = targets;
    return { target: t.target, options: t.options } as pino.TransportSingleOptions;
  }
  return { targets } as pino.TransportMultiOptions;
}

const transport = buildTransport();

export const logger: Logger = transport
  ? pino(baseOptions, pino.transport(transport))
  : pino(baseOptions);

// ── Child-Logger mit TraceContext ─────────────────────────────────────────────

/**
 * Gibt einen Child-Logger zurück, der automatisch traceId und tenantId
 * aus dem aktuellen AsyncLocalStorage-Kontext anhängt.
 *
 * Sollte in Request-Handlern und Services anstelle von `logger` direkt
 * verwendet werden, damit jeder Log-Eintrag rückverfolgbar ist.
 *
 * @example
 *   import { getLogger } from '../core/logger';
 *   getLogger().info({ customerId }, 'Kunde erstellt');
 */
export function getLogger(): Logger {
  const ctx = getTraceContext();
  return logger.child({
    traceId:  ctx.traceId,
    tenantId: ctx.tenantId,
  });
}
