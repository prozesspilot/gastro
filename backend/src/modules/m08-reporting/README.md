# M08 — Monatsreporting

Implementierung nach `Modulkonzept/Konzeptentwicklung/modules/M08_Monatsreporting.md`.

## Endpoints

```
POST /api/v1/customers/:customer_id/reports/monthly/build
POST /api/v1/customers/:customer_id/reports/monthly/deliver
GET  /api/v1/customers/:customer_id/reports
```

`build` aggregiert die receipts des Vormonats (oder body.period), rendert das PDF (pdf-lib) und speichert es in MinIO. `deliver` versendet PDF und Zusammenfassung über die in `profile.integrations.reporting.delivery_channels` konfigurierten Kanäle.

## Aggregation

`aggregator.ts` baut auf der `_shared/receipts`-Welt-A-Tabelle auf:
- Filter: `status IN ('archived','exported','completed','categorized')`
- Datum: bevorzugt `payload->extraction->fields->>document_date`, Fallback `created_at::date`
- Top 5 Kategorien (`payload->categorization->>category_label`)
- Top 5 Lieferanten (`payload->extraction->fields->>supplier_name`)
- Trend vs. Vormonat (Brutto-Summe)

## PDF-Layout

4 Seiten (A4), pdf-lib (Standard-Fonts Helvetica/Bold):
1. Titel: ProzessPilot Monatsbericht + Periode + Kundenname
2. KPI-Box: Belege, Brutto, Netto, Trend
3. Top-5 Kategorien
4. Top-5 Lieferanten

Kein Chart-Lib — alle Daten als Text-Tabelle. Footer: Erstellungsdatum + Seitenzählung.

## Idempotenz

`monthly_reports` UNIQUE(customer_id, period). Zweiter Build → existierender Report wird zurückgegeben. Status-Lifecycle: `pending` → `building` → `done` (oder `failed`).

## Versand (STUBs)

- `mail-sender.ts`: wirft `MailNotConfiguredError`, wenn `SMTP_HOST` fehlt. Phase-2-Implementation wird nodemailer nutzen.
- `whatsapp-sender.ts`: loggt nur. Phase 2 nutzt M10-MetaGraphClient + Template `monthly_report_de`.

Die `deliver`-Route funktioniert dennoch produktiv: `delivery_log` wird in DB geführt, fehlgeschlagene Channels werden mit `status='failed'` markiert und können später retryed werden.

## Cron-Workflow

`n8n/workflows/WF-M08.json`:
- Trigger: `0 8 1 * *` (1. eines Monats, 08:00)
- Holt Standard+Pro-Kunden, ruft build → deliver pro Kunde
