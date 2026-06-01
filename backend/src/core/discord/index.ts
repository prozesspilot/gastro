/**
 * T031 — Discord-Core: oeffentliche Exporte
 *
 * Pilot-Scope: Webhook-basierte Notifications.
 * Bot-Scope (discord.js v14, KW23+): wird hier ergaenzt wenn T031-Phase-2.
 */

export {
  notifyAlert,
  notifyDeploy,
  notifyInfo,
  notifyNewTask,
  sendDiscordWebhook,
} from './discord-notifications.service';

export type {
  DiscordColor,
  DiscordEmbed,
  DiscordWebhookPayload,
  NotificationOptions,
} from './discord-notifications.service';
