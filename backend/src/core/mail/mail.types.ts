/**
 * T057/A1 — Generischer Mail-Service: Typen.
 *
 * Reine Interfaces, keine Logik. `MailTransport` ist der Dependency-Injection-
 * Punkt: in Produktion der SMTP-Transport (`mail.transport.ts`), in Tests ein Mock.
 */

export interface Attachment {
  filename: string;
  /** Datei-Inhalt als Buffer (z. B. PDF-Report, ZIP-Export). */
  content: Buffer;
  /** MIME-Typ, z. B. 'application/pdf', 'application/zip'. */
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  /** Pflicht — immer ein Plain-Text-Fallback. */
  text: string;
  /** Optional (HTML-Doku-Mails, M08/M12). */
  html?: string;
  /** Default: `config.SMTP_FROM`. */
  from?: string;
  /** Antwort-Adresse (z. B. M09 Lieferanten-Tracking). */
  replyTo?: string;
  attachments?: Attachment[];
}

/**
 * Best-Effort-Ergebnis. `sendMail` wirft NICHT — der Caller prüft `.ok`
 * (z. B. für Audit-Logging), ohne dass ein Mail-Fehler den Request abbricht.
 */
export type MailResult =
  | { ok: true; dryRun: boolean; messageId?: string }
  | { ok: false; error: string };

/** Transport-Abstraktion (DI). Einzige Stelle, die wirklich SMTP spricht. */
export interface MailTransport {
  send(msg: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    attachments?: Attachment[];
  }): Promise<{ messageId: string }>;
}
