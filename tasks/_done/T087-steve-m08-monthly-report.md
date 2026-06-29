# T087 — M08 Monats-Report: Aggregation + PDF + Persistenz + Build-Route

**ID:** T087
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out Phase D3 — Kundennutzen: Monats-Übersicht; nutzt A2-PDF-Engine T086 + A1-Mail T057)
**Branch:** `steve/T087-m08-monthly-report`
**Geschätzt:** 1–2 Tage
**Dependencies:** T086 (PDF-Engine) ✅ · A1 Mail (T057) ✅ · M01/M03/M05 belege-Pfad ✅
**Ziel-Meilenstein:** Build-out Phase D
**Anker:** `modules/M08_Monatsreporting.md` §1/§5/§8/§9 (auf belege-Welt portiert — die Spec-SQL zielt auf tote `receipts`-Geister-Tabellen; wir nutzen die **denormalisierten `belege`-Spalten**)

---

## Was zu tun ist

Erste M08-PR: den **Monats-Übersichtsbericht** für einen Tenant + Vormonat als PDF erzeugen,
in MinIO ablegen und über eine Staff-Route abrufbar machen. Aggregation läuft über die
**denormalisierten `belege`-Spalten** (`total_gross`, `category`, `supplier_name`,
`document_date`, `status`) — NICHT über `payload->...`-JSONB-Pfade der eingefrorenen Spec
(die zielen auf das tote `receipts`-Schema).

### Neues Modul `backend/src/modules/m08-reporting/`
1. **Migration `migrations/128_reports.sql`** (+ Rollback) — Tabelle `reports`:
   - `id UUID PK DEFAULT gen_random_uuid()`, `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
   - `period_year INT NOT NULL`, `period_month INT NOT NULL CHECK (1..12)`
   - `totals JSONB NOT NULL`, `pdf_object_key TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `UNIQUE (tenant_id, period_year, period_month)` — Idempotenz (Re-Build überschreibt via `ON CONFLICT`)
   - **RLS**: nach `030_belege.sql`-Muster — `ENABLE ROW LEVEL SECURITY` + Policy auf `tenant_id = current_setting('app.current_tenant')::uuid`. (Schreibpfad läuft unter `gastro_app`/RLS via `withTenant`.)
2. `services/aggregator.ts` — `computeMonthlyAggregates(db, tenantId, year, month)`:
   - Läuft via `withTenant(db, tenantId, …)`; nur Belege mit Status in einer **Whitelist verbuchter Belege** (`categorized`,`archived`,`exporting`,`exported`,`completed`) und `document_date` im Monat.
   - Liefert: `totals` (receipts_count, gross_sum), `by_category` (category + Label aus `system-categories`, count, gross_sum, DESC), `top_suppliers` (LIMIT 10, DESC), `comparison_prev_month` (gross_sum Vormonat + Delta %), `largest_single` (max total_gross).
   - NUMERIC kommt als String vom pg-Driver → in der Query `SUM(...)::float8` casten oder im Code coercen (vgl. `belege-voucher-builder.ts` `coerceAmount`).
3. `services/report-pdf.ts` — `renderMonthlyReportPdf(data, { tenantName, period, now? })` → `Buffer` via `PdfDocumentBuilder` (T086): Titel-Heading, KPI-Karten (Belege / Brutto gesamt / Veränderung Vormonat / größte Einzelausgabe), Tabelle „Ausgaben nach Kategorie", Tabelle „Top-10 Lieferanten". Beträge deutsch formatiert (`1.234,56 €`).
4. `services/report.repository.ts` — `upsertReport(db, tenantId, {...})` (ON CONFLICT) + `getReportById` (für Download).
5. `services/build-report.service.ts` — orchestriert: aggregieren → PDF rendern → MinIO-Upload (`uploadObject`, Key `${tenantId}/reports/${yyyy}-${mm}/monthly.pdf`) → `upsertReport` → Audit-Event `report.monthly_built` (via `core/audit`). Gibt `{ reportId, period, totals, pdfObjectKey }` zurück.
6. `routes.ts` + `handlers/build-report.handler.ts`:
   - `POST /api/v1/reports/monthly/build` — Body `{ year?, month? }` (Default = Vormonat); Auth `m14StaffAuthHook` + `m14TenantContextHook`; **Rolle `support` → 403** (read-only). Liest `tenantName` aus `tenants` (für PDF-Kopf). Antwort: Report-Metadaten + **presigned Download-URL** (`getPresignedDownloadUrl`).
   - Registrierung in `app.ts`: `await app.register(reportingRoutes, { prefix: '/api/v1' });`
7. `tests/` + `README.md`.

### Bewusst NICHT in diesem PR (Folge-Tasks)
- **T089 — Steuerberater-Übergabe-Mail** (M08 §17): Mail an `tenants.steuerberater_email` mit PDF-Anhang via A1-Mail, USt-Split (19/7/0), DATEV-CSV, ZIP der Original-Belege, Z-Bons, `report_deliveries`-Tabelle.
- Cron-Trigger (`0 8 1 * *`), Spar-Bericht für Wirt (§18), Quartals-USt (§19), Diagramme, Custom-Branding-Hook.

---

## Akzeptanz-Kriterien
- [x] Migration 128 `reports` + RLS + UNIQUE + Rollback; läuft via `migrate.ts`
- [x] `computeMonthlyAggregates` aggregiert korrekt über `belege` (verbuchte Status, Monatsfenster); DB-Integrationstest mit geseedeten Belegen (Totals, by_category, top_suppliers, Vormonatsvergleich) — `aggregator.integration.test.ts` (läuft in CI mit DB; lokal No-Op ohne Postgres)
- [x] Tenant-Isolation: Belege eines anderen Tenants fließen NICHT in die Aggregation ein (Isolations-Test + explizites `tenant_id`-Filter zusätzlich zur RLS)
- [x] `renderMonthlyReportPdf` liefert gültiges PDF (`%PDF-`, via `pdf-lib` ladbar); KPI-Karten + beide Tabellen; deutsche Beträge
- [x] `POST /reports/monthly/build` 200 mit Metadaten + presigned URL; `support` → 403; ohne Tenant/Auth → 401; ungültiger Monat → 400 (Handler-Unit-Test)
- [x] Idempotenz: zweiter Build desselben Monats überschreibt (ein `reports`-Row pro Tenant+Monat), kein Duplikat (Service-Integrationstest)
- [x] Leerer Monat (0 Belege): Report wird trotzdem erzeugt (Totals = 0), kein Crash (PDF-Test + Aggregator-Test)
- [x] Audit-Event `report.monthly_built` geschrieben (korrekte Spalten, kein PII im Log)
- [x] Test-Coverage neue Dateien · `biome check` sauber · Build/typecheck/lokale Suite grün (903 passed)
- [ ] CI grün (lint+typecheck+test+build) — *nach Push (inkl. DB-Integrationstests)*
- [ ] code-reviewer-Agent gibt OK — *im Review*

---

## Spec-Referenzen
- `Modulkonzept/Konzeptentwicklung/modules/M08_Monatsreporting.md` §1/§5/§8/§9 (Ziel-Inhalte; SQL auf belege-Welt portieren)
- `00_Buildout_Roadmap.md` §D3 (Reporting)
- Muster: `backend/src/modules/m05-lexoffice/` (Routen `belege-routes.ts`, Handler `req.tenantId`/`req.server.db`/`req.server.s3`/`req.m14Staff`, `belege-voucher-builder.ts` für NUMERIC-Coercion)
- `backend/src/modules/m03-categorization/services/categorize.service.ts` (Service-Signatur `(db, tenantId, …)` + Audit-Muster)
- `backend/src/modules/m03-categorization/system-categories.ts` (14 Kategorie-Labels)
- `backend/src/core/db/tenant.ts` (`withTenant`, RLS-GUC `app.current_tenant`)
- `backend/src/core/storage/storage.service.ts` (`uploadObject`, `getPresignedDownloadUrl`)
- `backend/src/core/pdf/` (T086 `PdfDocumentBuilder`) · `migrations/030_belege.sql` (RLS-Muster)

---

## Notes
- **NUMERIC-Falle:** `belege.total_gross` ist `NUMERIC(12,2)` → pg liefert String. In Aggregaten `::float8`/`::numeric`-Cast in SQL und im Code defensiv coercen (kein globaler `setTypeParser` im Repo).
- **Netto/USt-Split bewusst raus:** Verlässlich denormalisiert ist nur `total_gross`. Netto/USt-Aufteilung (19/7/0) braucht `payload.extraction.fields.tax_lines` pro Beleg → gehört in die Steuerberater-Übergabe (T089), nicht in die Übersicht.
- **Kategorie-Label:** `category` ist die ID (z. B. `bewirtung`); Label über `findCategory(id)?.name` aus `system-categories`. Unbekannte/`null`-Kategorie → „Nicht kategorisiert"-Sammelzeile.
- **RLS-Schreibpfad:** `reports`-Insert/Select über `withTenant`; falls `tenants`-Lesen (tenantName) an RLS scheitert, Muster aus `tenant.repository.ts` / SECURITY-DEFINER prüfen (vgl. Memory `tenants-write-rls-definer`).
- **`document_date` kann NULL sein** (Beleg ohne erkanntes Datum) → solche fallen aus dem Monatsfenster; im Report-Fuß optional „N Belege ohne Datum" vermerken (nice-to-have, nicht AK).

---

## Offene Fragen (während der Bearbeitung)

<keine — Scope ist eng; Mail/CSV/ZIP bewusst in T089>
