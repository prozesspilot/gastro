/**
 * M09 Template: reminder_overdue_de_v1
 * Mahnung bei überfälligem Beleg
 */

export const REMINDER_OVERDUE_DE_V1 = {
  subject: 'Dringende Erinnerung: Überfällige Rechnung {{supplier_name}} ({{ref}})',
  body_text: `Sehr geehrte Damen und Herren,

trotz unserer vorherigen Erinnerung haben wir noch keine Rechnung von Ihnen erhalten.

Wir bitten Sie dringend, uns die ausstehende Rechnung für {{period}} umgehend zuzusenden:
{{customer_belege_email}}

Bitte nutzen Sie den Referenzcode {{ref}} damit wir Ihre Rechnung korrekt zuordnen können.

Sollte die Rechnung bereits unterwegs sein, bitten wir Sie, diese Erinnerung zu ignorieren.

Mit freundlichen Grüßen
Buchhaltung {{customer_display_name}}`,
};
