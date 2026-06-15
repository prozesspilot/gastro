/**
 * T057/A1 — Mail-Template-Typ.
 *
 * Ein Template ist eine Sammlung typsicherer Render-Funktionen (keine Template-
 * Engine — String-Interpolation reicht für Plain-Text-Mails und ist test- und
 * typsicher). `html` ist optional; wenn gesetzt, MUSS `text` als Fallback bleiben.
 */
export interface MailTemplate<Vars> {
  /** Eindeutiger Name (Logging/Registry). */
  name: string;
  subject: (vars: Vars) => string;
  text: (vars: Vars) => string;
  html?: (vars: Vars) => string;
}
