/**
 * T010/M12 — Email-Versand fuer DSGVO.
 *
 * T057: Versand/Transport/Dry-Run/PII-Logging liegen jetzt zentral in
 * `core/mail`. Diese Datei hält nur noch die DSGVO-spezifischen deutschen
 * Texte und ruft `core/mail.sendMail` auf (generalisieren statt duplizieren).
 *
 * Zwei Mail-Typen:
 *   1. Auskunfts-Download-Link: an Subject, mit Signed-URL + ZIP-Passwort.
 *   2. Loeschungs-Confirm-Link: an Subject, mit Confirm-Token.
 *
 * Die Public-Signaturen (`Promise<boolean>`) bleiben unverändert — Caller
 * (`dsgvo-worker.ts`, `loeschung.handler.ts`) und deren Tests sind unberührt.
 */

import { sendMail } from '../../../core/mail/mail.service';

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
  const result = await sendMail({
    to: input.to,
    subject: 'Ihre DSGVO-Auskunft — Datenexport bereit',
    text,
  });
  return result.ok;
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
  const result = await sendMail({
    to: input.to,
    subject: 'Ihre DSGVO-Löschanfrage — Bestätigung erforderlich',
    text,
  });
  return result.ok;
}
