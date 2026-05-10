/**
 * M09 — Template-Renderer
 *
 * Einfacher String-Replace: {{variable}} → Wert
 * Gibt { subject, body_text, body_html } zurück.
 * body_html = body_text in <pre> gewrappt (MVP).
 */

import { CONFIRMATION_RECEIVED_DE_V1 } from '../templates/confirmation_received_de_v1';
import { LOW_QUALITY_DE_V1 } from '../templates/low_quality_de_v1';
import { MISSING_INVOICE_DE_V2 } from '../templates/missing_invoice_de_v2';
import { REMINDER_OVERDUE_DE_V1 } from '../templates/reminder_overdue_de_v1';

export type TemplateKey =
  | 'low_quality_de_v1'
  | 'missing_invoice_de_v2'
  | 'confirmation_received_de_v1'
  | 'reminder_overdue_de_v1';

export interface TemplateVars {
  [key: string]: string | number | undefined;
}

export interface RenderedEmail {
  subject: string;
  body_text: string;
  body_html: string;
}

const TEMPLATES: Record<TemplateKey, { subject: string; body_text: string }> = {
  low_quality_de_v1: LOW_QUALITY_DE_V1,
  missing_invoice_de_v2: MISSING_INVOICE_DE_V2,
  confirmation_received_de_v1: CONFIRMATION_RECEIVED_DE_V1,
  reminder_overdue_de_v1: REMINDER_OVERDUE_DE_V1,
};

/**
 * Rendert ein Template durch einfache {{variable}} Ersetzung.
 */
export function renderTemplate(templateKey: TemplateKey, vars: TemplateVars): RenderedEmail {
  const template = TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Unbekanntes Template: ${templateKey}`);
  }

  const subject = replaceVars(template.subject, vars);
  const bodyText = replaceVars(template.body_text, vars);
  const bodyHtml = `<pre style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(bodyText)}</pre>`;

  return { subject, body_text: bodyText, body_html: bodyHtml };
}

function replaceVars(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Bestimmt das Template basierend auf Trigger und Reason.
 */
export function pickTemplate(trigger: string, reason?: string): TemplateKey {
  if (trigger === 'requires_review') {
    if (reason === 'LOW_QUALITY') return 'low_quality_de_v1';
    if (reason === 'MISSING_FIELDS') return 'missing_invoice_de_v2';
    return 'low_quality_de_v1';
  }
  if (trigger === 'confirmation') return 'confirmation_received_de_v1';
  if (trigger === 'missing_receipt') return 'missing_invoice_de_v2';
  if (trigger === 'overdue') return 'reminder_overdue_de_v1';
  return 'low_quality_de_v1';
}

/**
 * Reason-Codes auf deutschsprachige Texte mappen.
 */
export const REASON_DE: Record<string, string> = {
  LOW_QUALITY: 'Dateiqualität zu niedrig (unlesbar)',
  MISSING_FIELDS: 'Pflichtfelder fehlen (z.B. Datum, Betrag)',
  DUPLICATE: 'Mögliches Duplikat erkannt',
  INVALID_FORMAT: 'Ungültiges Dateiformat',
};
