/**
 * D10 — Request-Logging-Plugin
 *
 * Fastify-Plugin das für jeden eingehenden Request:
 *   1. Eine traceId erzeugt (oder x-trace-id-Header übernimmt)
 *   2. Den TraceContext per enterWith() in AsyncLocalStorage speichert
 *   3. Methode + Pfad + Status + Dauer beim Response loggt
 *   4. x-trace-id als Response-Header setzt
 *
 * Einbinden in app.ts:
 *   await app.register(requestLoggingPlugin);
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { FastifyInstance } from 'fastify';
import { getLogger } from '../logger';
import { type TraceContext, newTraceId, traceStorage } from '../trace';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestLoggingPlugin(
  app: FastifyInstance<any, any, any, any>,
): Promise<void> {
  // ── onRequest: TraceContext per enterWith() in den async-Kontext setzen ──

  app.addHook('onRequest', async (req, _reply) => {
    const traceId = (req.headers['x-trace-id'] as string | undefined) ?? newTraceId();

    const ctx: TraceContext = {
      traceId,
      tenantId: req.headers['x-pp-tenant-id'] as string | undefined,
      method: req.method,
      path: req.url,
    };

    // enterWith setzt den Context dauerhaft für den aktuellen async-Execution-Context
    // (d. h. alle awaits innerhalb dieses Requests erben ihn).
    traceStorage.enterWith(ctx);

    // traceId auch direkt am Request-Objekt speichern (für onSend/onResponse)
    (req as unknown as Record<string, unknown>).traceId = traceId;
  });

  // ── onResponse: strukturiertes Request-Log mit Dauer ─────────────────────

  app.addHook('onResponse', async (req, reply) => {
    const traceId = ((req as unknown as Record<string, unknown>).traceId as string) ?? 'unknown';
    const durationMs = Math.round(reply.elapsedTime);

    getLogger().info(
      {
        traceId,
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        durationMs,
      },
      'request completed',
    );
  });

  // ── onSend: x-trace-id Response-Header anhängen ───────────────────────────

  app.addHook('onSend', async (req, reply, payload) => {
    const traceId = (req as unknown as Record<string, unknown>).traceId as string | undefined;
    if (traceId) {
      reply.header('x-trace-id', traceId);
    }
    return payload;
  });
}
