# T045 — Reboot vollenden: M02–M09 von receipts auf belege/tenants portieren

> **Owner:** Backend (offen) — GROSSES Projekt
> **Priorität:** P1 — der eigentliche, noch offene Kern des belege/tenants-Reboots
> **Dependencies:** baut auf T028-Abbau (Option Z) auf
> **Entdeckt:** T028-Analyse 2026-06-02 (3 Agents, verifiziert)
> **Status:** backlog

---

## Problem (korrigierte Faktenlage — widerspricht ADR-004)

ADR-004 nahm an, der belege/tenants-Reboot sei „faktisch bereits vollzogen". Die T028-Analyse
zeigt: er ist nur **~20 %** vollzogen. Zwei parallele Welten:

- **Lebende belege-Welt:** nur `/api/v1/belege` (upload/list/detail) + OCR-Worker (`processBeleg`)
  + M05-Lexware-Export + DSGVO-Reads. Echte Tabellen.
- **Tote receipts/customers-Welt:** die komplette restliche Pipeline (M02-Archiv,
  M03-Kategorisierung, M04-DATEV, M06-Sevdesk, M07-Spreadsheet, M08-Reporting, M09-Supplier-Comm)
  hängt über `_shared/receipts/receipt.repository` an den **Geister-Tabellen** `receipts`/`customers`
  (existieren nicht). **Alle 18 n8n-Workflows** rufen ausschließlich diese tote Welt.

Siehe Memory `reboot-nur-teilweise-vollzogen`.

## Ziel

Die Beleg-Verarbeitungs-Pipeline M02–M09 vollständig auf `belege`/`tenants` + RLS migrieren, damit
die tote receipts/customers-Welt entfernt werden kann, ohne Funktionsverlust.

## Akzeptanz-Kriterien (grob — Task in Teil-PRs zerlegen)

- [ ] M02/M03/M04/M06/M07/M08/M09-Handler von `_shared/receipts` (Geister) auf `beleg.repository`
      (belege) + `tenants` umstellen, inkl. RLS-Tenant-Context (`setTenantContext`/`withTenant`).
- [ ] `_shared/receipts` Runtime-SQL entfernen; nur den `Receipt`-Typ in ein neutrales Type-Modul
      extrahieren (load-bearing für Adapter/Hooks).
- [ ] audit_log-Writer auf `logAuditEvent` umstellen (überschneidet sich mit [[T042]]).
- [ ] n8n-Workflows auf die neuen Endpunkte umstellen ODER Routen-Präfixe `/receipts`→belege-Handler
      umbiegen (Pilot-Risiko beachten, ADR-004 wollte Präfixe vorerst behalten).
- [ ] Dann: `customers`/`profiles`/`receipts`/`_shared/receipts`-Runtime + zugehörige Routen entfernen.
- [ ] ADR-004 mit der korrigierten Faktenlage revidieren.

## Hinweis

Vor diesem Projekt ist nur der isolierte Müll entfernt (T028 Option Z: documents/reports/stats/m03-ocr).
Die große Migration ist hier. Tot-Klassifikation der Module siehe Memory `legacy-welt-schema-drift`.
