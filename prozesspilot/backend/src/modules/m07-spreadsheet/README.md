# M07 — Excel / Google Sheets Export

Schreibt jeden archivierten/kategorisierten Beleg als **eine Zeile** in eine
vom Kunden gewählte Tabelle. Im MVP ist Google Sheets vollständig
implementiert; Excel/OneDrive ist als Stub vorbereitet (Phase 2).

> **Spec:** `Konzeptentwicklung/modules/M07_Excel_Sheets_Export.md`
> **Migration:** `migrations/004_spreadsheet_row_index.sql`
> **n8n-Workflow:** `n8n/workflows/WF-M07.json`

---

## Endpoint

```
POST /api/v1/receipts/:receipt_id/exports/spreadsheet
```

### Body

```json
{
  "trace_id": "trc_a8f3d2c1",
  "customer_profile": {
    "customer_id": "cust_a3f4b2",
    "modules_enabled": ["M01", "M02", "M07"],
    "integrations": {
      "spreadsheet": {
        "provider": "google_sheets",
        "config": {
          "sheet_id":          "1zXyZ-abc-...",
          "tab_name_template": "Belege {year}"
        }
      }
    },
    "custom": {
      "spreadsheet_extra_columns": [
        { "header": "Filiale", "jsonpath": "meta.custom.branch" }
      ]
    }
  }
}
```

### Response (200)

```json
{
  "ok": true,
  "data": {
    "module": "M07",
    "receipt": { "...vollständiges Receipt..." },
    "receipt_patch": {
      "status":  "exported",
      "exports": [ { "target": "google_sheets", "status": "pushed", ... } ]
    },
    "events_to_emit": ["pp.receipt.exported"]
  }
}
```

### Fehler

| HTTP | Code                  | Wann                                              |
|-----:|-----------------------|---------------------------------------------------|
|  404 | `NOT_FOUND`           | Receipt unbekannt für customer_id                 |
|  409 | `CONFLICT`            | Status nicht in `{archived, categorized}`         |
|  422 | `VALIDATION_ERROR`    | Body-Schema verletzt                              |
|  422 | `HEADER_CONFLICT`     | Header in Sheet weicht ab — Operator-Alert (M07 §12) |
|  502 | `EXTERNAL_API_FAILED` | Sheets-API-Fehler (Quota, Auth, …)                |

---

## Datenfluss

```
n8n WF-M07
  └► POST /api/v1/receipts/:id/exports/spreadsheet
        ├─ receiptRepo.findById     (status ∈ {archived, categorized})
        ├─ spreadsheetAdapterFactory.for(provider)
        ├─ renderTabName(template, receipt)        ← Jahres-Rotation
        ├─ adapter.ensureTabExists(...)
        ├─ adapter.ensureHeader(..., COLUMNS)      ← M07 §12: KEINE Auto-Korrektur
        ├─ buildRow(receipt, {extraColumns})
        ├─ adapter.findRowByReceiptId(...)         ← spreadsheet_row_index
        │     ├─ Treffer  → adapter.updateRow(...)
        │     └─ kein     → adapter.appendRow(...) → INSERT spreadsheet_row_index
        ├─ receipt.exports patchen + status='exported'
        ├─ audit_log INSERT
        └─ XADD pp:events:receipt {type=pp.receipt.exported}
```

---

## Spalten-Schema (M07 §8)

16 Pflicht-Spalten in fester Reihenfolge A..P, plus optional X..Z für
`profile.custom.spreadsheet_extra_columns`.

| #  | Header        | Quelle                                        |
|----|---------------|-----------------------------------------------|
| A  | Datum         | `extraction.fields.document_date`             |
| B  | Lieferant     | `extraction.fields.supplier_name`             |
| C  | Belegnummer   | `extraction.fields.document_number`           |
| D  | Kategorie     | `categorization.category_label` (`–` falls leer) |
| E  | SKR-Konto     | `categorization.skr_account`                  |
| F  | Kostenstelle  | `categorization.cost_center`                  |
| G  | Brutto        | `extraction.fields.total_gross`               |
| H  | Netto         | `extraction.fields.total_net`                 |
| I  | MwSt-Betrag   | `Σ extraction.fields.tax_lines.amount`        |
| J  | MwSt-Satz     | dominanter Satz × 100                          |
| K  | Währung       | `extraction.fields.currency`                  |
| L  | Zahlungsart   | `extraction.fields.payment_method`            |
| M  | Beleg-Datei   | `=HYPERLINK("archive.external_url","filename")` |
| N  | Status        | `status`                                      |
| O  | Receipt-ID    | `receipt_id`                                  |
| P  | Eingang am    | `audit.events[type=received].at`              |

---

## Tab-Name-Templates

Default: `"Belege {year}"` → `"Belege 2026"`

Verfügbare Platzhalter: `{year}`, `{month}` (`01..12`), `{month_de}`
(`Januar..Dezember`), `{quarter}` (`Q1..Q4`).

Beispiele:
- `"Belege {year}"` → `Belege 2026`
- `"{year}-{quarter}"` → `2026-Q2`
- `"{month_de} {year}"` → `April 2026`

Quelle der Datumsableitung (in dieser Reihenfolge):
1. `extraction.fields.document_date`
2. `audit.events[type=received].at`
3. `created_at`
4. `now()` (Fallback)

---

## Idempotenz

`spreadsheet_row_index` (PK: `customer_id, sheet_id, tab, receipt_id`) cached
das Mapping `receipt_id → row_index`. Re-Runs überschreiben die existierende
Zeile via `values.update`, sodass:
- die Zeilen-Position stabil bleibt,
- KEINE Duplikate im Sheet entstehen,
- ein versehentlicher Re-Run aus n8n folgenlos ist.

Die DB-Tabelle hat **kein RLS** (M07-Vorgabe): keine sensiblen Daten,
nur Index-Mapping. customer_id ist dennoch Teil des PK, sodass
Cross-Tenant-Queries strukturell ausgeschlossen sind.

---

## Adapter-Architektur

```
backend/src/core/adapters/spreadsheet/
├── adapter.interface.ts        ── SpreadsheetAdapter, RowValue, ColumnDef
├── google-sheets.adapter.ts    ── googleapis + OAuth2 (kind='sheets_oauth' | 'gdrive_oauth')
├── excel-onedrive.adapter.ts   ── Stub (Phase 2)
└── factory.ts                  ── spreadsheetAdapterFactory.for(provider)
```

**Google Sheets — wichtige API-Details:**
- `valueInputOption=USER_ENTERED` ist Pflicht — sonst wird `=HYPERLINK(...)` als
  String gespeichert.
- `insertDataOption=INSERT_ROWS` schiebt Daten unter dem letzten befüllten
  Bereich ein, statt zu überschreiben.
- OAuth2 nutzt denselben `OAuth2Client` wie Google Drive (M02). Wenn der
  Drive-OAuth-Scope nicht `https://www.googleapis.com/auth/spreadsheets`
  enthält, muss ein separates Credential mit `kind='sheets_oauth'` angelegt
  werden — der Adapter wirft sonst beim ersten Call.

---

## Code-Layout

```
backend/src/modules/m07-spreadsheet/
├── routes.ts                    ── Fastify-Routen-Registry
├── handlers/
│   └── append.handler.ts        ── POST /:id/exports/spreadsheet
├── schemas/
│   └── append.input.ts          ── Zod-Schema für den Body
├── services/
│   ├── columns.ts               ── 16 Pflicht-Spalten (M07 §8)
│   ├── row-builder.ts           ── buildRow(receipt, {extraColumns})
│   ├── tab-name-resolver.ts     ── renderTabName(template, receipt)
│   ├── jsonpath.ts              ── Mini-Dot-Notation für Extra-Columns
│   ├── audit.service.ts         ── audit_log-Wrapper
│   └── event-emitter.ts         ── pp.receipt.exported / .export_failed
├── tests/
│   ├── append.handler.test.ts   ── Append/Update/Tab/Header/Extras
│   ├── row-builder.test.ts      ── 16 Spalten + Hyperlink + MwSt
│   └── tab-name-resolver.test.ts── Jahres-Rotation
└── README.md                     ── (dieses Dokument)
```

---

## Tests

```bash
cd backend
npm test -- m07-spreadsheet
```

Erwartete Suiten:
- `M07 row-builder — buildRow()` (12+ Cases)
- `M07 tab-name-resolver — renderTabName()` (8 Cases)
- `M07 append.handler` (T1..T5 + 404/409)

---

## Acceptance Criteria (M07 §14) — Verifikation

| #  | Kriterium                                                   | Wo bewiesen                                                                 |
|----|-------------------------------------------------------------|-----------------------------------------------------------------------------|
| 1  | Erste Zeile ist immer Header — wird angelegt, wenn fehlt     | `tests/append.handler.test.ts T4` + `google-sheets.adapter.ts ensureHeader` |
| 2  | Re-Run derselben Receipt-ID aktualisiert die Zeile, nicht doppelt | `tests/append.handler.test.ts T2` (existingRow=99 → updateRow)              |
| 3  | Hyperlink in Spalte M öffnet die Beleg-PDF                   | `tests/row-builder.test.ts` (Hyperlink-Formel) + `valueInputOption=USER_ENTERED` |
| 4  | Tab-Wechsel zum Jahreswechsel passiert automatisch            | `tests/tab-name-resolver.test.ts` (2026 → 2027 an Jahresgrenze)             |
| 5  | Profile-Erweiterung über `spreadsheet_extra_columns`         | `tests/append.handler.test.ts T5` (Filiale + OCR-Confidence rechts)         |
| 6  | Idempotenz, Audit-Log korrekt                                | `tests/append.handler.test.ts T2` + `audit.service.ts writeAudit`           |

---

## Decisions

| ID    | Entscheidung                                                                                                                                          | Begründung                                                                                                                                                      |
|-------|-------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| M07.1 | Migration liegt in `migrations/004_…` (Repo-Root), nicht in `backend/migrations/`.                                                                    | Bestehende Konvention im Projekt: alle Migrationen aus `001`, `002`, `003`, `010` liegen im Repo-Root. `migrate.ts` zeigt explizit dorthin.                     |
| M07.2 | RLS auf `spreadsheet_row_index` deaktiviert (per Aufgabe).                                                                                            | Tabelle enthält nur den Sheet-Index (kein Receipt-Inhalt, keine Beträge, keine PII). customer_id im PK schließt Cross-Tenant-Lookups strukturell aus.            |
| M07.3 | OAuth-Credential-Lookup priorisiert `kind='sheets_oauth'`, fällt auf `kind='gdrive_oauth'` zurück, wenn dessen Scope Sheets abdeckt.                  | M02 nutzt für Drive bereits `gdrive_oauth`. Wenn beim Onboarding der Sheets-Scope mit-genehmigt wurde, ist KEIN zweites Credential nötig — das spart einen OAuth-Flow. |
| M07.4 | Kategorie-Fallback ist `–` (Em-Dash), nicht `-`.                                                                                                       | M07 §8 schreibt explizit `–` (typografisch korrekt für Listen-Lücken auf Deutsch).                                                                              |
| M07.5 | MwSt-Satz wird als **Zahl** (z. B. `19`) geschrieben, nicht als Prozent-String. Sheets formatiert die Zelle als `%`.                                  | `valueInputOption=USER_ENTERED` lässt Sheets selbst entscheiden; eine numerische 19 wird mit `%`-Format zu „19,00 %".                                            |
| M07.6 | Mini-Dot-JSONPath statt `jsonpath-plus`.                                                                                                              | Spec verlangt nur einfache Pfade (`a.b.c`, `items[0].name`). Eine 7-kB-Dependency erfüllt die Anforderung nicht besser, kostet aber Bundle-Größe & Audit-Surface. |
| M07.7 | `googleapis` + `google-auth-library` neu in `backend/package.json`.                                                                                   | Im aktuellen `package.json` war `googleapis` noch nicht enthalten (anders als die Aufgabenstellung annimmt). M02 ist parallel in Arbeit; die Dependency dient beiden Modulen. |
| M07.8 | `appendRow`/`updateRow` bekommen `receiptId` als Argument (Spec hatte ihn nur über `findRowByReceiptId` mitgegeben).                                  | Sonst müsste der Adapter zwischen Append und Cache-Insert die receiptId via Closure halten — eine sichtbare Signatur ist robuster und erlaubt Re-Use ohne Handler. |
| M07.9 | `excel_onedrive` wirft hart (`NOT_IMPLEMENTED`), statt zu silently faillen.                                                                            | Spec sagt explizit „Phase 2". Ein Stub, der OK zurückgibt, würde Belege scheinbar erfolgreich exportieren, ohne dass etwas passiert — schlechter als ein lauter Fehler. |
