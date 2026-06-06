# M07 — Excel / Google Sheets Export

> ⚠️ **EINGEFROREN (Stand 2026-06-06)** — beschreibt ein ungebautes/totes Modul, das aktuell gegen nicht-existente (Geister-)Tabellen läuft (HTTP 500). Stand veraltet; diese Spec gilt erst nach Reaktivierung (Post-Pilot). Was wirklich läuft, steht in `.claude/CLAUDE.md` §3.

> **Paket:** Basic, Standard, Pro
> **Phase:** 1 (MVP)
> **Verantwortlich:** Append-Export jedes Belegs als Zeile in Excel oder Google Sheet
> **Spec-Version:** 1.0

---

## 1. Zweck

M07 schreibt jeden verarbeiteten Beleg als **eine Zeile** in eine vom Kunden gewählte Tabelle (Google Sheet oder Excel-Datei in OneDrive/Dropbox). Für Basic-Kunden ist das das einzige Export-Ziel, ersetzt für sie quasi die Buchhaltungssoftware-Pflege.

---

## 2. Verantwortlichkeit

- Mapping `Receipt → Tabellenzeile` gemäß Spalten-Schema.
- Append in Sheet/Datei (oder Update bei Re-Run).
- Stelle sicher, dass Header-Zeile existiert.
- Jährlicher Tab-Wechsel (z. B. „Belege 2026" → „Belege 2027") wird automatisiert.

---

## 3. Trigger

- Sub-Workflow aus `WF-MASTER-RECEIPT`.
- Akzeptierter Status: `archived` oder `categorized`.

---

## 4. Abhängigkeiten

| Abhängigkeit         | Genutzt für                     |
|----------------------|---------------------------------|
| Google Sheets API    | Standard-Pfad                   |
| MS Graph API (Excel) | Optional (OneDrive-Excel)       |
| ExcelJS              | Lokales Excel im Drive/Dropbox  |

---

## 5. Input / Output

### 5.1 Input

```json
{ "receipt": { "..." }, "customer_profile": { "...mit spreadsheet config..." } }
```

### 5.2 Output

```json
{
  "ok": true,
  "module": "M07",
  "receipt_patch": {
    "exports": [
      {
        "target": "google_sheets",
        "status": "pushed",
        "external_id": "1zXyZ-abc-...:Belege 2026!A157",
        "external_url": "https://docs.google.com/spreadsheets/d/1zXyZ.../edit#gid=0&range=A157",
        "pushed_at": "2026-04-29T08:14:55Z"
      }
    ]
  },
  "events_to_emit": ["pp.receipt.exported"]
}
```

---

## 6. n8n-Workflow `WF-M07`

| #  | Node                | Name                              |
|----|---------------------|-----------------------------------|
| 1  | Execute Workflow    | `Trigger`                         |
| 2  | Code                | `Function: assert_status`         |
| 3  | HTTP Request        | `Backend: Append Row`             |
| 4  | IF                  | `IF: ok`                          |
| 5  | Set                 | `Build: Result`                   |
| 6  | Respond to Workflow | `Respond`                         |

Endpoint: `POST /api/v1/receipts/{id}/exports/spreadsheet`.

---

## 7. Backend-API

### 7.1 `POST /api/v1/receipts/{receipt_id}/exports/spreadsheet`

```ts
async function appendToSpreadsheet(receiptId: string, profile: CustomerProfile) {
  let receipt = await receiptRepo.findById(receiptId, profile.customer_id);
  assertStatus(receipt, ['archived', 'categorized']);

  const cfg = profile.integrations.spreadsheet;
  const adapter = spreadsheetAdapterFactory.for(cfg.provider);    // 'google_sheets' | 'excel_onedrive'

  // Tab-Name dynamisch (Jahres-Rotation)
  const tabName = renderTabName(cfg.config.tab_name, receipt);     // z. B. "Belege 2026"
  await adapter.ensureTabExists(profile.customer_id, cfg.config.sheet_id, tabName);

  // Header-Zeile sicherstellen
  await adapter.ensureHeader(profile.customer_id, cfg.config.sheet_id, tabName, COLUMNS);

  // Idempotenz: schon exportiert?
  const existingRow = await adapter.findRowByReceiptId(profile.customer_id, cfg.config.sheet_id, tabName, receipt.receipt_id);

  const row = buildRow(receipt);

  let result;
  if (existingRow) {
    result = await adapter.updateRow(profile.customer_id, cfg.config.sheet_id, tabName, existingRow.row_index, row);
  } else {
    result = await adapter.appendRow(profile.customer_id, cfg.config.sheet_id, tabName, row);
  }

  receipt.exports = [...(receipt.exports ?? []).filter(e => e.target !== cfg.provider), {
    target: cfg.provider,
    status: 'pushed',
    external_id: `${cfg.config.sheet_id}:${tabName}!A${result.row_index}`,
    external_url: result.url,
    pushed_at: new Date().toISOString(),
  }];

  if (receipt.status !== 'exported') receipt.status = 'exported';

  const saved = await receiptRepo.update(receipt);
  await audit.log(saved, `exported.${cfg.provider}`, { row_index: result.row_index });
  await events.emit('pp.receipt.exported', { ...saved, target: cfg.provider });
  return saved;
}
```

---

## 8. Spalten-Schema

Verbindlich (alle Provider erzeugen die gleichen Spalten in der gleichen Reihenfolge):

| #  | Header              | Quelle                                              | Format               |
|----|---------------------|-----------------------------------------------------|----------------------|
| A  | Datum               | `extraction.fields.document_date`                   | `YYYY-MM-DD`         |
| B  | Lieferant           | `extraction.fields.supplier_name`                   | text                 |
| C  | Belegnummer         | `extraction.fields.document_number`                 | text                 |
| D  | Kategorie           | `categorization.category_label`                     | text (`–` falls leer)|
| E  | SKR-Konto           | `categorization.skr_account`                        | text                 |
| F  | Kostenstelle        | `categorization.cost_center`                        | text                 |
| G  | Brutto              | `extraction.fields.total_gross`                     | Zahl 2-stellig       |
| H  | Netto               | `extraction.fields.total_net`                       | Zahl                 |
| I  | MwSt-Betrag         | `Σ extraction.fields.tax_lines.amount`              | Zahl                 |
| J  | MwSt-Satz           | dominanter Satz × 100                                | `%`                  |
| K  | Währung             | `extraction.fields.currency`                        | text                 |
| L  | Zahlungsart         | `extraction.fields.payment_method`                  | text                 |
| M  | Beleg-Datei         | `archive.path` als Hyperlink                         | Hyperlink            |
| N  | Status              | `status`                                            | text                 |
| O  | Receipt-ID          | `receipt_id`                                        | text                 |
| P  | Eingang am          | `audit.events[type=received].at`                    | datetime             |

**Erweiterung pro Kunde** über `profile.custom.spreadsheet_extra_columns` (Liste zusätzlicher Spalten mit JSONPath-Quelle).

---

## 9. Spreadsheet-Adapter

```
backend/src/core/adapters/spreadsheet/
├── adapter.interface.ts
├── google-sheets.adapter.ts
├── excel-onedrive.adapter.ts
└── factory.ts
```

### 9.1 Interface

```ts
export interface SpreadsheetAdapter {
  readonly id: 'google_sheets' | 'excel_onedrive';
  ensureTabExists(customerId: string, sheetId: string, tab: string): Promise<void>;
  ensureHeader(customerId: string, sheetId: string, tab: string, columns: ColumnDef[]): Promise<void>;
  findRowByReceiptId(customerId: string, sheetId: string, tab: string, receiptId: string): Promise<RowRef | null>;
  appendRow(customerId: string, sheetId: string, tab: string, row: RowValue[]): Promise<RowResult>;
  updateRow(customerId: string, sheetId: string, tab: string, rowIndex: number, row: RowValue[]): Promise<RowResult>;
}
```

### 9.2 Google-Sheets-Implementierung

- API: `spreadsheets.values.append` mit `valueInputOption=USER_ENTERED` (damit Excel Hyperlinks und Datumsformate erkennt).
- Header-Check: `spreadsheets.values.get` Range `A1:Zz1`.
- Receipt-ID-Index: Backend cached Mapping `(sheet_id × tab × receipt_id) → row_index` in Postgres-Tabelle `spreadsheet_row_index` (für schnelle Re-Runs).

### 9.3 Excel-OneDrive-Implementierung

- API: MS Graph `/drive/items/{id}/workbook/worksheets/{tab}/tables/{table}/rows/add`.
- Voraussetzung: Eine Tabelle (Excel-Table) im Sheet, sonst fallback auf `range/insert`.

---

## 10. Datenstruktur

```sql
CREATE TABLE spreadsheet_row_index (
  customer_id   TEXT NOT NULL,
  sheet_id      TEXT NOT NULL,
  tab           TEXT NOT NULL,
  receipt_id    TEXT NOT NULL,
  row_index     INT  NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, sheet_id, tab, receipt_id)
);
```

---

## 11. Events

| Event                       | Wann       |
|-----------------------------|------------|
| `pp.receipt.exported`       | Erfolg     |
| `pp.receipt.export_failed`  | Fehler     |

---

## 12. Fehlerbehandlung

| Fehler                          | Klasse        | Handling                                       |
|---------------------------------|---------------|------------------------------------------------|
| Sheet nicht gefunden            | Fatal         | Operator-Alert; Customer-Mail                  |
| Quota-Limit Sheets API          | Recoverable   | Retry exponential; bei Wiederholung pro Tag → Operator |
| Concurrent-Update-Konflikt      | Recoverable   | Retry mit re-fetch row_index                   |
| Header-Konflikt (Kunde hat manuell geändert) | Validation | Keine Auto-Korrektur; Operator-Alert    |

---

## 13. Code-Struktur

```
backend/src/modules/m07-spreadsheet/
├── routes.ts
├── handlers/
│   └── append.handler.ts
├── services/
│   ├── row-builder.ts
│   ├── tab-name-resolver.ts
│   └── header-checker.ts
├── tests/
└── README.md
```

---

## 14. Acceptance Criteria

- [ ] Erste Zeile ist immer Header — wird angelegt, wenn fehlt.
- [ ] Re-Run derselben Receipt-ID aktualisiert die Zeile, dupliziert nicht.
- [ ] Hyperlink in Spalte M öffnet die Beleg-PDF.
- [ ] Tab-Wechsel zum Jahreswechsel passiert automatisch.
- [ ] Kosten-/Profile-Erweiterung über `spreadsheet_extra_columns` funktioniert.
- [ ] Idempotenz, Audit-Log korrekt.
