/**
 * T069 — GET /api/v1/chat/:token/events  (öffentlich, Wirt — SSE)
 *
 * Server-Sent-Events-Stream für den Wirt: Live-Zustellung neuer Chat-Nachrichten
 * (event `chat.message`). Token = Credential; der Tenant wird über den SECURITY-
 * DEFINER-Lookup (T068) aufgelöst, dann wird auf den tenant-gescopten SSE-Kanal
 * subscribed (Pilot-Entscheidung: tenant-scoped; Heartbeat alle 30 s).
 *
 * TODO (vor Multi-Session-pro-Tenant, T070+): Kanal auf session-scoped umstellen.
 * Aktuell faktisch identisch, weil 124 genau EINEN aktiven Link pro Tenant erzwingt;
 * bei mehreren parallelen Sessions je Tenant bekäme ein Wirt sonst fremde Threads.
 *
 * Muster wie routes/sse.ts (Staff-Webapp), nur Token- statt Header-basiert.
 */
import type { ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sseManager } from '../../../core/sse/sse.manager';
import { resolveChatSession } from './_resolve-session';

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function chatEventsHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveChatSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }
  const tenantId = r.session.tenant_id;

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

  // Antwort bleibt offen — Fastify weiß durch reply.hijack(), dass wir selbst antworten.
  reply.hijack();
}
