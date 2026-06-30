# M07 — Belege-Export (CSV)

Maschinenlesbarer **CSV-Download** der verbuchten Belege eines Monats — Fallback für
Steuerberater **ohne** Lexware-Direktanbindung (M05), komplementär zum M08-PDF-Report.

## Endpoint

```
GET /api/v1/exports/belege.csv?year=2026&month=5
```
- Auth: M14-JWT-Cookie (`pp_auth`) + `X-PP-Tenant-ID`-Header. Rolle `support` → 403 (read-only).
- Ohne `year`/`month` → Vormonat (wie M08).
- Antwort: `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="belege-2026-05.csv"`.

## CSV-Format (deutscher Steuerberater-Kontext)

- Trennzeichen `;`, Dezimal-Komma (`1234,56`), Datum `YYYY-MM-DD`, CRLF + UTF-8-BOM
  (öffnet sauber in Excel-DE inkl. Umlaute). RFC-4180-Quoting.
- Spalten (Schema portiert aus `Modulkonzept/.../M07_Excel_Sheets_Export.md` §8 auf belege):
  Datum · Lieferant · Belegnummer · Kategorie · SKR-Konto · Brutto · Netto · MwSt-Betrag ·
  MwSt-Satz · Waehrung · Status · Beleg-ID · Eingang am.
- Beleg-Menge = `BOOKED_STATUS` + `document_date`-Monatsfenster (identisch zum M08-Aggregator).

## Struktur

```
m07-export/
├── export.routes.ts                    # GET /exports/belege.csv (mitarbeiter+, support→403)
├── handlers/export-csv.handler.ts      # Auth/Period-Validierung → Fetch → CSV
├── services/
│   ├── belege-csv.ts                   # PURE: buildBelegeCsv() + csvFileName()  ← Unit-Tests
│   └── belege-export.repository.ts     # fetchBelegeForMonth() (withTenant, payload→Row)
└── tests/belege-csv.test.ts
```
Integrationstest des Repositories: `src/__tests__/integration/m07-belege-export.test.ts` (CI).

## Bewusst NICHT enthalten (gated / spätere Phase)

- **Cloud-Sync** (Google Sheets / OneDrive append aus der Alt-Spec §9) — braucht OAuth-Apps
  (Google Sheets API / MS Graph) → externe Credentials, eigener gated Folge-Task.
- DATEV-CSV (M04) ist ein separates Format/Modul.
