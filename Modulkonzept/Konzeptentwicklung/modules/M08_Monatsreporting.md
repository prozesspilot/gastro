# M08 — Monatsreporting

> ⚠️ **EINGEFROREN (Stand 2026-06-06)** — beschreibt ein ungebautes/totes Modul, das aktuell gegen nicht-existente (Geister-)Tabellen läuft (HTTP 500). Stand veraltet; diese Spec gilt erst nach Reaktivierung (Post-Pilot). Was wirklich läuft, steht in `.claude/CLAUDE.md` §3.

> 📌 **PDF-Engine-Entscheidung (T086, 2026-06-29):** Die in §4/§9 genannten `puppeteer`/`playwright` + `chartjs-node-canvas` (HTML→PDF via Headless-Chromium) werden **NICHT** verwendet. Stattdessen läuft die PDF-Erzeugung über die generische `pdf-lib`-Engine in `backend/src/core/pdf/` (`PdfDocumentBuilder`) — rein in-process, ohne Browser. Grund: Der IONOS-Prod-Server ist RAM-/Swap-knapp (kein Chromium installiert; n8n musste wegen RAM deaktiviert werden). Diagramme kommen — falls nötig — später als vektorielle `pdf-lib`-Balken, nicht über Chart.js. Beim Bau von M08 (T087) diese Engine konsumieren, kein puppeteer einführen.

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

---

# ERWEITERUNG 2026-05-15 — Steuerberater-Übergabe + Spar-Bericht

> Hinzugefügt nach Konzept-Reboot. Diese Sektion ergänzt M08 um die monatliche Steuerberater-Mail mit DATEV/Lexware-Export, einer Zusammenfassungs-PDF und dem Spar-Bericht für den Wirt.

## 16. Übersicht der Erweiterungen

| Komponente | Empfänger | Frequenz | MVP-Pflicht? |
|---|---|---|---|
| **Steuerberater-Übergabe-Mail** | Steuerberater des Wirts | monatlich am 1. | ✓ |
| **Spar-Bericht für Wirt** | Wirt selbst | monatlich am 1. | Phase 2 (laut F18) |
| **Quartals-Übersicht USt-Voranmeldung** | Steuerberater | quartalsweise | Phase 2 |

---

## 17. Steuerberater-Übergabe-Mail

### 17.1 Inhalt der Mail

```
Subject: ProzessPilot — Buchhaltungs-Übergabe Mai 2026, Mandant Müller-Bistro

Sehr geehrte Frau [Steuerberater-Name],

anbei die aufbereiteten Buchhaltungs-Daten für Ihren Mandanten Müller-Bistro
für den Monat Mai 2026.

ÜBERSICHT
- Anzahl verarbeitete Belege: 47
- Gesamt-Brutto-Volumen: € 4.234,17
- Davon Kassenumsatz (SumUp Tagesabschlüsse): € 12.487,30
- Davon Wareneinkauf: € 2.890,45
- Davon Bewirtungsbelege: € 87,40 (1 Beleg)
- Davon Pfand (durchlaufend): € 78,50

ANHÄNGE
1. DATEV-Buchungsstapel Mai 2026 (CSV)
2. Original-Belege (ZIP, 47 PDFs)
3. Übersichtsbericht (PDF)
4. Z-Bon-Tagesabschlüsse Mai 2026 (PDF, 31 Tage)

[Bei Lexware-Office-Steuerberater statt CSV+ZIP:]
Die Buchungen wurden bereits direkt in Ihr Lexware-Office-Konto übertragen
(Empfänger-Mandant: 12345). Sie finden sie unter "Belege & Buchungen" → Mai 2026.

AUFFÄLLIGKEITEN
- 3 Belege wurden vom Mandanten zur Klärung markiert (siehe Übersichtsbericht S. 3)
- Kein Beleg ohne USt-Ausweis in diesem Monat

Bei Rückfragen: einfach auf diese Mail antworten.

Beste Grüße
ProzessPilot

---
ProzessPilot
[Adresse Schneverdingen]
support@prozesspilot.net
```

### 17.2 Generierungs-Logik

- **Cron:** 1. jedes Monats um 06:00 Uhr (per `WF-CRON-MONTHLY-ACCOUNTANT-HANDOVER.json`)
- Pro Tenant:
  1. Aggregiere alle Belege des Vormonats mit Status `processed` oder `exported`
  2. Generiere DATEV-CSV (via M04) ODER Lexware-Office-API-Push (via M05) ODER sevDesk-Push (via M06)
  3. Pack alle Original-Belege als ZIP
  4. Generiere Übersichtsbericht-PDF (siehe 17.3)
  5. Z-Bon-PDFs aus M15 sammeln, falls vorhanden
  6. Email an `tenant.steuerberater_email` mit allen Anhängen
  7. Audit-Log-Eintrag, Discord-Notification an `#dev-log`

### 17.3 Übersichtsbericht-PDF (Inhalt)

Seite 1 — **Kennzahlen:**
- Anzahl Belege gesamt
- Brutto-/Netto-Summe
- USt-Splitting (19% / 7% / 0%)
- Top-10 Lieferanten nach Volumen
- Anzahl Kategorien-Verteilung

Seite 2 — **Auffälligkeiten:**
- Belege mit Wirt-Korrekturen (manuell durch Mitarbeiter)
- Belege mit niedriger OCR-Confidence (markiert)
- Bewirtungsbelege mit Anlass-Liste

Seite 3 — **Tagesabschlüsse:**
- Übersicht Z-Bons (Datum, Brutto, MwSt-Split)
- Hinweis auf Z-Bon-PDFs im Anhang

Seite 4 — **Diese Monatsübergabe enthält folgende Dateien:** (Liste der Anhänge)

### 17.4 Implementation

```
backend/src/modules/m08-reporting/
├── handover-mail-generator.ts      # Mail-Body-Generator
├── handover-pdf-generator.ts       # Übersichtsbericht-PDF
├── attachment-bundler.ts           # Sammelt Originale + ZIP
└── tests/
```

PDF-Generierung mit `pdfkit` oder `puppeteer` (HTML→PDF).

### 17.5 Datenmodell

```sql
CREATE TABLE accountant_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  handover_month DATE NOT NULL,                    -- z.B. 2026-05-01 für Mai-Übergabe
  delivery_method VARCHAR(30) NOT NULL,            -- 'mail_with_attachments' / 'lexware_api_push' / 'sevdesk_api_push'
  status VARCHAR(20) DEFAULT 'pending',            -- pending / sent / failed / acknowledged
  receipt_count INTEGER,
  total_brutto DECIMAL(12,2),
  pdf_overview_path VARCHAR(500),                  -- MinIO-Pfad
  csv_export_path VARCHAR(500),
  zip_attachment_path VARCHAR(500),
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ NULL,                -- Steuerberater hat geantwortet
  error_message TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 18. Spar-Bericht für Wirt (Phase 2)

### 18.1 Zweck

Monatliche Mail/WhatsApp an Wirt mit konkreter Spar-Rechnung. Reduziert Kündigungs-Quote, weil Wirt sieht wofür er zahlt.

### 18.2 Inhalt der Mail/WhatsApp

```
Subject: Deine ProzessPilot-Bilanz Mai 2026

Hi Müller-Bistro 👋

Hier deine Spar-Bilanz für Mai 2026:

📊 Was wir diesen Monat für dich gemacht haben:
- 47 Belege automatisch erfasst und kategorisiert
- 31 Tagesabschlüsse von SumUp importiert
- Komplettes DATEV-Paket an deine Steuerberaterin geschickt

💰 Was du gespart hast:
- Steuerberaterin-Aufwand: ~3,5 Std weniger × 150€ = 525€ gespart
- Eigene Zeit: ~4 Std weniger × 30€/Std = 120€ Zeit-Wert
- Skonti diesen Monat: 0€ (Phase 2-Feature)

💸 Was ProzessPilot kostet:
- Standard-Paket: 79€

🎯 Dein Netto-Vorteil im Mai: +566€

📋 Wichtige Hinweise:
- Wir haben dich bei 1 Beleg um Rückmeldung gebeten (am 14.05) — danke fürs schnelle Zurückspielen!

Fragen? Antworte einfach auf diese Mail.

Beste Grüße
Dein ProzessPilot-Team
```

### 18.3 Berechnungs-Formel

```
Steuerberater-Ersparnis = (Std-vor-PP - Std-nach-PP) × Stundensatz
Eigene-Zeit-Ersparnis = (Std-vor-PP - Std-nach-PP) × Wirt-Stundensatz
ProzessPilot-Kosten = Monatsbeitrag + (Setup-Fee / 12)
Netto-Vorteil = Steuerberater-Ersparnis + Eigene-Zeit-Ersparnis - ProzessPilot-Kosten
```

Werte aus:
- `tenants.baseline_steuerberater_stunden` (im Onboarding erfasst)
- `tenants.baseline_steuerberater_stundensatz` (default 150€)
- `tenants.baseline_eigene_stunden` (im Onboarding erfasst)
- Aktuelle Std nach PP: aus `tasks` und `interventions` ableitbar

### 18.4 Versand

- WhatsApp wenn Wirt WhatsApp-Channel hat
- Sonst E-Mail
- Plus: Mail-Link zum Web-Chat-Widget für Rückfragen

### 18.5 Datenmodell

```sql
ALTER TABLE tenants ADD COLUMN baseline_steuerberater_stunden DECIMAL(4,1);
ALTER TABLE tenants ADD COLUMN baseline_steuerberater_stundensatz DECIMAL(6,2) DEFAULT 150.00;
ALTER TABLE tenants ADD COLUMN baseline_eigene_stunden DECIMAL(4,1);
ALTER TABLE tenants ADD COLUMN baseline_eigene_stundensatz DECIMAL(6,2) DEFAULT 30.00;
ALTER TABLE tenants ADD COLUMN baseline_steuerberater_kosten_monatlich DECIMAL(8,2);

CREATE TABLE wirt_savings_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  report_month DATE NOT NULL,
  steuerberater_stunden_gespart DECIMAL(4,1),
  steuerberater_euro_gespart DECIMAL(8,2),
  eigene_stunden_gespart DECIMAL(4,1),
  eigene_euro_gespart DECIMAL(8,2),
  skonti_euro DECIMAL(8,2) DEFAULT 0,
  pp_kosten DECIMAL(8,2),
  netto_vorteil DECIMAL(8,2),
  sent_at TIMESTAMPTZ,
  channel VARCHAR(20),                              -- 'whatsapp' / 'email'
  UNIQUE (tenant_id, report_month)
);
```

---

## 19. Quartals-Übersicht USt-Voranmeldung (Phase 2)

### 19.1 Zweck

Vorab-Berechnung der USt-Last pro Quartal für den Steuerberater. Spart ihm Zeit, ist für den Wirt finanzieller Mehrwert.

### 19.2 Inhalt

- USt 19% / 7% / 0% Aufkommen aus Erlösen
- VSt 19% / 7% aus Eingangsbelegen
- USt-Schuld / -Guthaben
- Hinweise auf Korrekturbedarfe

### 19.3 Versand

- Quartalsweise (am 5. nach Quartalsende: 5. April, 5. Juli, 5. Oktober, 5. Januar)
- Als PDF-Anhang an Steuerberater
- Pflicht-Hinweis: "Dies ist eine Vorab-Berechnung von ProzessPilot. Die finale USt-Voranmeldung erfolgt durch den Steuerberater."

---

## 20. Implementations-Reihenfolge

| Phase | Komponente |
|---|---|
| P1.2 (KW 25) | Steuerberater-Übergabe-Mail mit DATEV-CSV |
| P1.2 (KW 26) | Lexware-Office-API-Push als Alternative |
| P1.2 (KW 27) | Erste Live-Übergabe an Pilot-Steuerberaterin |
| Phase 2 (M2+) | Spar-Bericht für Wirt (Erweiterung von M08) |
| Phase 3 (M3+) | Quartals-USt-Voranmeldung |

---

## 21. Tests

### 21.1 Unit-Tests

- Mail-Body-Generator mit verschiedenen Tenant-Konfigurationen
- PDF-Generierung mit Mock-Daten
- ZIP-Bundler mit n Belegen
- Spar-Berechnungs-Formel

### 21.2 Integration-Tests

- Voller Monatslauf mit Test-Tenant + Test-Daten → Mail kommt an
- Lexware-Office-API-Push gegen Sandbox

### 21.3 Goldstandard

- Ein echter Pilot-Tenant mit echten Mai-Daten → manuelle Validierung der Mail-Inhalte vor Versand
- Steuerberaterin gibt schriftliches Feedback nach erstem Empfang

---

**Letzte Aktualisierung:** 2026-05-15 (Erweiterung Steuerberater-Übergabe + Spar-Bericht)
**Verantwortlich:** Andreas (Backend), Steve (Steuerberaterin-Kommunikation)
