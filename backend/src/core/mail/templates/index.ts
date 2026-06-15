/**
 * T057/A1 — Template-Registry.
 *
 * Re-Export der core-Templates + des `MailTemplate`-Typs. Modul-spezifische
 * Templates (DSGVO, Wizard, M09 …) liegen beim jeweiligen Modul und importieren
 * `MailTemplate` + `sendTemplate` aus core — core kennt keine Modul-Templates.
 */
export type { MailTemplate } from './types';
export { magicLinkTemplate, type MagicLinkVars } from './magic-link.template';
