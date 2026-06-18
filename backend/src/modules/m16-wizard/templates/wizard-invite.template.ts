/**
 * T016/Phase B — Onboarding-Wizard: Einladungs-Mail (Magic-Link).
 *
 * Modul-lokales Template (core/mail kennt keine Modul-Templates). Plain-Text;
 * Du-Anrede + einfache Sprache wie in der Wizard-Spec §7.2 vorgegeben.
 */
import type { MailTemplate } from '../../../core/mail/templates/types';

export interface WizardInviteVars {
  recipientName?: string;
  magicLinkUrl: string;
  /** Gültigkeit des Setup-Links in Tagen (Spec §6.1: 30 Tage). */
  ttlDays: number;
}

export const wizardInviteTemplate: MailTemplate<WizardInviteVars> = {
  name: 'wizard-invite',
  subject: () => 'Dein ProzessPilot-Setup kann losgehen',
  text: (v) => `Hallo${v.recipientName ? ` ${v.recipientName}` : ''},

willkommen bei ProzessPilot! Mit dem folgenden Link richtest du dein Konto in
wenigen Minuten selbst ein (du brauchst kein Passwort):

${v.magicLinkUrl}

Der Link ist ${v.ttlDays} Tage gültig. Du kannst zwischendurch pausieren und
später mit demselben Link weitermachen — dein Fortschritt bleibt gespeichert.

Lieber telefonisch? Antworte einfach auf diese E-Mail, dann übernehmen wir das
Setup für dich.

Viele Grüße
Das ProzessPilot-Team
`,
};
