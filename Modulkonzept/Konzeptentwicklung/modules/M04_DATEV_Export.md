# M04 — DATEV-Export

> **Paket:** Pro
> **Phase:** 3
> **Verantwortlich:** Monatliche Erstellung & Versand des DATEV-Exports an den Steuerberater
> **Spec-Version:** 1.0

---

## 1. Zweck

M04 erstellt am Anfang jedes Monats für den Vormonat einen DATEV-konformen Export (CSV im Format „DATEV Buchungsstapel", Encoding UTF-8 BOM oder ANSI), packt alle zugehörigen Beleg-PDFs in ein ZIP und versendet das Paket per Mail an den Steuerberater des Kunden.

---

## 2. Verantwortlichkeit

- Sammeln aller Belege eines Monats mit Status `archived` oder `exported`.
- DATEV-CSV erzeugen (Format `EXTF` v700 oder DATEV Unternehmen Online).
- Beleg-PDFs aus Archiv ziehen und in ZIP packen.
- E-Mail an Steuerberater (CC Kunde optional).
- Persistenz: Liste der DATEV-Exporte pro Kunde mit Hash + Übermittlungsdatum.

---

## 3. Trigger

- **Cron**: `0 7 5 * *` — am 5. jedes Monats um 07:00 für den Vormonat.
- **Manual**: Über Web-App Button „DATEV-Export jetzt erzeugen" für ad-hoc Nachläufer.
- **Re-Run**: Wenn neue Belege aus alten Monaten nachträglich kommen, wird ein Delta-Export erzeugt.

---

## 4. Abhängigkeiten

| Abhängigkeit         | Genutzt für                       |
|----------------------|-----------------------------------|
| Postgres             | Belege des Monats laden           |
| Storage-Adapter      | PDFs aus Archiv ziehen            |
| Mail-Service (SMTP)  | Versand                           |
| Hook-System          | `before_export.datev`             |

---

## 5. Input / Output

### 5.1 Cron-Trigger

```json
{ "trigger": "cron", "period": { "year": 2026, "month": 4 }, "customer_id": "cust_a3f4b2" }
```

n8n iteriert über alle Pro-Kunden mit `integrations.datev.enabled === true`.

### 5.2 Output (intern)

```json
{
  "ok": true,
  "module": "M04",
  "data": {
    "datev_export_id": "dx_01HVZ...",
    "period": "2026-04",
    "receipts_count": 87,
    "csv_object_key": "cust_a3f4b2/datev/2026-04/buchungsstapel.csv",
    "zip_object_key":  "cust_a3f4b2/datev/2026-04/belege.zip",
    "email": { "to": "kontakt@stb-mueller.de", "delivered_at": "2026-05-05T07:02:14Z" }
  },
  "events_to_emit": ["pp.datev.exported"]
}
```

---

## 6. n8n-Workflow `WF-M04`

### 6.1 Cron-Variante

| #  | Node                | Name                                         |
|----|---------------------|----------------------------------------------|
| 1  | Cron                | `Trigger: 5. um 07:00`                       |
| 2  | HTTP Request        | `Backend: list pro customers`                |
| 3  | Loop Over Items     | `Loop: customers`                            |
| 4  |   HTTP Request      | `Backend: build DATEV export`                |
| 5  |   IF                | `IF: ok && receipts_count > 0`               |
| 6  |   HTTP Request      | `Backend: send DATEV mail`                   |
| 7  | End Loop            |                                              |
| 8  | NoOp                | `Done`                                       |

### 6.2 Manual-Variante

Webhook `/api/v1/customers/{id}/datev/build` aus Web-App → ruft denselben Backend-Endpoint.

---

## 7. Backend-API

### 7.1 `POST /api/v1/customers/{customer_id}/datev/build`

**Request**:
```json
{ "period": { "year": 2026, "month": 4 }, "delta_only": false }
```

**Backend-Logik (Pseudocode)**:

```ts
async function buildDatevExport(customerId: string, period: Period, deltaOnly: boolean) {
  const profile = await profileService.get(customerId);
  if (!profile.integrations.datev?.enabled) throw new Error('DATEV_NOT_ENABLED');

  // 1. Belege des Monats holen
  const dateFrom = `${period.year}-${pad(period.month)}-01`;
  const dateTo   = endOfMonth(period);
  const receipts = await receiptRepo.findInPeriod(customerId, dateFrom, dateTo, ['archived','exported']);

  if (deltaOnly) {
    const previous = await datevExportRepo.findLatest(customerId, period);
    receipts = receipts.filter(r => !previous?.receipt_ids?.includes(r.receipt_id));
  }

  if (receipts.length === 0) return { receipts_count: 0, skipped: true };

  // 2. Hook
  const hookResult = await hookRunner.run('before_export.datev', { receipts, profile, draft: { csv: null, zip: null } });

  // 3. CSV erzeugen
  const csv = renderDatevCsv(receipts, profile);
  const csvKey = `${customerId}/datev/${period.year}-${pad(period.month)}/buchungsstapel.csv`;
  await storage.upload(csvKey, csv, 'text/csv');

  // 4. ZIP erzeugen
  const zipKey = `${customerId}/datev/${period.year}-${pad(period.month)}/belege.zip`;
  if (profile.integrations.datev.delivery.include_pdfs) {
    const zip = await zipReceipts(receipts);
    await storage.upload(zipKey, zip, 'application/zip');
  }

  // 5. Persistenz
  const exportId = ulid('dx');
  await datevExportRepo.create({
    datev_export_id: exportId,
    customer_id: customerId,
    period,
    receipt_ids: receipts.map(r => r.receipt_id),
    csv_object_key: csvKey,
    zip_object_key: zipKey,
    csv_sha256: sha256(csv),
    created_at: new Date(),
  });

  await events.emit('pp.datev.exported', { customerId, exportId, period, receipts_count: receipts.length });

  return { datev_export_id: exportId, period, receipts_count: receipts.length, csv_object_key: csvKey, zip_object_key: zipKey };
}
```

### 7.2 `POST /api/v1/customers/{customer_id}/datev/send`

```ts
async function sendDatev(customerId: string, exportId: string) {
  const profile = await profileService.get(customerId);
  const exp = await datevExportRepo.findById(exportId);
  const csv = await storage.download(exp.csv_object_key);
  const zip = exp.zip_object_key ? await storage.download(exp.zip_object_key) : null;

  const result = await mailService.send({
    to: profile.integrations.datev.tax_advisor.email,
    cc: profile.integrations.datev.delivery.cc ?? [],
    subject: `DATEV-Export ${profile.legal_name ?? profile.display_name} – ${exp.period.year}-${pad(exp.period.month)}`,
    body: renderEmailTemplate('datev_delivery_de', { customer: profile, exp }),
    attachments: [
      { name: 'EXTF_Buchungsstapel.csv', bytes: csv, mime: 'text/csv' },
      ...(zip ? [{ name: 'Belege.zip', bytes: zip, mime: 'application/zip' }] : []),
    ],
  });

  await datevExportRepo.markDelivered(exportId, result.messageId, new Date());
  return result;
}
```

---

## 8. DATEV-CSV-Format (EXTF v700)

Die DATEV-„Buchungsstapel"-CSV hat einen festen Header (Zeile 1: Format-Header) plus Spalten-Header (Zeile 2) plus Datenzeilen.

### 8.1 Format-Header (Zeile 1, fixe Reihenfolge)

```
"EXTF";700;21;"Buchungsstapel";9;{timestamp};;{importer};{exporter};{import_consultant_no};{client_no};{accounting_year};{date_from_yyyymmdd};{date_to_yyyymmdd};"";"";1;0;{currency};0;"";0;{tax_office};{client_id};0;0;""
```

### 8.2 Spalten-Header (Zeile 2)

Pflicht-Felder (Auswahl, vollständige Liste in DATEV-Doku):

```
Umsatz;Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basisumsatz;WKZ Basisumsatz;Konto;Gegenkonto;BU-Schluessel;Belegdatum;Belegfeld 1;Belegfeld 2;Skonto;Buchungstext;Postensperre;Diverse Adressnummer;Geschaeftspartnerbank;Sachverhalt;Zinssperre;Beleglink;...
```

### 8.3 Datenzeile (eine pro Receipt)

```ts
function toDatevRow(r: Receipt, profile: CustomerProfile): string {
  const f = r.extraction.fields;
  const c = r.categorization;
  const expense = c.skr_account;                          // Sachkonto
  const counter = mapCounterAccount(c, profile);          // Verbindlichkeiten / Privatentnahme
  return [
    formatAmount(f.total_gross),                          // Umsatz (15,2)
    'S',                                                  // Soll bei Aufwand
    f.currency,                                           // EUR
    '',                                                   // Kurs
    '',                                                   // Basisumsatz
    '',                                                   // WKZ Basisumsatz
    expense,                                              // Konto
    counter,                                              // Gegenkonto
    c.tax_key,                                            // BU-Schlüssel
    formatDateDDMM(f.document_date),                      // Belegdatum DDMM
    f.document_number?.slice(0, 12) ?? '',                // Belegfeld 1
    '',                                                   // Belegfeld 2
    '',                                                   // Skonto
    sanitizeBuchungstext(`${f.supplier_name}`).slice(0, 60), // Buchungstext
    '', '', '', '', '',
    `BELEG://${r.receipt_id}.pdf`,                        // Beleglink
  ].map(v => `"${v}"`).join(';');
}
```

### 8.4 Encoding

- DATEV erwartet **ANSI/Windows-1252** (CP1252) für Standard-Import.
- ProzessPilot schreibt **UTF-8 mit BOM** als Default und zusätzlich Variante CP1252 — Steuerberater wählt im Profil:
  ```json
  { "integrations": { "datev": { "delivery": { "format": "datev_csv_v2", "encoding": "windows-1252" } } } }
  ```

---

## 9. Datenstruktur

```sql
CREATE TABLE datev_exports (
  datev_export_id    TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL REFERENCES customers,
  period_year        INT  NOT NULL,
  period_month       INT  NOT NULL,
  receipt_ids        TEXT[] NOT NULL,
  csv_object_key     TEXT NOT NULL,
  csv_sha256         TEXT NOT NULL,
  zip_object_key     TEXT,
  delivered_at       TIMESTAMPTZ,
  delivery_message_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_datev_customer_period ON datev_exports (customer_id, period_year, period_month);
```

Re-Runs eines Monats erzeugen einen neuen Eintrag (Delta), nicht Update — Steuerberater bekommt klar erkennbare Korrektur-Lieferungen.

---

## 10. Events

| Event                       | Wann                                |
|-----------------------------|-------------------------------------|
| `pp.datev.exported`         | CSV+ZIP erstellt                    |
| `pp.datev.delivered`        | Mail an Steuerberater verschickt    |
| `pp.datev.delivery_failed`  | SMTP-Fehler                         |

---

## 11. Fehlerbehandlung

| Fehler                          | Klasse        | Handling                                        |
|---------------------------------|---------------|-------------------------------------------------|
| 0 Belege im Monat               | Business      | Skip + Info-Mail an Operator (kein Versand)     |
| Receipt ohne Kategorisierung    | Validation    | wird **nicht** in CSV aufgenommen, geloggt      |
| SMTP-Fehler                     | Recoverable   | Retry 3× exponential                            |
| ZIP > 25 MB                     | Validation    | Split nach 100 PDFs pro ZIP, Mail-Anhang oder Drive-Link |
| Steuerberater-Mail ungültig     | Fatal         | Operator-Alert, kein Auto-Retry                  |

---

## 12. Mail-Template `datev_delivery_de`

```
Sehr geehrte/r {{tax_advisor.name}},

anbei der DATEV-Export für {{customer.legal_name}} ({{customer.display_name}})
für den Zeitraum {{period}}.

  • Belege gesamt: {{exp.receipts_count}}
  • Buchungssumme: {{exp.totals.gross_sum}} EUR
  • Format: EXTF Buchungsstapel v700

Bei Rückfragen kontaktieren Sie uns gerne.

Mit freundlichen Grüßen
ProzessPilot
```

Templates liegen in `backend/src/core/mail/templates/`. Pro-Kunden können eigene Templates pflegen (Hook).

---

## 13. Code-Struktur

```
backend/src/modules/m04-datev/
├── routes.ts
├── handlers/
│   ├── build.handler.ts
│   └── send.handler.ts
├── services/
│   ├── csv-renderer.ts
│   ├── zip-builder.ts
│   ├── counter-account-resolver.ts
│   └── totals-calculator.ts
├── templates/
│   └── datev_delivery_de.md
├── tests/
│   ├── csv-renderer.test.ts        # Goldmaster-Tests
│   └── e2e.test.ts
└── README.md
```

---

## 14. ENV-Variablen

| Variable                         | Beispiel                       |
|----------------------------------|--------------------------------|
| `MAIL_SMTP_HOST`                 | `smtp.eu.mailgun.org`          |
| `MAIL_SMTP_PORT`                 | `587`                          |
| `MAIL_FROM_DEFAULT`              | `noreply@prozesspilot.de`      |
| `DATEV_DEFAULT_ENCODING`         | `windows-1252`                 |

---

## 15. Acceptance Criteria

- [ ] CSV-Goldmaster-Test: identisches Output für identischen Input.
- [ ] Steuerberater kann CSV per DATEV-Software importieren ohne Fehler (Pilot-Test mit Steuerkanzlei).
- [ ] ZIP enthält PDFs benannt nach `{document_date}_{supplier}_{document_number}.pdf`.
- [ ] Cron läuft am 5. um 07:00; Logs zeigen pro Kunde Ergebnis.
- [ ] Manual-Re-Run aus Web-App erzeugt Delta-Export.
- [ ] Encoding wird respektiert (CP1252 vs UTF-8 BOM).
- [ ] Mail enthält beide Anhänge und korrektes Subject.
