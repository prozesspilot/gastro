/**
 * M09 Template: missing_invoice_de_v2
 * Erinnerung bei fehlendem Pflicht-Beleg
 */

export const MISSING_INVOICE_DE_V2 = {
  subject: 'Erinnerung: Fehlende Rechnung {{supplier_name}} ({{ref}})',
  body_text: `Sehr geehrte Damen und Herren,

wir möchten Sie daran erinnern, dass wir für den Monat {{period}} noch keine Rechnung von Ihnen erhalten haben.

Für eine reibungslose Buchhaltung bitten wir Sie, uns die Rechnung baldmöglichst zuzusenden:
{{customer_belege_email}}

Bitte geben Sie dabei den folgenden Referenzcode an: {{ref}}

Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Buchhaltung {{customer_display_name}}`,
};
