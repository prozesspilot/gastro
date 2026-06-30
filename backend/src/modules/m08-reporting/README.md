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

```
POST /api/v1/reports/:id/deliver        (m14 JWT + X-PP-Tenant-ID; mitarbeiter+, support→403)   [T089]
  → 200 { delivery_id, status: "sent", dry_run, message_id? }
  Fehler: 400 ungültige ID · 404 Report/PDF fehlt · 422 kein Steuerberater hinterlegt · 502 SMTP-Fehler
```

Stellt einen bereits gebauten Report per Mail (PDF-Anhang) an `tenants.advisor_email`
(= Steuerberater) zu. Dry-Run ohne SMTP gilt als `sent` (kein `message_id`).

## Aufbau

| Datei | Zweck |
|---|---|
| `services/aggregator.ts` | `computeMonthlyAggregates` — Totals, by_category, top_suppliers, Vormonatsvergleich, **USt-Split (T089)** über `belege` |
| `services/ust-split.ts` | `computeUstSplit` — Brutto/Netto/USt nach Satz (19/7/0 + nicht zuordenbar), pure (T089) |
| `services/report-pdf.ts` | `renderMonthlyReportPdf` — Aggregate → PDF (`PdfDocumentBuilder`), inkl. USt-Übersicht |
| `services/report.repository.ts` | `upsertReportRow`/`getReportById`/`getTenantName`/`getTenantHandoverInfo` (RLS via `withTenant`) |
| `services/report-delivery.repository.ts` | `upsertPendingDelivery`/`markDeliveryResult` — `report_deliveries` (T089) |
| `services/handover-mail.builder.ts` | `buildHandoverMail` — Steuerberater-Mail-Body (pure, T089) |
| `services/handover-mail.service.ts` | `deliverReport` — Report laden → PDF aus MinIO → Mail senden → Delivery + Audit (T089) |
| `services/build-report.service.ts` | orchestriert: aggregieren → PDF → MinIO-Upload → Upsert + Audit |
| `handlers/build-report.handler.ts` | HTTP — Auth/Rollen-Gate, Perioden-Default/Validierung, presigned URL |
| `handlers/deliver-report.handler.ts` | HTTP — Auth/Rollen-Gate, ID-Validierung, Status-Mapping (T089) |
| `routes.ts` | Registrierung + Per-Route-Rate-Limit |

## Entscheidungen

- **Nur verbuchte Belege** (`BOOKED_STATUS`: categorized…completed) fließen in die Monatszahlen;
  `received`/`requires_review` sind noch nicht final.
- **Idempotenz** pro Tenant+Monat (UNIQUE-Constraint + `ON CONFLICT`): ein Re-Build überschreibt PDF + Row.
- **Defense-in-depth:** die Aggregat-Queries filtern explizit `tenant_id = $1` **zusätzlich** zur RLS
  (Geld-Aggregat soll nicht allein vom Session-GUC abhängen).
- **USt-Split (T089):** je Beleg EIN Satz (`tax_rate`, sonst dominanter `tax_lines`-Satz) auf das
  volle `total_gross` → Σ(Split) reconciled mit `gross_sum`. Ohne Satz-Info **kein Raten** —
  Sammelposten „nicht zuordenbar" (GoBD-transparent). Mehrsatz-Belege per-Position-genau aufzuteilen
  ist eine spätere Verfeinerung.
- **Steuerberater-Empfänger (T089):** Spalte `tenants.advisor_email` (Naming English snake_case
  wie `advisor_cost_monthly`, Konvention §6.2; Fachbegriff „steuerberater_email"). Anrede generisch
  (kein Steuerberater-Name im Datenmodell).
- **Delivery-Idempotenz (T089):** UNIQUE `(report_id, channel, recipient_hash)`; erneuter Versand
  setzt denselben Row zurück auf `pending`. `recipient_hash` = SHA256 (PII-frei), nie die Klartext-Mail.
- **SMTP-I/O außerhalb der Tx:** Delivery-Pending (Tx1) → senden → Ergebnis+Audit (Tx2), damit keine
  offene Transaktion über den SMTP-Call gehalten wird.

## Folge-Tasks (NICHT in T087/T089)

DATEV-CSV-Anhang (M04) · Original-Belege-ZIP · Z-Bon-PDFs (M15) · Cron-Trigger (`0 8 1 * *`) ·
Spar-Bericht für Wirt (§18) · Quartals-USt (§19) · Mehrsatz-Belege per-Position-USt-Split.
