/**
 * T010/M12 — Email-Versand fuer DSGVO.
 *
 * Pattern uebernommen aus modules/m09-supplier-comm/handlers/send.handler.ts:
 *   * SMTP-Transport via nodemailer (Env: SMTP_HOST/PORT/USER/PASS/FROM).
 *   * Dry-Run-Mode wenn SMTP_HOST leer: Mail wird nur ins Log geschrieben.
 *
 * Zwei Mail-Typen:
 *   1. Auskunfts-Download-Link: an Subject, mit Signed-URL + ZIP-Passwort.
 *   2. Loeschungs-Confirm-Link: an Subject, mit Confirm-Token.
 *
 * Beide Mails werden auf Deutsch verfasst.
 *
 * WICHTIG: Wir loggen NIE die volle Mail-Adresse oder den Token in plain text
 * (PII / Sicherheit). Stattdessen Email-Hash + Token-Prefix.
 */

import { createHash } from 'node:crypto';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';

// Lazy-Import: nodemailer ist eine optionale Production-Dep
type NodemailerLike = {
  createTransport: (opts: unknown) => {
    sendMail: (msg: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }) => Promise<{ messageId: string }>;
  };
};

let cachedNodemailer: NodemailerLike | null = null;

async function getNodemailer(): Promise<NodemailerLike | null> {
  if (cachedNodemailer) return cachedNodemailer;
  try {
    const mod = (await import('nodemailer')) as unknown as {
      default?: NodemailerLike;
    } & NodemailerLike;
    cachedNodemailer = (mod.default ?? mod) as NodemailerLike;
    return cachedNodemailer;
  } catch {
    return null;
  }
}

/**
 * Pruefst ob ein echter SMTP-Transport konfiguriert ist. Sonst Dry-Run.
 */
function isDryRun(): boolean {
  return !config.SMTP_HOST || !config.SMTP_USER;
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

/**
 * Generischer Versand. Wirft NICHT — Fehler werden ins Log geschrieben.
 * Der Caller muss den Versand-Erfolg ueber den Return prüfen.
 */
async function sendMail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  if (isDryRun()) {
    logger.info(
      {
        to_hash: hashEmail(input.to),
        subject: input.subject,
        body_preview: input.text.slice(0, 200),
      },
      '[dsgvo-mail] DRY-RUN — SMTP nicht konfiguriert, Mail nur geloggt',
    );
    return true; // Dry-Run gilt als „Erfolg"
  }

  const nodemailer = await getNodemailer();
  if (!nodemailer) {
    logger.error(
      { to_hash: hashEmail(input.to) },
      '[dsgvo-mail] nodemailer-Modul konnte nicht geladen werden',
    );
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });
    const result = await transporter.sendMail({
      from: config.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    logger.info(
      { messageId: result.messageId, to_hash: hashEmail(input.to), subject: input.subject },
      '[dsgvo-mail] Mail verschickt',
    );
    return true;
  } catch (err) {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        to_hash: hashEmail(input.to),
        subject: input.subject,
      },
      '[dsgvo-mail] SMTP-Versand fehlgeschlagen',
    );
    return false;
  }
}

// ── Public API: zwei spezifische Mail-Templates ───────────────────────────

export async function sendAuskunftReadyMail(input: {
  to: string;
  downloadUrl: string;
  zipPassword: string;
  ttlDays: number;
}): Promise<boolean> {
  const text = `Hallo,

zu Ihrer DSGVO-Auskunftsanfrage stellen wir Ihnen einen Datenexport zur Verfügung.

Download-Link (gültig ${input.ttlDays} Tage):
${input.downloadUrl}

ZIP-Passwort:
${input.zipPassword}

Das Archiv enthält alle Daten, die wir zu Ihrer E-Mail-Adresse in unserem System gespeichert haben — gemäß Art. 15 DSGVO.

Sollten Sie Fragen haben, antworten Sie bitte direkt auf diese E-Mail.

Viele Grüße
Das ProzessPilot-Team
`;
  return sendMail({
    to: input.to,
    subject: 'Ihre DSGVO-Auskunft — Datenexport bereit',
    text,
  });
}

export async function sendLoeschungConfirmMail(input: {
  to: string;
  confirmUrl: string;
  ttlMinutes: number;
}): Promise<boolean> {
  const text = `Hallo,

uns wurde im Namen Ihrer E-Mail-Adresse eine DSGVO-Löschanfrage übermittelt (Art. 17 DSGVO).

Zur Bestätigung klicken Sie bitte innerhalb der nächsten ${input.ttlMinutes} Minuten auf folgenden Link:

${input.confirmUrl}

Wenn Sie diese Löschung NICHT veranlasst haben, ignorieren Sie diese E-Mail. Es passiert dann nichts.

Wichtig: Belege, die der gesetzlichen Aufbewahrungspflicht (§ 147 AO, 10 Jahre) unterliegen, werden nach DSGVO-Vorgabe anonymisiert statt gelöscht. Die Anonymisierung greift sofort nach Bestätigung.

Viele Grüße
Das ProzessPilot-Team
`;
  return sendMail({
    to: input.to,
    subject: 'Ihre DSGVO-Löschanfrage — Bestätigung erforderlich',
    text,
  });
}
