/**
 * T031 — Discord-Notification-Service (Webhook-basiert, Pilot-Scope)
 *
 * DECISION (T031, 2026-06-01):
 *   Discord_Integration.md §10.1 (KW21) definiert Webhooks fuer Tasks/Alerts/Deploys
 *   als Pilot-Scope. §10.2 (KW23+) definiert den discord.js-Bot mit Buttons +
 *   Slash-Commands. Dieser Service implementiert den Webhook-Ansatz (KW21-Scope)
 *   und konsolidiert die drei bestehenden, doppelten sendDiscordAlert-Funktionen
 *   (ocr-worker.ts, m05-lexoffice, m15-pos-connector).
 *
 *   Trennung Bot vs. Webhook:
 *   - Webhook-Call: POST zur Discord-Webhook-URL (kein discord.js, kein Bot-Token)
 *   - Bot-Ausbau (T031-Phase-2, KW23): discord.js v14 in separatem Service,
 *     Buttons + Slash-Commands → dann werden diese Webhook-Calls abgeloest.
 *
 *   Bestehende sendDiscordAlert-Helfer in m05/m15/ocr-worker bleiben unveraendert
 *   (m05 + m15 sind Verbotszonen). Neue Module SOLLEN diesen Service nutzen.
 *
 * Sicherheit:
 *   - DISCORD_BOT_TOKEN wird hier NIEMALS geloggt
 *   - Webhook-URLs werden NIEMALS geloggt (weder vollstaendig noch als Hash)
 *   - Alle Fehler sind best-effort (kein throw nach aussen — Notification-Fehler
 *     duerfen die Business-Logik nicht unterbrechen)
 *
 * Spec: Discord_Integration.md §5 (Bot-Funktionen), §10.1 (KW21-Scope)
 */

import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type DiscordColor =
  | 'error' // rot    = 0xE74C3C
  | 'warn' // orange = 0xE67E22
  | 'success' // gruen  = 0x2ECC71
  | 'info' // blau   = 0x3498DB
  | 'neutral'; // grau   = 0x95A5A6

export interface DiscordEmbed {
  title: string;
  description?: string;
  color?: DiscordColor;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  /** Timestamp (ISO-String oder Date) fuer den Footer-Zeitstempel */
  timestamp?: string | Date;
}

export interface DiscordWebhookPayload {
  /** Text oberhalb der Embeds. Kann @everyone/@here-Erwaehnung enthalten. */
  content?: string;
  embeds?: DiscordEmbed[];
  /** Explizite Allow-Mentions-Konfiguration (default: kein @everyone) */
  allowed_mentions?: {
    parse?: Array<'everyone' | 'roles' | 'users'>;
    roles?: string[];
    users?: string[];
  };
}

export interface NotificationOptions {
  /** Wenn gesetzt, Webhook-URL ueberschreiben (fuer Tests) */
  webhookUrlOverride?: string;
  /** Fetch-Implementierung ueberschreiben (fuer Tests) */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Farb-Mapping
// ---------------------------------------------------------------------------

const COLOR_MAP: Record<DiscordColor, number> = {
  error: 0xe74c3c,
  warn: 0xe67e22,
  success: 0x2ecc71,
  info: 0x3498db,
  neutral: 0x95a5a6,
};

// ---------------------------------------------------------------------------
// Kern-Funktion: Webhook-Call
// ---------------------------------------------------------------------------

/**
 * Sendet eine Discord-Webhook-Nachricht. Best-effort — wirft niemals.
 *
 * @param webhookUrl  Vollstaendige Discord-Webhook-URL
 * @param payload     Nachrichteninhalt (content + embeds)
 * @param logger      Pino-Logger fuer Fehler-Logging
 * @param fetchImpl   Fetch-Implementierung (injectable fuer Tests)
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
  logger: Logger,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!webhookUrl) return;

  // Embeds: Farb-Mapping anwenden
  const resolvedPayload = {
    ...payload,
    embeds: payload.embeds?.map((embed) => ({
      ...embed,
      color: embed.color ? COLOR_MAP[embed.color] : undefined,
      timestamp: embed.timestamp instanceof Date ? embed.timestamp.toISOString() : embed.timestamp,
    })),
  };

  try {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resolvedPayload),
    });

    if (!response.ok) {
      // Sicherheit: keine Webhook-URL im Log
      logger.warn(
        { status: response.status, statusText: response.statusText },
        '[discord] Webhook-Call fehlgeschlagen (HTTP-Status)',
      );
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[discord] Webhook-Call fehlgeschlagen (Netzwerk)',
    );
  }
}

// ---------------------------------------------------------------------------
// High-Level Notification-Funktionen
// ---------------------------------------------------------------------------

/**
 * Alert: Kritischer Fehler (rotes Embed, in #alerts-critical).
 * Ersetzt die bisher dezentralen sendDiscordAlert-Helfer fuer neue Module.
 */
export async function notifyAlert(
  webhookUrl: string,
  opts: {
    title: string;
    description?: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    pingEveryone?: boolean;
  },
  logger: Logger,
  fetchImpl?: typeof fetch,
): Promise<void> {
  return sendDiscordWebhook(
    webhookUrl,
    {
      content: opts.pingEveryone ? '@everyone' : undefined,
      allowed_mentions: opts.pingEveryone ? { parse: ['everyone'] } : { parse: [] },
      embeds: [
        {
          title: `🔴 ${opts.title}`,
          description: opts.description,
          color: 'error',
          fields: opts.fields,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    logger,
    fetchImpl,
  );
}

/**
 * Task-Notification: Neue Task erzeugt (in #tasks-neu).
 * Wird von T027 (Auto-Trigger-Engine) und Task-API genutzt.
 */
export async function notifyNewTask(
  webhookUrl: string,
  task: {
    id: string;
    title: string;
    type: string;
    priority: string;
    tenantName?: string;
    webappUrl?: string;
  },
  logger: Logger,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const priorityEmoji: Record<string, string> = {
    kritisch: '🚨',
    hoch: '⚠️',
    normal: '📋',
    niedrig: '🔵',
  };

  const emoji = priorityEmoji[task.priority] ?? '📋';
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: 'Typ', value: task.type, inline: true },
    { name: 'Priorität', value: task.priority, inline: true },
  ];

  if (task.tenantName) {
    fields.push({ name: 'Tenant', value: task.tenantName, inline: true });
  }

  if (task.webappUrl) {
    fields.push({ name: 'Link', value: `[In Webapp öffnen](${task.webappUrl})`, inline: false });
  }

  return sendDiscordWebhook(
    webhookUrl,
    {
      embeds: [
        {
          title: `${emoji} Neue Task: ${task.title}`,
          color:
            task.priority === 'kritisch' ? 'error' : task.priority === 'hoch' ? 'warn' : 'info',
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    logger,
    fetchImpl,
  );
}

/**
 * Deploy-Notification: CI/CD-Status (in #deployment).
 */
export async function notifyDeploy(
  webhookUrl: string,
  opts: {
    status: 'success' | 'failure';
    branch: string;
    commit?: string;
    message?: string;
  },
  logger: Logger,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const isSuccess = opts.status === 'success';
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: 'Branch', value: opts.branch, inline: true },
  ];

  if (opts.commit) {
    fields.push({ name: 'Commit', value: `\`${opts.commit.slice(0, 8)}\``, inline: true });
  }

  if (opts.message) {
    fields.push({ name: 'Nachricht', value: opts.message.slice(0, 200), inline: false });
  }

  return sendDiscordWebhook(
    webhookUrl,
    {
      embeds: [
        {
          title: isSuccess ? '✅ Deploy erfolgreich' : '❌ Deploy fehlgeschlagen',
          color: isSuccess ? 'success' : 'error',
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    logger,
    fetchImpl,
  );
}

/**
 * Info-Notification: Allgemeine Info-Meldung (in OPS-Channel).
 */
export async function notifyInfo(
  webhookUrl: string,
  title: string,
  description?: string,
  logger_arg?: Logger,
  fetchImpl?: typeof fetch,
): Promise<void> {
  if (!logger_arg) return;
  return sendDiscordWebhook(
    webhookUrl,
    {
      embeds: [
        {
          title: `ℹ️ ${title}`,
          description,
          color: 'info',
          timestamp: new Date().toISOString(),
        },
      ],
    },
    logger_arg,
    fetchImpl,
  );
}
