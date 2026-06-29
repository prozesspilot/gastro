# m08-reporting — Monats-Reporting (belege-Welt)

Erzeugt den **Monats-Übersichtsbericht** für einen Tenant + Vormonat als PDF,
legt ihn in MinIO ab und macht ihn über eine Staff-Route abrufbar.

> Portierung der eingefrorenen `M08_Monatsreporting.md`-Spec auf die **belege-Welt**:
> die Spec-SQL liest aus den toten `receipts`-Geister-Tabellen — wir aggregieren über
> die denormalisierten `belege`-Spalten. PDF via `core/pdf` (T086, pdf-lib — **kein**
> puppeteer, siehe M08-Spec-Notiz).

## Endpoint

```
POST /api/v1/reports/monthly/build      (m14 JWT + X-PP-Tenant-ID; mitarbeiter+, support→403)
  Body: { "year"?: number, "month"?: number }   // Default = Vormonat
  → 200 { report_id, period, totals, by_category, top_suppliers,
          comparison_prev_month, pdf_object_key, download_url, created_at }
```

`download_url` ist eine presigned MinIO-URL (1 h gültig).

## Aufbau

| Datei | Zweck |
|---|---|
| `services/aggregator.ts` | `computeMonthlyAggregates` — Totals, by_category, top_suppliers, Vormonatsvergleich über `belege` |
| `services/report-pdf.ts` | `renderMonthlyReportPdf` — Aggregate → PDF (`PdfDocumentBuilder`) |
| `services/report.repository.ts` | `upsertReportRow`/`getReportById`/`getTenantName` (RLS via `withTenant`) |
| `services/build-report.service.ts` | orchestriert: aggregieren → PDF → MinIO-Upload → Upsert + Audit |
| `handlers/build-report.handler.ts` | HTTP — Auth/Rollen-Gate, Perioden-Default/Validierung, presigned URL |
| `routes.ts` | Registrierung + Per-Route-Rate-Limit |

## Entscheidungen

- **Nur verbuchte Belege** (`BOOKED_STATUS`: categorized…completed) fließen in die Monatszahlen;
  `received`/`requires_review` sind noch nicht final.
- **Idempotenz** pro Tenant+Monat (UNIQUE-Constraint + `ON CONFLICT`): ein Re-Build überschreibt PDF + Row.
- **Defense-in-depth:** die Aggregat-Queries filtern explizit `tenant_id = $1` **zusätzlich** zur RLS
  (Geld-Aggregat soll nicht allein vom Session-GUC abhängen).
- **Netto/USt-Split bewusst nicht hier** — verlässlich ist nur `total_gross`; USt-Aufteilung gehört
  in die Steuerberater-Übergabe (Folge-Task T089).

## Folge-Tasks (NICHT in T087)

T089 Steuerberater-Übergabe-Mail (PDF-Anhang via A1-Mail, USt-Split, DATEV-CSV, Original-ZIP,
`report_deliveries`) · Cron-Trigger (`0 8 1 * *`) · Spar-Bericht für Wirt · Diagramme.
