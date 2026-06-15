/**
 * T057/A1 — Referenz-Template: Magic-Link / Zugangslink (Plain-Text).
 *
 * Dient als Muster für modul-spezifische Templates (die beim jeweiligen Modul
 * liegen) und wird direkt vom Onboarding-Wizard (Phase B) für den Setup-Link genutzt.
 */
import type { MailTemplate } from './types';

export interface MagicLinkVars {
  recipientName?: string;
  magicLinkUrl: string;
  ttlMinutes: number;
}

export const magicLinkTemplate: MailTemplate<MagicLinkVars> = {
  name: 'magic-link',
  subject: () => 'Ihr ProzessPilot-Zugangslink',
  text: (v) => `Hallo${v.recipientName ? ` ${v.recipientName}` : ''},

hier ist Ihr persönlicher Zugangslink (gültig ${v.ttlMinutes} Minuten):

${v.magicLinkUrl}

Wenn Sie diesen Link nicht angefordert haben, ignorieren Sie diese E-Mail.

Viele Grüße
Das ProzessPilot-Team
`,
};
