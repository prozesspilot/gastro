/**
 * D7 — Webhook-Empfänger für n8n
 *
 * n8n ruft nach Abschluss eines Workflows diesen Endpoint auf.
 * Die Nachricht wird validiert (HMAC-SHA256 über den Body mit N8N_WEBHOOK_SECRET),
 * dann als internes Domain-Event in Redis publiziert.
 *
 * Route:
 *   POST /webhooks/n8n/:workflowType
 *
 * Payload (von n8n gesendet):
 *   {
 *     "tenant_id": "uuid",
 *     "job_id":    "uuid",          // optional
 *     "status":    "done" | "failed",
 *     "data":      { … }            // workflow-spezifische Ausgabe
 *   }
 *
 * Sicherheit:
 *   Header x-n8n-signature: sha256=<HMAC-HEX>
 *   Wenn N8N_WEBHOOK_SECRET leer ist, wird die Signatur nicht geprüft
 *   (nur für lokale Entwicklung).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { apiError, apiOk } from '../core/schemas/common';

// ── Typen ─────────────────────────────────────────────────────────────────────

interface N8nWebhookBody {
  tenant_id: string;
  job_id?:   string;
  status:    'done' | 'failed';
  data?:     Record<string, unknown>;
}

// ── HMAC-Validierung ──────────────────────────────────────────────────────────

function verifyN8nSignature(rawBody: Buffer, signature: string | undefined): boolean {
  // process.env direkt lesen (nicht config-Singleton) damit Tests funktionieren,
  // die das Secret erst nach dem Modulimport in process.env setzen.
  const secret = process.env['N8N_WEBHOOK_SECRET'] ?? config.N8N_WEBHOOK_SECRET;
  if (!secret) {
    // Secret nicht konfiguriert → Signaturprüfung überspringen (Dev-Modus)
    logger.warn('N8N_WEBHOOK_SECRET nicht gesetzt — Signaturprüfung deaktiviert');
    return true;
  }
  if (!signature) return false;

  // Format: "sha256=<hex>"
  const [algo, hex] = signature.split('=');
  if (algo !== 'sha256' || !hex) return false;

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(hex, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// ── Route-Plugin ──────────────────────────────────────────────────────────────

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /webhooks/n8n/:workflowType
   *
   * workflowType: z. B. "document-routed", "invoice-extracted", "customer-synced"
   */
  app.post<{ Params: { workflowType: string } }>(
    '/n8n/:workflowType',
    async (req, reply) => {
      const { workflowType } = req.params;

      // ── Signatur prüfen ────────────────────────────────────────────────────
      const signature = req.headers['x-n8n-signature'] as string | undefined;
      const rawBody   = req.rawBody ?? Buffer.alloc(0);

      if (!verifyN8nSignature(rawBody, signature)) {
        logger.warn({ workflowType }, 'Ungültige n8n-Webhook-Signatur');
        return reply.code(401).send(
          apiError('INVALID_SIGNATURE', 'Webhook-Signatur ungültig oder fehlend.'),
        );
      }

      // ── Body parsen & validieren ───────────────────────────────────────────
      const body = req.body as Partial<N8nWebhookBody>;

      if (!body.tenant_id || !body.status) {
        return reply.code(422).send(
          apiError('VALIDATION_ERROR', 'tenant_id und status sind Pflichtfelder.'),
        );
      }

      logger.info(
        { workflowType, tenant_id: body.tenant_id, job_id: body.job_id, status: body.status },
        'n8n-Webhook empfangen',
      );

      // ── Event in Redis publizieren (best-effort) ───────────────────────────
      // Importiert lazy, damit die Route nicht vom Event-Bus abhängt
      const { publishEvent } = await import('../core/events/publisher');
      const stream = `pp:n8n.${workflowType}`;
      void publishEvent(app.redis, stream, {
        workflow_type: workflowType,
        tenant_id:     body.tenant_id,
        job_id:        body.job_id ?? '',
        status:        body.status,
        data:          JSON.stringify(body.data ?? {}),
        timestamp:     new Date().toISOString(),
      });

      return reply.code(200).send(apiOk({ received: true, workflowType }));
    },
  );
}
