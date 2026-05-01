# M08 — Monatsreporting

> **Paket:** Standard, Pro
> **Phase:** 2
> **Verantwortlich:** Monatlicher Bericht an den Kunden (PDF + WhatsApp/Mail-Zusammenfassung)
> **Spec-Version:** 1.0

---

## 1. Zweck

M08 erstellt zu Beginn jedes Monats eine Übersicht für den Vormonat: Ausgaben gesamt, Top-Kategorien, Top-Lieferanten, Trend gegenüber Vormonat, ggf. Auffälligkeiten. Output: PDF + kompakte WhatsApp-/Mail-Zusammenfassung.

---

## 2. Verantwortlichkeit

- Aggregationen über alle Belege des Vormonats.
- PDF-Rendering (Standard-Template + ggf. Custom-Branding via Hook).
- Versand per Mail und/oder WhatsApp gemäß Profil.
- Hook `before_report.monthly` und `after_report.monthly`.

---

## 3. Trigger

- **Cron**: `0 8 1 * *` — am 1. um 08:00 für den Vormonat.
- **Manual** über Web-App.

---

## 4. Abhängigkeiten

| Abhängigkeit         | Genutzt für                            |
|----------------------|----------------------------------------|
| Postgres             | Aggregationen                          |
| `puppeteer` / `playwright` | HTML→PDF Rendering              |
| Mail-Service         | Mail-Versand                           |
| WhatsApp-Service     | Template-Nachricht                     |
| MinIO                | PDF-Persistenz                         |

---

## 5. Output

```json
{
  "ok": true,
  "module": "M08",
  "data": {
    "report_id": "rep_01HVZ...",
    "period": "2026-04",
    "totals": { "receipts_count": 87, "gross_sum": 12453.81, "net_sum": 10524.42 },
    "pdf_object_key": "cust_a3f4b2/reports/2026-04/monthly.pdf",
    "delivered": [
      { "channel": "email", "to": "mario@bella-italia.de", "delivered_at": "2026-05-01T08:01:14Z" },
      { "channel": "whatsapp", "to": "+4917612345678", "delivered_at": "2026-05-01T08:01:18Z" }
    ]
  },
  "events_to_emit": ["pp.report.monthly_generated"]
}
```

---

## 6. n8n-Workflow `WF-M08`

| #  | Node                | Name                                         |
|----|---------------------|----------------------------------------------|
| 1  | Cron                | `Trigger: 1. um 08:00`                       |
| 2  | HTTP Request        | `Backend: list standard+ customers`          |
| 3  | Loop Over Items     | `Loop`                                       |
| 4  |   HTTP Request      | `Backend: build report`                      |
| 5  |   IF                | `IF: ok`                                     |
| 6  |   HTTP Request      | `Backend: deliver report`                    |
| 7  | End Loop            |                                              |

Endpoint: `POST /api/v1/customers/{id}/reports/monthly/build` und `.../deliver`.

---

## 7. Backend-API

### 7.1 `POST /api/v1/customers/{id}/reports/monthly/build`

```ts
async function buildMonthlyReport(customerId: string, period: Period) {
  const profile = await profileService.get(customerId);
  if (!profile.integrations.reporting?.enabled) return { skipped: true };

  // 1. Aggregationen
  const dateFrom = `${period.year}-${pad(period.month)}-01`;
  const dateTo   = endOfMonth(period);
  const draft = await reportingRepo.computeMonthlyAggregates(customerId, dateFrom, dateTo);
  // → totals, by_category[], by_supplier[], top_n, comparison_prev_month, anomalies[]

  // 2. Hook
  const hookResult = await hookRunner.run('before_report.monthly', { receipts: null, profile, draft });

  // 3. PDF rendern (HTML-Template → Puppeteer)
  const html = renderTemplate(profile.integrations.reporting.report_template, hookResult.draft, profile);
  const pdfBytes = await pdfRenderer.fromHtml(html);

  // 4. Persistieren
  const reportId = ulid('rep');
  const objectKey = `${customerId}/reports/${period.year}-${pad(period.month)}/monthly.pdf`;
  await storage.upload(objectKey, pdfBytes, 'application/pdf');
  await reportingRepo.saveReport({ report_id: reportId, customer_id: customerId, period, totals: draft.totals, object_key: objectKey });

  await hookRunner.run('after_report.monthly', { report: { reportId, draft }, profile });

  return { report_id: reportId, period, totals: draft.totals, pdf_object_key: objectKey };
}
```

### 7.2 `POST /api/v1/customers/{id}/reports/{report_id}/deliver`

Iteriert über `profile.integrations.reporting.recipients`. Für `email`: Anhang PDF, Body = generierte Zusammenfassung. Für `whatsapp`: Template `monthly_report_de` mit Variablen; PDF wird als Document-Message angehängt.

---

## 8. Aggregationen (SQL)

```sql
-- Totals
SELECT COUNT(*) AS receipts_count,
       SUM((payload->'extraction'->'fields'->>'total_gross')::numeric) AS gross_sum,
       SUM((payload->'extraction'->'fields'->>'total_net'  )::numeric) AS net_sum
FROM receipts
WHERE customer_id = $1
  AND status IN ('archived','exported','completed')
  AND (payload->'extraction'->'fields'->>'document_date')::date BETWEEN $2 AND $3;

-- By Category
SELECT payload->'categorization'->>'category_label' AS label,
       payload->'categorization'->>'category'       AS id,
       COUNT(*) AS n,
       SUM((payload->'extraction'->'fields'->>'total_gross')::numeric) AS gross_sum
FROM receipts
WHERE customer_id = $1 AND ... 
GROUP BY 1, 2
ORDER BY gross_sum DESC;

-- Top Suppliers
SELECT payload->'extraction'->'fields'->>'supplier_name' AS supplier,
       COUNT(*) AS n,
       SUM((payload->'extraction'->'fields'->>'total_gross')::numeric) AS gross_sum
FROM receipts
WHERE ...
GROUP BY 1
ORDER BY gross_sum DESC
LIMIT 10;

-- Vergleich Vormonat
-- → identische Queries für period-1, dann diff
```

Performance-Hinweis: Index auf `((payload->'extraction'->'fields'->>'document_date'))` ist Pflicht (siehe `01_Datenmodell_Events.md`).

---

## 9. PDF-Template

```
backend/src/modules/m08-reporting/templates/
├── default_de.hbs            # Handlebars-Template
├── default_de.css
├── gastronomie_monthly_v1.hbs
├── gastronomie_monthly_v1.css
└── components/
    ├── header.hbs
    ├── kpi-cards.hbs
    ├── chart-by-category.hbs
    └── footer.hbs
```

Charts werden über Chart.js → SVG inline im Template gerendert (server-side via `chartjs-node-canvas`). Kein JavaScript im PDF nötig.

### 9.1 PDF-Inhalte (Standard-Layout)

1. Kopf: Logo, Kunden-Name, Berichtszeitraum.
2. KPI-Karten: Gesamt-Brutto, Anzahl Belege, größte Einzelausgabe, Veränderung Vormonat (%).
3. Diagramm: Ausgaben nach Kategorie (Balken).
4. Tabelle: Top 10 Lieferanten (Name, Anzahl Belege, Summe).
5. Tabelle: Auffälligkeiten (Belege > 1000 €, neue Lieferanten, fehlende Belege).
6. Fußzeile: Erstellungsdatum, Receipt-Trace-IDs.

---

## 10. Datenstruktur

```sql
CREATE TABLE reports (
  report_id          TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'monthly',
  period_year        INT  NOT NULL,
  period_month       INT  NOT NULL,
  totals             JSONB NOT NULL,
  pdf_object_key     TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE report_deliveries (
  delivery_id        TEXT PRIMARY KEY,
  report_id          TEXT NOT NULL REFERENCES reports,
  channel            TEXT NOT NULL,
  recipient          TEXT NOT NULL,
  status             TEXT NOT NULL,
  delivered_at       TIMESTAMPTZ,
  external_id        TEXT,
  error              JSONB
);
```

---

## 11. Events

| Event                          | Wann                          |
|--------------------------------|-------------------------------|
| `pp.report.monthly_generated`  | PDF fertig, vor Zustellung    |
| `pp.report.delivered`          | pro Channel-Erfolg            |
| `pp.report.delivery_failed`    | pro Channel-Fehler            |

---

## 12. Fehlerbehandlung

| Fehler                            | Klasse        | Handling                                |
|-----------------------------------|---------------|-----------------------------------------|
| Keine Belege im Monat             | Business      | "Stille Phase"-Mail (optional)          |
| Puppeteer-Crash                   | Recoverable   | Retry 1×; sonst Operator-Alert          |
| WhatsApp-Template nicht approved  | Fatal         | Fallback: Mail-Versand, Operator-Alert  |
| SMTP-Fehler                       | Recoverable   | Retry 3×                                |

---

## 13. Code-Struktur

```
backend/src/modules/m08-reporting/
├── routes.ts
├── handlers/
│   ├── build.handler.ts
│   └── deliver.handler.ts
├── services/
│   ├── aggregator.ts
│   ├── pdf-renderer.ts
│   ├── chart-builder.ts
│   └── delivery-dispatcher.ts
├── templates/                        # siehe §9
├── tests/
└── README.md
```

---

## 14. ENV-Variablen

| Variable                  | Beispiel                          |
|---------------------------|-----------------------------------|
| `PUPPETEER_EXECUTABLE`    | `/usr/bin/chromium`               |
| `REPORT_PDF_BUCKET`       | `prozesspilot-reports`            |

---

## 15. Acceptance Criteria

- [ ] PDF wird ohne Fehler gerendert (mit Test-Daten 100 Belege).
- [ ] Diagramm enthält korrekte Werte (Goldmaster-Test mit fixiertem Datensatz).
- [ ] Mail mit Anhang erreicht Empfänger.
- [ ] WhatsApp-Template mit kompakter Zusammenfassung wird zugestellt.
- [ ] Vormonats-Vergleich funktioniert.
- [ ] Cron läuft zuverlässig am Monats-1.
- [ ] Hook `before_report.monthly` kann Daten ergänzen.
