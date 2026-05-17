/**
 * M09 Template: low_quality_de_v1
 * Rückfrage bei unlesbarem/unvollständigem Beleg
 */

export const LOW_QUALITY_DE_V1 = {
  subject: 'Rechnung {{document_number}} – Bitte erneut zusenden ({{ref}})',
  body_text: `Sehr geehrte Damen und Herren,

am {{received_date}} ist Ihr Beleg "{{document_number}}" bei {{customer_display_name}} eingegangen.
Leider war die Datei nicht vollständig lesbar (Grund: {{reason_de}}).

Bitte senden Sie uns die Rechnung erneut als PDF an:
{{customer_belege_email}}

Bitte den Hinweis {{ref}} in der Antwort behalten – das hilft uns bei der Zuordnung.

Mit freundlichen Grüßen
Buchhaltung {{customer_display_name}}`,
};
