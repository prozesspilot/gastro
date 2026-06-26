---
name: reboot-nur-teilweise-vollzogen
description: "WICHTIG — ADR-004-Prämisse ist falsch. Der belege/tenants-Reboot ist nur ~20% vollzogen; die komplette Beleg-Pipeline (M02-M09) lebt nur in der toten receipts-Welt, an der auch n8n hängt. \"Legacy abbauen\" = Funktionsverlust, kein Aufräumen."
metadata: 
  node_type: memory
  type: project
  originSessionId: 6384482f-70ac-4b1f-8e89-88c1ea2eb49f
---

**Verifiziert 2026-06-02** durch 3 parallele Analyse-Agents (n8n-Pfade, Modul-Klassifikation, Routen-Kollision) im Rahmen von T028 "Legacy abbauen".

**Kernbefund — ADR-004 liegt falsch:** ADR-004 behauptet, der belege/tenants-Reboot sei "faktisch bereits vollzogen" und "M01–M08 arbeiten intern auf belege/tenants". Beides ist **falsch**. Tatsächlich gibt es zwei parallele Welten:

- **Lebende belege-Welt (~20% der Pipeline):** nur `/api/v1/belege` (upload/list/detail, `beleg.repository.ts`) + OCR-Worker (`processBeleg`, BullMQ) + M05-Lexware-Export (`belege-lexware-exporter.ts`, `export-log.repository.ts`) + DSGVO-Reads. Nutzt echte Tabellen `belege`/`tenants`.
- **Tote receipts/customers-Welt (der ganze Rest):** ALLE `/receipts/*`- und `/customers/*`-Handler — receiptRoutes/customerRoutes/profileRoutes (CRUD) UND die M0x-Handler (M01-extract, M02-Archiv, M03-Kategorisierung/OCR, M04-DATEV, M06-Sevdesk, M07-Spreadsheet, M08-Reporting, M09-Supplier-Comm) — hängen über `_shared/receipts/receipt.repository` an den **Geister-Tabellen** `receipts`/`customers`/`customer_profiles`/`documents`, die nicht existieren (kein CREATE TABLE). Jeder Aufruf wirft `relation does not exist`.

**n8n hängt komplett an der toten Welt:** Alle 18 Workflows in `n8n/workflows/*.json` rufen ausschließlich `/receipts/*`, `/customers/:id/reports|datev`, `/internal/customers|profile`, `/routing/plan`, `/communications` — **null** Calls auf `/belege`/`/tenants`. Die n8n-Produktions-Pipeline läuft also gegen nicht-existente Tabellen (entweder nie produktiv genutzt oder komplett kaputt).

**Konsequenz für T028:** "Legacy abbauen" bedeutet NICHT Aufräumen, sondern **Funktionsverlust** — M02/M03/M04/M06/M07/M08/M09 existieren nur in der toten Welt und haben keinen belege-Ersatz. Echte Optionen: (X) M02-M09 erst von receipts auf belege/tenants portieren, dann tote Welt entfernen (Wochen-Projekt); (Y) tote Welt jetzt entfernen + Funktionsverlust akzeptieren (nur wenn M02-M09 ohnehin neu gebaut + n8n neu verdrahtet wird); (Z) nur die wenigen wirklich isolierten toten Module entfernen (documents, reports, stats, m03-ocr — kein n8n-Consumer, keine lebende Tabelle).

ADR-004 muss revidiert werden, bevor irgendwer Code löscht. Verwandt: [[legacy-welt-schema-drift]] (Symptome), [[rls-guc-key-mismatch]].
