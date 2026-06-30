/**
 * SSE-Endpoint — GET /api/v1/events
 *
 * Liefert Server-Sent Events für den Mandanten des authentifizierten
 * Mitarbeiters. Heartbeat alle 30 s, Cleanup automatisch bei Connection-Close.
 *
 * T074 — Auth + Tenant-Quelle:
 *   * Auth: M14-Staff-JWT im Cookie `pp_auth` (von EventSource same-origin
 *     automatisch mitgesendet — EventSource kann KEINE Custom-Header setzen).
 *     Kein gültiges Cookie → 401.
 *   * Tenant: Query-Param `?tenant=<id>` (primär), `x-pp-tenant-id`-Header als
 *     Fallback (rückwärtskompatibel). Fehlt beides → 400.
 *
 * Tenant-Modell: Staff ist cross-tenant; nach Authentifizierung wird der
 * Client-gelieferte Tenant (Query/Header) vertraut — konsistent mit dem Rest
 * der App (`x-pp-tenant-id`).
 */

import type { ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getM14Staff } from '../core/auth/m14-staff-auth';
import { sseManager } from '../core/sse/sse.manager';

const HEARTBEAT_INTERVAL_MS = 30_000;

type SseResolution =
  | { ok: true; tenantId: string }
  | { ok: false; status: number; body: { ok: false; error: { code: string; message: string } } };

/**
 * Reine Helper-Funktion: prüft Auth + ermittelt den Tenant. Ausgelagert, damit
 * sie ohne den offen bleibenden `reply.hijack()`-Stream testbar ist.
 */
export function resolveSseSubscription(req: FastifyRequest): SseResolution {
  const staff = getM14Staff(req);
  if (!staff) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentifizierung erforderlich.' },
      },
    };
  }

  // Query-Param und Header können beide array-wertig ankommen (?tenant=a&tenant=b
  // bzw. doppelter Header) — symmetrisch auf den ersten Wert reduzieren.
  const rawQuery = (req.query as { tenant?: string | string[] } | undefined)?.tenant;
  const queryTenant = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  const rawHeader = req.headers['x-pp-tenant-id'];
  const headerTenant = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const tenantId = queryTenant || headerTenant;
  if (!tenantId) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: {
          code: 'MISSING_TENANT',
          message: 'Tenant fehlt (Query-Param ?tenant= oder x-pp-tenant-id Header).',
        },
      },
    };
  }

  return { ok: true, tenantId };
}

export async function sseRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/events',
    // Per-Route-Rate-Limit: macht den globalen @fastify/rate-limit über die
    // Plugin-Grenze für CodeQL sichtbar (siehe Memory codeql-missing-rate-limiting).
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    (req, reply) => {
      const resolved = resolveSseSubscription(req);
      if (!resolved.ok) {
        return reply.code(resolved.status).send(resolved.body);
      }
      const { tenantId } = resolved;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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
      req.raw.on('end', cleanup);
      reply.raw.on('error', cleanup);

      // Antwort bleibt offen — Fastify weiß durch reply.hijack(), dass wir selbst antworten
      reply.hijack();
      return;
    },
  );
}
