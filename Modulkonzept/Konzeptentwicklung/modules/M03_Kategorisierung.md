# M03 — Kategorisierung & Buchungsvorbereitung

> **Paket:** Standard, Pro
> **Phase:** 2
> **Verantwortlich:** KI-Kategorisierung + SKR-Konten-Mapping
> **Spec-Version:** 1.0

---

## 1. Zweck

M03 ordnet jeden extrahierten Beleg automatisch einer Kostenkategorie zu (z. B. „Wareneinkauf Lebensmittel", „Miete", „Energie") und mappt sie auf das passende Sachkonto im Kontenrahmen des Kunden (SKR03 oder SKR04). Das Ergebnis ist ein Buchungsvorschlag, der von M04–M07 weiterverarbeitet wird.

---

## 2. Verantwortlichkeit

- Bestimmung von `category_id` + `category_label`.
- Mapping auf `skr_account` und `tax_key`.
- Bestimmung von `cost_center` (sofern Branchen/Filialen).
- Confidence-Scoring; bei niedrig: `requires_review`.
- Reihenfolge der Strategien: Override → Stammdaten → Claude.
- Hooks `before_categorization`, `after_categorization`.

M03 ist **nicht** verantwortlich für das tatsächliche Verbuchen (das macht M04–M07).

---

## 3. Trigger

- Sub-Workflow-Aufruf aus `WF-MASTER-RECEIPT`.
- Akzeptierte Eingangsstatus: `extracted`.
- Wird übersprungen, wenn `profile.routing.ki_kategorisierung === false` (Basic-Pakete).

---

## 4. Abhängigkeiten

| Abhängigkeit                  | Genutzt für                                  |
|-------------------------------|----------------------------------------------|
| Claude API                    | KI-Kategorisierung (Tool-Use)                |
| Postgres (Stammdaten)         | `suppliers_global`, `categories`, `accounts` |
| Hook-System                   | before/after-Hooks                           |

---

## 5. Input / Output

### 5.1 Input

```json
{
  "receipt": { "...inkl. extraction.fields..." },
  "customer_profile": { "...inkl. routing.skr_chart, custom.supplier_overrides..." }
}
```

### 5.2 Output

```json
{
  "ok": true,
  "module": "M03",
  "receipt_patch": {
    "status": "categorized",
    "categorization": {
      "engine": "claude_sonnet_4_6",
      "engine_version": "2026-04",
      "confidence": 0.91,
      "category": "wareneinkauf_food",
      "category_label": "Wareneinkauf Lebensmittel",
      "skr_account": "3100",
      "tax_key": "9",
      "cost_center": "kueche",
      "rationale": "Lieferant ist Lebensmittel-Großhandel; Positionen 'Mehl', 'Olivenöl' sind Wareneinsatz."
    }
  },
  "events_to_emit": ["pp.receipt.categorized"]
}
```

---

## 6. n8n-Workflow `WF-M03`

| #  | Node                | Name                          | Endpoint                                                  |
|----|---------------------|-------------------------------|-----------------------------------------------------------|
| 1  | Execute Workflow    | `Trigger`                     |                                                           |
| 2  | Code                | `Function: assert_status`     | nur `extracted`                                           |
| 3  | HTTP Request        | `Backend: Categorize`         | POST `/api/v1/receipts/{id}/categorize`                   |
| 4  | IF                  | `IF: ok`                      |                                                           |
| 5  | Set                 | `Build: Result`               |                                                           |
| 6  | Respond to Workflow | `Respond`                     |                                                           |

---

## 7. Backend-API

### 7.1 `POST /api/v1/receipts/{receipt_id}/categorize`

Backend-Logik (Pseudocode):

```ts
async function categorize(receiptId: string, profile: CustomerProfile) {
  let receipt = await receiptRepo.findById(receiptId, profile.customer_id);
  assertStatus(receipt, ['extracted']);

  receipt = await hookRunner.run('before_categorization', { receipt, profile });

  const supplier = receipt.extraction.fields.supplier_name;

  // Strategie 1: Customer-Override
  const override = profile.custom?.supplier_overrides?.[supplier];
  if (override) {
    receipt.categorization = applyOverride(override, profile);
    receipt.categorization.engine = 'override';
    receipt.categorization.confidence = 1.0;
  }
  // Strategie 2: Globale Stammdaten
  else {
    const known = await supplierRepo.find(supplier, { fuzzy: true });
    if (known?.default_category && known.confidence >= 0.9) {
      receipt.categorization = applyStammdaten(known, profile);
      receipt.categorization.engine = 'master_data';
    }
    // Strategie 3: Claude
    else {
      const claudeResult = await claudeCategorizer.categorize(receipt, profile);
      receipt.categorization = mapClaude(claudeResult, profile);
      receipt.categorization.engine = 'claude_sonnet_4_6';
    }
  }

  // Cost Center via branch_rules
  const branch = receipt.meta?.branch ?? profile.custom?.default_branch;
  if (branch && profile.custom?.branch_rules?.[branch]?.cost_center) {
    receipt.categorization.cost_center ??= profile.custom.branch_rules[branch].cost_center;
  }

  // Threshold check
  const threshold = profile.routing.low_confidence_threshold ?? 0.75;
  receipt.status = receipt.categorization.confidence < threshold ? 'requires_review' : 'categorized';

  receipt = await hookRunner.run('after_categorization', { receipt, profile });

  const saved = await receiptRepo.update(receipt);
  await audit.log(saved, 'categorized', { engine: saved.categorization.engine, confidence: saved.categorization.confidence });
  await events.emit(receipt.status === 'categorized' ? 'pp.receipt.categorized' : 'pp.receipt.requires_review', saved);
  return saved;
}
```

---

## 8. Claude-Kategorisierer

### 8.1 Prompt (System)

```
Du bist ein Buchhaltungs-Assistent. Du kategorisierst Belege für ein Gastronomieunternehmen
nach den vorgegebenen Kategorien und SKR-Konten.

Antworte AUSSCHLIESSLICH über das Tool `categorize_receipt`.
Wenn du dir unsicher bist, gib eine niedrigere Confidence (< 0.75) zurück und schreibe in
`rationale`, was unklar ist.
```

### 8.2 Tool-Schema (Anthropic Tool-Use)

```json
{
  "name": "categorize_receipt",
  "description": "Kategorisiert einen Beleg und liefert das passende SKR-Konto.",
  "input_schema": {
    "type": "object",
    "properties": {
      "category": { "type": "string", "enum": ["wareneinkauf_food","wareneinkauf_drink","betriebskosten_energie","betriebskosten_wasser","miete","reinigung","wartung","personal","fortbildung","versicherung","kfz","werbung","beratung","sonstige_betriebskosten","sonstige_aufwand"] },
      "category_label": { "type": "string" },
      "skr_account": { "type": "string", "pattern": "^\\d{4}$" },
      "tax_key": { "type": "string" },
      "cost_center": { "type": "string", "nullable": true },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "rationale": { "type": "string", "maxLength": 500 }
    },
    "required": ["category","category_label","skr_account","tax_key","confidence","rationale"]
  }
}
```

### 8.3 User-Message (pro Beleg)

```
Lieferant: {supplier_name}
USt-ID: {supplier_vat_id}
Datum: {document_date}
Brutto: {total_gross} {currency}
MwSt-Sätze: 19% Anteil={...}, 7% Anteil={...}
Positionen:
  - {item1.description} ({item1.qty}x {item1.unit_price})
  - ...

Kontenrahmen: {profile.routing.skr_chart}
Branche: {profile.custom.industry_hint}
Bekannte Mappings für ähnliche Lieferanten:
  - "Metro AG" → wareneinkauf_food / SKR03 3100
  - "Stadtwerke" → betriebskosten_energie / SKR03 4240

Bitte kategorisiere.
```

### 8.4 Few-Shot über `profile.custom.ai_categorization_examples`

Falls der Kunde spezifische Beispiele pflegt, werden sie als zusätzliche `assistant`-Demos in den Claude-Call injiziert. Maximal 5 Beispiele, älteste zuerst rotiert.

### 8.5 Caching

Cache-Key: `sha256(prompt + supplier + total + items)`. TTL: 30 Tage. Bei Cache-Hit wird `engine = 'claude_cached'` gesetzt.

---

## 9. Stammdaten-Tabellen

### 9.1 `categories` (global)

```sql
CREATE TABLE categories (
  category_id      TEXT PRIMARY KEY,                    -- 'wareneinkauf_food'
  label_de         TEXT NOT NULL,
  default_skr03    TEXT,
  default_skr04    TEXT,
  default_tax_key  TEXT,
  description      TEXT
);
```

Initial-Seed: 14 Standardkategorien (Gastronomie). Erweiterbar.

### 9.2 `customer_categories` (Override)

```sql
CREATE TABLE customer_categories (
  customer_id      TEXT NOT NULL REFERENCES customers,
  category_id      TEXT NOT NULL,
  override_skr     TEXT,
  override_tax_key TEXT,
  PRIMARY KEY (customer_id, category_id)
);
```

Erlaubt einem Kunden, einzelne Konten umzubiegen, ohne den globalen Datensatz zu ändern.

### 9.3 `customer_cost_centers`

```sql
CREATE TABLE customer_cost_centers (
  customer_id      TEXT NOT NULL,
  cost_center_id   TEXT NOT NULL,
  label            TEXT NOT NULL,
  PRIMARY KEY (customer_id, cost_center_id)
);
```

---

## 10. Tax-Keys

`profile.routing.tax_keys_map` mappt MwSt-Satz → DATEV-Steuerschlüssel:

```json
{
  "0.19": "9",
  "0.07": "8",
  "0.00": "0"
}
```

M03 nimmt den dominanten Satz aus `extraction.fields.tax_lines` (höchster Anteil) und mappt.

---

## 11. Events

| Event                          | Wann                                |
|--------------------------------|-------------------------------------|
| `pp.receipt.categorized`       | Erfolgreiche Kategorisierung        |
| `pp.receipt.requires_review`   | Confidence unter Schwelle           |

---

## 12. Fehlerbehandlung

| Fehler                              | Klasse        | Handling                                       |
|-------------------------------------|---------------|------------------------------------------------|
| Claude-API 5xx / Timeout            | Recoverable   | Retry 2×, dann Fallback auf Stammdaten/`sonstige_aufwand` mit Confidence 0.5 |
| Claude liefert ungültiges JSON      | Recoverable   | 1× Re-Prompt mit "respond ONLY via tool"; sonst `requires_review` |
| Lieferant fehlt komplett            | Validation    | Status `requires_review`                       |
| Override liefert ungültiges SKR     | Validation    | Status `requires_review`                       |
| Token-Limit erreicht                | Fatal         | Operator-Alert, Status `error`                 |

---

## 13. Code-Struktur

```
backend/src/modules/m03-categorization/
├── routes.ts
├── handlers/
│   └── categorize.handler.ts
├── services/
│   ├── claude-categorizer.ts
│   ├── override-resolver.ts
│   ├── master-data-resolver.ts
│   ├── skr-mapper.ts
│   └── confidence-scorer.ts
├── prompts/
│   └── categorize.system.md
├── tests/
└── README.md
```

---

## 14. ENV-Variablen

| Variable          | Beispiel              |
|-------------------|-----------------------|
| `CLAUDE_API_KEY`  | `sk-ant-...`          |
| `CLAUDE_MODEL`    | `claude-sonnet-4-6`   |
| `M03_CACHE_TTL_DAYS` | `30`                |

---

## 15. Acceptance Criteria

- [ ] Override-Strategie greift vor Claude (Test mit `supplier_overrides`).
- [ ] SKR03/04-Mapping ist korrekt (Test pro Kategorie).
- [ ] Cache verhindert doppelte Claude-Calls für identische Inputs.
- [ ] Bei niedriger Confidence wird `requires_review` gesetzt.
- [ ] Hooks werden aufgerufen, Patch wird gemerged.
- [ ] Tax-Key-Mapping korrekt aus `profile.routing.tax_keys_map`.
- [ ] Tests: 90% Genauigkeit auf 50 echten Test-Belegen mit Goldstandard-Labels.

---

# ERWEITERUNG 2026-05-15 — Gastro-Spezialfälle

> Hinzugefügt nach Konzept-Reboot. Diese Sektion ergänzt M03 um Gastro-spezifische Erkennungs- und Buchungs-Hooks, die für den Pilot und alle Gastro-Tenants Pflicht sind.

## 16. Übersicht der neuen Hooks

| Hook | Zweck | MVP-Pflicht? |
|---|---|---|
| `bewirtungs_detection` | Erkennt Bewirtungsbelege, fragt Anlass + Teilnehmer ab, splittet 70%/30% | ✓ |
| `mwst_splitting_per_position` | Splittet bei mehreren MwSt-Sätzen pro Beleg in einzelne Buchungs-Zeilen | ✓ |
| `pfand_separation` | Erkennt Pfand-Positionen, bucht auf eigenes Konto | ✓ |
| `kleinbetrag_relaxation` | Bei Belegen unter €250 brutto: weniger strikte Validierung | ✓ |
| `ust_ausweis_status` | Erkennt Belege ohne USt-Ausweis (Kleinunternehmer §19, Auslandsbelege) | ✓ |
| `skonto_detection` | Erkennt Skonto-Bedingungen, generiert Push-Reminder | Phase 2 |
| `trinkgeld_separation` | Erkennt Trinkgeld auf Bewirtungsbelegen, bucht separat | ✓ (im Bewirtungs-Hook integriert) |

---

## 17. Hook: Bewirtungs-Detection

### 17.1 Erkennungs-Logik

Ein Beleg wird als Bewirtungsbeleg klassifiziert wenn mindestens 2 der folgenden Indikatoren zutreffen:

- Lieferant ist Restaurant/Café/Bar (Branchen-Schlüsselwörter im Namen oder OCR-Text: "Restaurant", "Café", "Bistro", "Steakhouse", "Pizzeria", ...)
- OCR-Text enthält Wörter wie "Bewirtung", "Geschäftsessen", "Tisch", "Gedeck", "Trinkgeld"
- Belegtyp (aus M01) = "Restaurant-Beleg" oder "Bewirtungsbeleg"
- Mehrere Speisen- und Getränke-Positionen in einer Beleg-Position

### 17.2 Workflow nach Erkennung

```
1. M03 setzt: receipt.metadata.is_bewirtung = true
2. Prüft: receipt.metadata.bewirtungs_anlass + bewirtungs_teilnehmer existieren?
3. Wenn ja: weiter zu Buchungs-Splitting (Schritt 5)
4. Wenn nein:
   a. Status setzen: requires_review (Sub-Status: 'bewirtung_anlass_fehlt')
   b. Auto-Task in Mitarbeiter-Webapp: 'Bewirtungs-Anlass nachfragen'
   c. Magic-Link-Generierung mit Quick-Reply-Buttons:
      "Wer war dabei?" [Lieferant] [Geschäftspartner] [Personal] [Frei eingeben]
      "Welcher Anlass?" [Verhandlung] [Probemenü] [Bestellung besprochen] [Frei]
      "Trinkgeld extra? Tippe Betrag oder 0"
   d. Magic-Link an Wirt via WhatsApp/E-Mail
   e. Wirt antwortet → Daten in receipt.metadata gespeichert
   f. Receipt-Status auf 'extracted' zurück, M03 läuft erneut
5. Buchungs-Splitting:
   - Konto SKR04 6644 "Bewirtungsaufwand abziehbar" — 70% des Netto-Betrags
   - Konto SKR04 6645 "Bewirtungsaufwand nicht abziehbar" — 30% des Netto-Betrags
   - USt: voll abziehbar auf 100% des Brutto-Betrags
   - Trinkgeld separat:
     - Konto SKR04 6644 (anteilig 70%) + 6645 (30%) wenn als Teil der Bewirtung
     - ALTERNATIV: Konto 1782 "Durchlaufende Posten" wenn als Service-Personal-Trinkgeld
```

### 17.3 Datenmodell-Erweiterung

```sql
ALTER TABLE receipts ADD COLUMN is_bewirtung BOOLEAN DEFAULT false;
ALTER TABLE receipts ADD COLUMN bewirtungs_anlass TEXT;
ALTER TABLE receipts ADD COLUMN bewirtungs_teilnehmer TEXT;
ALTER TABLE receipts ADD COLUMN bewirtungs_trinkgeld DECIMAL(10,2);
ALTER TABLE receipts ADD COLUMN bewirtungs_complete BOOLEAN DEFAULT false;
```

---

## 18. Hook: MwSt-Splitting pro Position

### 18.1 Problem

Lieferanten-Belege (z.B. Metro) haben oft 30+ Positionen mit unterschiedlichen MwSt-Sätzen (7% Lebensmittel, 19% Reinigungsmittel, etc.). Bisheriger Code würde alle in einer Buchung mit Misch-Steuersatz speichern → Fehler im DATEV-Export.

### 18.2 Logik

```
1. Aus OCR-Daten alle Positionen extrahieren
2. Pro Position MwSt-Satz erkennen (aus Spalte oder aus Belegfuß-Tabelle)
3. Aggregation pro Steuersatz:
   - Summe Brutto, Netto, MwSt-Betrag
4. Plausibilitäts-Check:
   - Σ Netto + Σ MwSt = Brutto-Summe?
   - Wenn Differenz > €0.01: Status 'requires_review' + Auto-Task
5. Buchungs-Splitting:
   - Pro MwSt-Satz: eine Buchungs-Zeile
   - Konto je nach Kategorie
   - DATEV-Export erhält n Buchungen statt 1
```

### 18.3 Beispiel

Metro-Beleg über €127,30 brutto mit:
- Lebensmittel 7%: 89,50 € brutto
- Alkohol 19%: 32,80 € brutto
- Reinigungsmittel 19%: 5,00 € brutto

Wird zu drei Buchungen:
- Konto 3270 Wareneinkauf 7%: 83,64 € netto + 5,86 € VSt
- Konto 3280 Wareneinkauf 19%: 27,56 € netto + 5,24 € VSt
- Konto 4400 Reinigung: 4,20 € netto + 0,80 € VSt

---

## 19. Hook: Pfand-Trennung

### 19.1 Erkennungs-Logik

Position wird als Pfand erkannt wenn OCR-Text enthält:
- "Pfand", "Leergut", "Mehrweg", "Einwegpfand"
- Position mit Steuersatz 0% (in DE Pfand i.d.R. ohne USt)
- Negative Beträge (Pfand-Rückgabe = Gutschrift)

### 19.2 Buchungs-Logik

Pfand ist **kein Wareneinkauf**, sondern **durchlaufender Posten**:

```
- Beim Eingangs-Beleg (mit Pfand-Position):
  - Wareneinkauf-Konto: Brutto OHNE Pfand
  - Konto 1730 "Pfand-Forderungen aus Mehrweggut": Pfand-Betrag

- Bei Pfand-Rückgabe (Gutschrift):
  - Konto 1730 "Pfand-Forderungen": minus Rückgabe-Betrag (Auflösung der Forderung)
```

### 19.3 Tracking

```sql
ALTER TABLE receipts ADD COLUMN pfand_amount DECIMAL(10,2) DEFAULT 0;
```

---

## 20. Hook: Kleinbetragsregelung

### 20.1 Erkennungs-Logik

Ein Beleg gilt als Kleinbetrag wenn `total_brutto <= 250.00` EUR.

### 20.2 Validierungs-Anpassung

Bei Kleinbeträgen entfallen folgende Pflicht-Validierungen:
- Empfänger-Adresse (nicht zwingend für USt-Abzug bei Kleinbetrag, §33 UStDV)
- USt-IdNr des Empfängers
- Fortlaufende Rechnungsnummer

Statt `requires_review` wird der Beleg direkt mit Status `extracted` weiterverarbeitet, wenn diese Felder fehlen.

### 20.3 Datenmodell

```sql
ALTER TABLE receipts ADD COLUMN is_kleinbetrag BOOLEAN GENERATED ALWAYS AS (total_brutto <= 250.00) STORED;
```

---

## 21. Hook: USt-Ausweis-Status

### 21.1 Erkennungs-Logik

Belege ohne USt-Ausweis kommen typischerweise von:

- **Kleinunternehmern §19 UStG** — Hinweis "Kein Ausweis von USt gemäß §19 UStG"
- **Auslandslieferanten** — kein Inland-USt-Satz, eventuell Reverse-Charge
- **Privat-Belegen** — nur Brutto-Betrag, keine USt-Aufschlüsselung
- **Belegen ohne formale Rechnung** (z.B. handschriftliche Quittungen)

### 21.2 Klassifizierung

```typescript
type UstStatus =
  | 'normal'                  // Standard 19% / 7% / 0% USt mit Ausweis
  | 'kleinunternehmer_19'     // §19 UStG, kein Vorsteuerabzug
  | 'auslands_eu'             // EU-Ausland, Reverse-Charge möglich
  | 'auslands_drittland'      // Drittland, Einfuhr-USt
  | 'privat'                  // Privat-Beleg, kein Vorsteuerabzug
  | 'unklar';                 // OCR-Status unklar, requires_review
```

### 21.3 Buchungs-Konsequenzen

- `kleinunternehmer_19` → kein Vorsteuerabzug → Brutto = Netto buchen, kein VSt-Konto
- `auslands_eu` → Reverse-Charge: Konto 3120/3130 Wareneinkauf EU-Ausland + USt-Eintrag
- `privat` → Hinweis-Task an Mitarbeiter, ggf. nicht steuerlich abziehbar
- `unklar` → requires_review

### 21.4 Datenmodell

```sql
ALTER TABLE receipts ADD COLUMN ust_status VARCHAR(30);
```

---

## 22. Hook: Skonto-Detection (Phase 2)

### 22.1 Erkennungs-Logik

OCR-Text wird gescannt nach Skonto-Klauseln wie:
- "% Skonto bei Zahlung innerhalb X Tagen"
- "Zahlbar netto Y Tage, X% Skonto bei Z Tagen"
- "Sofort: ... Tage netto"

### 22.2 Reminder-Workflow

```
1. Skonto-Bedingungen erkannt → speichern in receipt.skonto_*
2. Cron-Job täglich um 09:00:
   - Findet Belege mit skonto_deadline ≤ today + 3 Tage UND nicht bezahlt
   - Generiert Magic-Link mit Vorschau
   - Sendet WhatsApp/E-Mail an Wirt:
     "Heute Krombacher €1.000 zahlen = €20 sparen.
     [Erinnere mich später] [Schon bezahlt] [Ignorieren]"
3. Wirt-Antwort:
   - "Erinnere mich später" → Reminder morgen
   - "Schon bezahlt" → receipt.payment_status = 'paid_with_skonto'
   - "Ignorieren" → kein weiterer Reminder
```

### 22.3 Datenmodell

```sql
ALTER TABLE receipts ADD COLUMN skonto_percent DECIMAL(5,2);
ALTER TABLE receipts ADD COLUMN skonto_deadline DATE;
ALTER TABLE receipts ADD COLUMN skonto_amount DECIMAL(10,2);
ALTER TABLE receipts ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid';
```

### 22.4 Spar-Counter-Integration

Nach erfolgreicher Skonto-Nutzung wird das in `M19 Spar-Counter` (Erweiterung von M08) eingerechnet — "Du hast diesen Monat €X durch Skonti gespart."

---

## 23. Implementations-Reihenfolge der Hooks

| Phase | Hook |
|---|---|
| P1.1 (KW 22) | Bewirtungs-Detection (Backend-Logik, Webapp-Eingabe-Maske) |
| P1.1 (KW 23) | MwSt-Splitting pro Position |
| P1.1 (KW 23) | Pfand-Trennung |
| P1.1 (KW 23) | Kleinbetragsregelung |
| P1.1 (KW 23) | USt-Ausweis-Status |
| P1.2 (KW 24) | Bewirtungs-Magic-Link mit Quick-Reply (WhatsApp-Bot) |
| Phase 2 (M3+) | Skonto-Detection + Reminder |

---

## 24. Tests für Gastro-Hooks

### 24.1 Unit-Tests

- Bewirtungs-Detection: 20 Test-Belege (10 Bewirtung, 10 keine) mit erwarteten Outputs
- MwSt-Splitting: Metro-Beleg mit gemischten Sätzen
- Pfand-Trennung: Krombacher-Lieferschein
- Kleinbetragsregelung: 5 verschiedene Kleinbetrags-Szenarien
- USt-Status: 5 Kleinunternehmer-Belege, 3 Auslands-Belege

### 24.2 Integration-Tests

- Bewirtungs-Workflow End-to-End: Beleg → requires_review → Magic-Link generiert → Antwort kommt → Buchung-Splitting korrekt
- MwSt-Splitting → DATEV-Export mit n Zeilen statt 1

### 24.3 Goldstandard-Tests

- 50 echte Pilot-Wirt-Belege als Goldstandard-Set
- Erwartete Klassifizierung pro Beleg dokumentiert
- CI prüft Genauigkeit: ≥ 88% (Phase 1), ≥ 92% (Phase 2)

---

**Letzte Aktualisierung:** 2026-05-15 (Erweiterung Gastro-Spezialfälle)
**Verantwortlich:** Andreas (Backend), Steve (Bewirtungs-UX in Webapp + WhatsApp-Bot)
