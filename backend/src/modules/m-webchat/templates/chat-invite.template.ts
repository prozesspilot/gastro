/**
 * T068/Phase C — Web-Chat-Widget: Einladungs-/Alarm-Mail (Magic-Link).
 *
 * Modul-lokales Template (core/mail kennt keine Modul-Templates). Plain-Text;
 * Du-Anrede + einfache Sprache (Web_Chat_Widget.md §7.2 / Onboarding-Wizard-Vorbild).
 * Marke im Customer-Text durchgängig „ProzessPilot" (CLAUDE.md §0/§5.2).
 */
import type { MailTemplate } from '../../../core/mail/templates/types';

export interface ChatInviteVars {
  recipientName?: string;
  magicLinkUrl: string;
}

export const chatInviteTemplate: MailTemplate<ChatInviteVars> = {
  name: 'chat-invite',
  subject: () => 'Dein direkter Draht zu ProzessPilot',
  text: (v) => `Hallo${v.recipientName ? ` ${v.recipientName}` : ''},

ab jetzt kannst du deine Belege direkt über deinen persönlichen ProzessPilot-Chat
schicken — einfach mit dem Handy abfotografieren und hochladen, wir kümmern uns
um den Rest. Fragen? Schreib uns im selben Chat, wir antworten meist innerhalb
weniger Stunden.

Hier geht's zu deinem Chat (kein Passwort nötig):

${v.magicLinkUrl}

Der Link bleibt für dich gespeichert — du kannst jederzeit zurückkehren.

Viele Grüße
Das ProzessPilot-Team
`,
};
