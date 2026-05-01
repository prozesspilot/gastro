/**
 * M09 Template: confirmation_received_de_v1
 * Bestätigung bei erfolgreichem Belegeingang
 */

export const CONFIRMATION_RECEIVED_DE_V1 = {
  subject: 'Belegeingang bestätigt: {{document_number}} ({{ref}})',
  body_text: `Sehr geehrte Damen und Herren,

wir bestätigen den Eingang Ihres Beleges "{{document_number}}" vom {{document_date}}.

Ihr Beleg wurde erfolgreich in unserem System erfasst und wird zeitnah weiterverarbeitet.

Referenz für Ihre Unterlagen: {{ref}}

Vielen Dank für Ihre Zusammenarbeit.

Mit freundlichen Grüßen
Buchhaltung {{customer_display_name}}`,
};
