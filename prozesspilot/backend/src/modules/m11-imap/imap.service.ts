/**
 * M11 — IMAP-Service
 *
 * Verbindet sich mit dem IMAP-Konto eines Kunden, holt neue (unseen)
 * E-Mails mit gültigen Anhängen (PDF, JPG, PNG, TIFF) und gibt sie
 * als Buffer zurück. Die E-Mails werden danach als gelesen markiert.
 *
 * Abhängigkeit: imapflow (npm install imapflow)
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — imapflow wird zur Laufzeit erwartet (npm install imapflow)
import { ImapFlow } from 'imapflow';
import { logger } from '../../core/logger';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  folder: string;
}

export interface FetchedAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  messageUid: string;
  emailFrom: string;
  emailSubject: string;
}

const VALID_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
]);

const VALID_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif']);

function isValidAttachment(filename: string, mimeType: string): boolean {
  if (VALID_MIME.has(mimeType.toLowerCase())) return true;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return VALID_EXT.has(`.${ext}`);
}

/**
 * Holt alle neuen (UNSEEN) E-Mails mit gültigen Anhängen aus dem Postfach.
 * Markiert verarbeitete Nachrichten als SEEN.
 */
export async function fetchNewAttachments(cfg: ImapConfig): Promise<FetchedAttachment[]> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
    logger: false, // kein verbose IMAP-Logging
  });

  const results: FetchedAttachment[] = [];

  try {
    await client.connect();
    await client.mailboxOpen(cfg.folder ?? 'INBOX');

    // Alle ungelesenen Nachrichten suchen
    // DECISION: imapflow.search() returns false | number[] — guard against false
    const searchResult = await client.search({ seen: false });
    const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
    if (uids.length === 0) {
      return [];
    }

    logger.info(
      { folder: cfg.folder, count: uids.length },
      'IMAP: Ungelesene Nachrichten gefunden',
    );

    for await (const msg of client.fetch(uids, {
      uid: true,
      envelope: true,
      bodyParts: ['BODY[]'],
    })) {
      try {
        const envelope = msg.envelope;
        const emailFrom = envelope?.from?.[0]?.address ?? 'unbekannt';
        const emailSubject = envelope?.subject ?? '';
        const uid = String(msg.uid);

        // Rohinhalt parsen — imapflow liefert bodyParts als Map
        const rawBody = msg.bodyParts?.get('BODY[]');
        if (!rawBody) continue;

        // Einfacher Multipart-Parser für Anhänge
        const attachments = await parseAttachments(rawBody, emailFrom, emailSubject, uid);
        results.push(...attachments);

        // Als gelesen markieren
        await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);
      } catch (msgErr) {
        logger.warn({ msgErr }, 'IMAP: Fehler beim Verarbeiten einer Nachricht');
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return results;
}

/**
 * Einfacher Attachment-Extraktor: nutzt Node's built-in Buffer-Handling.
 * Für komplexe Multipart-E-Mails empfehlen wir das `mailparser`-Paket.
 */
async function parseAttachments(
  rawBody: Buffer,
  emailFrom: string,
  emailSubject: string,
  messageUid: string,
): Promise<FetchedAttachment[]> {
  // Dynamischer Import von mailparser (optional dependency)
  let simpleParser:
    | ((source: Buffer) => Promise<{
        attachments: Array<{
          filename?: string;
          contentType: string;
          content: Buffer;
        }>;
      }>)
    | null = null;

  try {
    // @ts-ignore — mailparser ist optional (npm install mailparser @types/mailparser)
    const mp = await import('mailparser');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    simpleParser = mp.simpleParser as typeof simpleParser;
  } catch {
    // mailparser nicht installiert — rohen Buffer zurückgeben falls PDF/Bild
    const mimeType = detectMimeFromBuffer(rawBody);
    if (mimeType && VALID_MIME.has(mimeType)) {
      return [
        {
          filename: `anlage_${messageUid}.${mimeType.split('/')[1]}`,
          mimeType,
          buffer: rawBody,
          messageUid,
          emailFrom,
          emailSubject,
        },
      ];
    }
    return [];
  }

  if (!simpleParser) return [];

  // @ts-ignore
  const parsed = await (
    simpleParser as (s: Buffer) => Promise<{
      attachments?: Array<{ filename?: string; contentType: string; content: Buffer }>;
    }>
  )(rawBody);
  const results: FetchedAttachment[] = [];

  for (const att of parsed.attachments ?? []) {
    const filename = att.filename ?? `anlage_${messageUid}`;
    const mimeType = att.contentType ?? 'application/octet-stream';
    if (!isValidAttachment(filename, mimeType)) continue;

    results.push({
      filename,
      mimeType,
      buffer: att.content,
      messageUid,
      emailFrom,
      emailSubject,
    });
  }

  return results;
}

function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)
    return 'application/pdf';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  return null;
}
