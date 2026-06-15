/**
 * T057/A1 — Generischer Mail-Service (Public API).
 *
 * Verantwortung von Onboarding-Wizard, M09, M08, M11, DSGVO — EIN Service statt
 * je Modul ein eigener (keine Duplikate, kein Drift).
 *
 * Eigenschaften:
 *   - **Best-Effort:** `sendMail`/`sendTemplate` werfen NIE; der Caller prüft `.ok`.
 *   - **Dry-Run:** ohne SMTP-Config (`SMTP_HOST`/`SMTP_USER` leer) wird nichts
 *     versendet, nur geloggt — Dev/Test/CI laufen ohne echten SMTP.
 *   - **PII-sicher:** es wird NIE die volle Mail-Adresse geloggt, nur `to_hash`.
 */

import { createHash } from 'node:crypto';
import { config } from '../config';
import { logger } from '../logger';
import { createSmtpTransport } from './mail.transport';
import type { MailMessage, MailResult, MailTransport } from './mail.types';
import type { MailTemplate } from './templates/types';

/** Kein echter SMTP konfiguriert → Dry-Run (nur loggen, nicht versenden). */
export function isDryRun(): boolean {
  return !config.SMTP_HOST || !config.SMTP_USER;
}

/** SHA256-Kurzhash (12 Hex) einer Mail-Adresse — für PII-sicheres Logging. */
export function hashEmailForLog(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

/**
 * Versendet eine Mail. Wirft NICHT — Fehler landen im Log + im `MailResult`.
 * Transport per `opts.transport` injizierbar (Default: SMTP).
 */
export async function sendMail(
  msg: MailMessage,
  opts: { transport?: MailTransport } = {},
): Promise<MailResult> {
  const from = msg.from ?? config.SMTP_FROM;
  const toHash = hashEmailForLog(msg.to);

  if (isDryRun()) {
    // KEIN Body-Auszug loggen: der Text kann Tokens/Magic-Links/ZIP-Passwörter
    // enthalten (DSGVO §6.6). Nur Länge als harmloses Signal.
    logger.info(
      { to_hash: toHash, subject: msg.subject, body_len: msg.text.length },
      '[mail] DRY-RUN — SMTP nicht konfiguriert, Mail nur geloggt',
    );
    return { ok: true, dryRun: true };
  }

  const transport = opts.transport ?? createSmtpTransport();
  try {
    const { messageId } = await transport.send({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
      attachments: msg.attachments,
    });
    logger.info({ messageId, to_hash: toHash, subject: msg.subject }, '[mail] verschickt');
    return { ok: true, dryRun: false, messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: error, to_hash: toHash, subject: msg.subject },
      '[mail] SMTP-Versand fehlgeschlagen',
    );
    return { ok: false, error };
  }
}

/**
 * Versendet eine Mail aus einem typsicheren Template. Modul-spezifische Templates
 * liegen beim Modul und importieren `MailTemplate` aus core (Inversion of Control).
 */
export async function sendTemplate<Vars>(
  template: MailTemplate<Vars>,
  vars: Vars,
  to: string,
  opts: {
    transport?: MailTransport;
    attachments?: MailMessage['attachments'];
    replyTo?: string;
  } = {},
): Promise<MailResult> {
  let msg: MailMessage;
  try {
    // Render im try: ein werfender Template-Renderer darf den Caller NICHT
    // abbrechen (Best-Effort-Garantie wie sendMail).
    msg = {
      to,
      subject: template.subject(vars),
      text: template.text(vars),
      html: template.html?.(vars),
      replyTo: opts.replyTo,
      attachments: opts.attachments,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err: error, template: template.name }, '[mail] Template-Render fehlgeschlagen');
    return { ok: false, error };
  }
  return sendMail(msg, { transport: opts.transport });
}
