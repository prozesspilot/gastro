/**
 * T057/A1 — SMTP-Transport via nodemailer.
 *
 * Lazy-`import('nodemailer')` + Cache-Singleton: nodemailer ist eine optionale
 * Production-Dependency, der Import passiert erst beim ersten echten Versand.
 * Dies ist die EINZIGE Stelle im Repo, die `createTransport` aufruft.
 *
 * EU-Hosting (DSGVO §5.4): Der SMTP-Anbieter MUSS EU-gehostet sein (IONOS-Mail
 * oder Mailjet EU mit AVV). Das ist eine Betriebs-/Vertragsentscheidung und wird
 * NICHT im Code erzwungen — siehe README.
 */

import { config } from '../config';
import type { MailTransport } from './mail.types';

type NodemailerLike = {
  createTransport: (opts: unknown) => {
    sendMail: (msg: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
      replyTo?: string;
      attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
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
 * SMTP-Transport aus `config.SMTP_*`. Der `send` wirft bei fehlendem Modul oder
 * SMTP-Fehler — der Mail-Service fängt das ab und liefert `{ ok: false }`.
 */
export function createSmtpTransport(): MailTransport {
  return {
    async send(msg) {
      const nodemailer = await getNodemailer();
      if (!nodemailer) {
        throw new Error('nodemailer-Modul nicht verfügbar');
      }
      const transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465, // 465 = implizit TLS, sonst STARTTLS (587)
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      });
      return transporter.sendMail(msg);
    },
  };
}
