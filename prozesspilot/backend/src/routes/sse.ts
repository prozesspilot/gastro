/**
 * SSE-Endpoint — /api/v1/events
 *
 * Liefert Server-Sent Events für den über x-pp-tenant-id-Header bestimmten
 * Mandanten. Heartbeat alle 30 s, Cleanup automatisch bei Connection-Close.
 *
 * Öffentlich (kein HMAC), damit die Webapp direkt subscriben kann.
 */

import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { sseManager } from '../core/sse/sse.manager';

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function sseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', (req, reply) => {
    const rawTenant = req.headers['x-pp-tenant-id'];
    const tenantId  = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
    if (!tenantId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'MISSING_TENANT', message: 'x-pp-tenant-id Header fehlt.' },
      });
    }

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection:      'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const sink = {
      write: (chunk: string): boolean => reply.raw.write(chunk),
    };
    sseManager.subscribe(tenantId, sink);

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n');
      } catch {
        // ignored
      }
    }, HEARTBEAT_INTERVAL_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      sseManager.unsubscribe(tenantId, sink);
      try {
        (reply.raw as ServerResponse).end();
      } catch {
        // ignore
      }
    };

    req.raw.on('close', cleanup);
    req.raw.on('end',   cleanup);
    reply.raw.on('error', cleanup);

    // Antwort bleibt offen — Fastify weiß durch reply.hijack(), dass wir selbst antworten
    reply.hijack();
    return;
  });
}
