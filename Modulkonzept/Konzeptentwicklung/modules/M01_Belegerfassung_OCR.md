# M01 — Belegerfassung & OCR

> **Paket:** Basic, Standard, Pro
> **Phase:** 1 (MVP)
> **Verantwortlich:** OCR + strukturierte Extraktion
> **Spec-Version:** 1.0

---

## 1. Zweck

M01 nimmt einen rohen Beleg (Bild oder PDF) entgegen, schickt ihn an einen OCR-Service (Phase 1: Google Vision), extrahiert daraus strukturierte Felder (Lieferant, Datum, Beträge, Steuerzeilen, Positionen) und liefert ein angereichertes Receipt-Objekt im Status `extracted` zurück.

---

## 2. Verantwortlichkeit

M01 ist verantwortlich für:

- Aufruf des OCR-Adapters (Vision/Mindee).
- Strukturierte Extraktion aus dem OCR-Rohtext (regex + Claude-API als Fallback).
- Plausibilitätsprüfungen (Steuerzeilen-Summe = Brutto-Netto, Datum nicht in der Zukunft, Pflichtfelder vorhanden).
- Confidence-Scoring; bei Unter-Schwelle → `requires_review`.
- Hook-Calls `before_extraction` und `after_extraction`.

M01 ist **nicht** verantwortlich für:

- Speichern der Original-Datei (das macht M10/M-Email).
- Kategorisierung (das macht M03).
- Archivierung (das macht M02).

---

## 3. Trigger

- Sub-Workflow-Aufruf aus `WF-MASTER-RECEIPT`.
- Akzeptierte Eingangsstatus: `received`, `requires_review` (bei Re-Run).

---

## 4. Abhängigkeiten

| Abhängigkeit                       | Genutzt für                                 |
|------------------------------------|---------------------------------------------|
| Google Cloud Vision API            | OCR (Phase 1)                                |
| Claude API (Sonnet 4.6)            | Strukturierte Field-Extraktion (Fallback)   |
| MinIO                              | Lesen der Original-Datei                     |
| Postgres                           | Receipt-Update                               |
| Hook-System                        | `before_extraction`, `after_extraction`      |

---

## 5. Input / Output

### 5.1 Input (Sub-Workflow-Schema)

```json
{
  "trace_id": "trc_a8f3d2c1",
  "idempotency_key": "ik_M01_01HVZ8X4...",
  "receipt": {
    "receipt_id": "01HVZ8X4M3R9K7N2P6T1Q5Y8B4",
    "customer_id": "cust_a3f4b2",
    "status": "received",
    "file": {
      "object_key": "cust_a3f4b2/originals/2026/04/01HVZ8X4.jpg",
      "mime_type": "image/jpeg",
      "sha256": "f3b8a..."
    },
    "source": { "...": "..." }
  },
  "customer_profile": { "...": "..." }
}
```

### 5.2 Output

```json
{
  "ok": true,
  "module": "M01",
  "receipt_patch": {
    "status": "extracted",
    "extraction": {
      "engine": "google_vision",
      "engine_version": "v1",
      "confidence": 0.94,
      "raw_text": "PIZZERIA BELLA ITALIA\n...",
      "fields": {
        "supplier_name": "Pizzeria Bella Italia",
        "supplier_address": "Musterstr. 12, 80331 München",
        "supplier_vat_id": "DE123456789",
        "document_number": "RE-2026-1042",
        "document_date": "2026-04-28",
        "document_type": "invoice",
        "currency": "EUR",
        "total_gross": 142.85,
        "total_net": 120.04,
        "tax_lines": [
          { "rate": 0.19, "base": 100.00, "amount": 19.00 },
          { "rate": 0.07, "base":  20.04, "amount":  1.40 }
        ],
        "line_items": [
          { "description": "Mehl Tipo 00 25kg", "qty": 4, "unit_price": 18.50, "total": 74.00, "tax_rate": 0.07 }
        ],
        "payment_method": "cash"
      },
      "warnings": []
    },
    "validation": {
      "is_valid": true,
      "issues": [],
      "checks": {
        "totals_match": true,
        "tax_lines_consistent": true,
        "document_date_plausible": true,
        "duplicate": false
      }
    }
  },
  "events_to_emit": ["pp.receipt.extracted"]
}
```

### 5.3 Output bei niedriger Confidence

```json
{
  "ok": true,
  "module": "M01",
  "receipt_patch": {
    "status": "requires_review",
    "extraction": { "...": "..." },
    "validation": {
      "is_valid": false,
      "issues": [
        { "code": "LOW_CONFIDENCE", "field": "total_gross", "message": "OCR confidence 0.62 unter Schwelle 0.75" }
      ]
    }
  },
  "events_to_emit": ["pp.receipt.requires_review"]
}
```

---

## 6. n8n-Workflow `WF-M01` (Node für Node)

| #  | Node-Typ           | Name                              | Konfiguration                                                                              |
|----|--------------------|-----------------------------------|---------------------------------------------------------------------------------------------|
| 1  | Execute Workflow   | `Trigger`                         | Schema wie 5.1                                                                              |
| 2  | Code (JS)          | `Function: assert_status`         | Prüft `receipt.status ∈ {received, requires_review}`                                       |
| 3  | HTTP Request       | `Backend: Extract`                | POST `BACKEND/api/v1/receipts/{receipt_id}/extract` mit `customer_profile` als Body         |
| 4  | IF                 | `IF: ok`                          | `response.ok===true`                                                                        |
| 5  | Set                | `Build: Result`                   | Mappt Backend-Response auf Sub-Workflow-Output                                              |
| 6  | Respond to Workflow| `Respond`                         | Output (5.2/5.3)                                                                            |

> Die gesamte Arbeit passiert im Backend. Der n8n-Workflow ist absichtlich dünn.

---

## 7. Backend-API

### 7.1 `POST /api/v1/receipts/{receipt_id}/extract`

**Request Body**:
```json
{ "customer_profile": { "...": "..." } }
```

**Backend-Logik (Pseudocode)**:

```ts
// backend/src/modules/m01-receipt-intake/handlers/extract.handler.ts
async function extractReceipt(receiptId: string, profile: CustomerProfile): Promise<ExtractionResult> {
  let receipt = await receiptRepo.findById(receiptId, profile.customer_id);
  assertStatus(receipt, ['received', 'requires_review']);

  // 1. Hook before_extraction
  receipt = await hookRunner.run('before_extraction', { receipt, profile });

  // 2. OCR
  const ocrAdapter = ocrAdapterFactory.for(profile.integrations.ocr.provider); // 'google_vision'
  const fileBytes = await storage.download(receipt.file.object_key);
  const ocr = await ocrAdapter.extract(fileBytes, profile.integrations.ocr.config);
  // → { raw_text, confidence, blocks[], words[] }

  // 3. Field-Extraktion (Regex + Claude-Fallback)
  const fields = await fieldExtractor.extract(ocr, profile);
  // Reihenfolge:
  //   a) Heuristische Regex (Datum, Beträge, USt-ID)
  //   b) Lieferant: Versuch über Stammdaten (cache), dann Claude
  //   c) Bei mehrdeutigen Beträgen: Claude-API mit raw_text + Schema → strukturiertes JSON

  // 4. Plausibilitätsprüfung
  const validation = validator.validate(fields);
  // checks: totals_match, tax_lines_consistent, document_date_plausible, ...

  // 5. Confidence-Score
  const overallConfidence = combineConfidence(ocr.confidence, fields.confidence, validation);
  const threshold = profile.routing.low_confidence_threshold ?? 0.75;
  const newStatus = (overallConfidence < threshold || !validation.is_valid)
    ? 'requires_review'
    : 'extracted';

  // 6. Hook after_extraction
  const patched = await hookRunner.run('after_extraction', {
    receipt: { ...receipt, extraction: { engine, fields, raw_text: ocr.raw_text, confidence: overallConfidence }, validation, status: newStatus },
    profile,
  });

  // 7. Persistieren
  const saved = await receiptRepo.update(patched);
  await audit.log(saved, 'extracted', { confidence: overallConfidence });
  await events.emit(newStatus === 'extracted' ? 'pp.receipt.extracted' : 'pp.receipt.requires_review', saved);

  return saved;
}
```

**Response 200**:
```json
{ "ok": true, "data": { "...vollständiges Receipt..." }, "trace_id": "..." }
```

**Response 4xx/5xx**: Standard-Format aus `01_Datenmodell_Events.md`.

---

## 8. OCR-Adapter

```
backend/src/core/adapters/ocr/
├── adapter.interface.ts        # OcrAdapter
├── google-vision.adapter.ts    # Phase 1
├── mindee.adapter.ts           # Phase 3 (Pro)
└── factory.ts                  # adapterFactory.for('google_vision')
```

### 8.1 Interface

```ts
export interface OcrAdapter {
  readonly id: 'google_vision' | 'mindee';
  readonly version: string;
  extract(bytes: Buffer, config: Record<string, unknown>): Promise<OcrResult>;
}

export interface OcrResult {
  raw_text: string;
  confidence: number;            // 0..1
  blocks: Array<{ text: string; bbox: [number,number,number,number]; conf: number }>;
  words: Array<{ text: string; bbox: [number,number,number,number]; conf: number }>;
  page_count: number;
}
```

### 8.2 `google-vision.adapter.ts`

- Nutzt `@google-cloud/vision` SDK.
- Feature `DOCUMENT_TEXT_DETECTION` (besser als `TEXT_DETECTION` für Belege).
- `language_hints` aus Config (`["de", "it"]` z. B. für italienische Pizzeria).
- PDF-Support via `asyncBatchAnnotateFiles` + GCS-Bucket (Phase 1: nur einseitige PDFs synchron).

---

## 9. Field-Extractor (Backend)

```
backend/src/modules/m01-receipt-intake/services/field-extractor.ts
```

### 9.1 Strategie

1. **Regex-First** (deterministisch, schnell):
   - Datum: `\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b` (DE), `\b(\d{4})-(\d{2})-(\d{2})\b` (ISO), `\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b` (intl).
   - USt-ID: `\bDE\d{9}\b` (DE), erweiterbar EU.
   - Beträge: `\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€?\b`. „Total/Summe/Brutto/Gesamt" als Anker links davon.
   - MwSt-Sätze: `\b(19|7|0)[ ,.]?(\d?)\s*%\b`.
2. **Lieferant** über:
   - Match in `customer_profile.custom.supplier_overrides` (Exact + Fuzzy).
   - Match in globaler Stammdaten-Tabelle (`suppliers_global`).
   - Sonst: Claude-Call mit raw_text und Output-Schema.
3. **Claude-Fallback** für strukturierte Extraktion bei niedrigem Regex-Confidence:
   - Tool-Use mit JSON-Schema-Tool (alle `extraction.fields.*`-Felder).
   - System-Prompt: "Du bist ein Beleg-Extraktor. Antworte ausschließlich via Tool-Call."
   - Token-Limit: 4k Output reicht.
4. **Steuerzeilen** rekonstruiert aus „Brutto / Netto / 19 % / 7 %"-Tabelle.

### 9.2 Konfiguration

In `customer_profiles.routing.tax_keys_map` definiert das Mapping `MwSt-Satz → DATEV-Steuerschlüssel`. Field-Extractor schreibt nur den Satz; das Mapping passiert in M03/M04.

---

## 10. Validator

```
backend/src/modules/m01-receipt-intake/services/validator.ts
```

| Check                       | Logik                                                                                  |
|-----------------------------|----------------------------------------------------------------------------------------|
| `totals_match`              | `total_gross ≈ total_net + Σ tax_lines.amount` (Toleranz 0.02 €)                       |
| `tax_lines_consistent`      | Für jede Zeile: `amount ≈ base × rate` (Toleranz 0.02 €)                               |
| `supplier_known`            | `supplier_name` ist in Stammdaten ODER USt-ID gültig                                   |
| `document_date_plausible`   | Datum ∈ [heute - 5 Jahre, heute + 1 Tag]                                               |
| `duplicate`                 | Im selben Customer existiert bereits ein Receipt mit `(supplier_vat_id, document_number)` |
| `currency_supported`        | `currency ∈ profile.routing.supported_currencies` (Default: EUR)                       |

Bei `is_valid===false` → Status `requires_review`. Issues werden im Receipt persistiert (für Web-App-Anzeige).

---

## 11. Datenstruktur

M01 schreibt in `receipts.payload`. Migrations: keine neuen Tabellen für M01. Stammdaten-Tabelle `suppliers_global`:

```sql
CREATE TABLE suppliers_global (
  supplier_id        TEXT PRIMARY KEY,
  vat_id             TEXT UNIQUE,
  display_name       TEXT NOT NULL,
  aliases            TEXT[],            -- für Fuzzy-Match
  default_category   TEXT,
  default_skr        TEXT,
  country            TEXT DEFAULT 'DE',
  source             TEXT,              -- 'manual', 'crawl', 'llm'
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_suppliers_aliases ON suppliers_global USING gin(aliases);
```

---

## 12. Events

| Event                          | Wann                                |
|--------------------------------|-------------------------------------|
| `pp.receipt.extracted`         | Nach erfolgreicher Extraktion       |
| `pp.receipt.requires_review`   | Bei niedriger Confidence/Validation |
| `pp.receipt.extraction_failed` | Bei OCR-Fehler nach Retries         |

---

## 13. Fehlerbehandlung

| Fehler                              | Klasse        | Handling                                             |
|-------------------------------------|---------------|------------------------------------------------------|
| OCR-API 5xx / Timeout               | Recoverable   | n8n Retry 3× (5s/30s/3min); danach `error`           |
| OCR-API 4xx (Auth, Quota)           | Fatal         | Status `error`, Operator-Alert                       |
| Bild korrupt / nicht lesbar         | Validation    | Status `requires_review`, M09 (Pro) sendet Lieferanten-Anfrage |
| Datei > 10 MB (Vision-Limit)        | Validation    | Status `error`, Hint: "Beleg zu groß"               |
| Datei-Format nicht unterstützt      | Validation    | Status `error`                                       |
| Claude-API-Fehler                   | Recoverable   | Fallback auf Regex-Only-Result                       |
| Felder-Extraktion liefert null      | Validation    | Status `requires_review`                             |

---

## 14. Code-Struktur

```
backend/src/modules/m01-receipt-intake/
├── routes.ts
├── handlers/
│   └── extract.handler.ts
├── services/
│   ├── field-extractor.ts
│   ├── validator.ts
│   ├── confidence-scorer.ts
│   └── claude-extractor.ts        # Tool-Use Wrapper
├── schemas/
│   ├── extract.input.json
│   └── extract.output.json
└── tests/
    ├── field-extractor.test.ts
    ├── validator.test.ts
    └── e2e.test.ts                # mit echten Test-Belegen aus tests/fixtures/
```

`backend/tests/fixtures/m01/` enthält 20+ echte Beispiel-Belege (anonymisiert) für Regression-Tests.

---

## 15. ENV-Variablen

| Variable                          | Beispiel                          | Zweck                              |
|-----------------------------------|-----------------------------------|------------------------------------|
| `GOOGLE_VISION_KEY_FILE`          | `/secrets/gcp-vision.json`        | GCP Service Account                |
| `CLAUDE_API_KEY`                  | `sk-ant-...`                      | Claude für Field-Extraktion        |
| `CLAUDE_MODEL`                    | `claude-sonnet-4-6`               |                                    |
| `OCR_TIMEOUT_MS`                  | `15000`                           |                                    |

---

## 16. Was Claude Code generieren soll

1. Migration: Tabelle `suppliers_global` (siehe §11).
2. OCR-Adapter-Interface + Google-Vision-Implementation (siehe §8).
3. Backend-Modul `backend/src/modules/m01-receipt-intake/` (komplett).
4. JSON-Schemas (siehe §5).
5. n8n-Workflow `WF-M01.json` (siehe §6).
6. Tests inkl. Fixtures.
7. README.

---

## 17. Acceptance Criteria

- [ ] Extraktion liefert für 80% von 20 Test-Belegen `is_valid=true` und Confidence ≥ 0.8.
- [ ] Steuerzeilen-Konsistenz und Brutto-Netto-Match werden korrekt validiert.
- [ ] Bei niedriger Confidence wird Status `requires_review` gesetzt + Event emittiert.
- [ ] Hooks `before_extraction` und `after_extraction` werden aufgerufen (Test mit Dummy-Hook).
- [ ] OCR-Adapter ist austauschbar (Mindee-Adapter kann als Stub gemockt werden).
- [ ] Claude-Fallback wird nur aufgerufen, wenn Regex unzureichend.
- [ ] Idempotenz: gleicher Aufruf zweimal → identisches Ergebnis, nur 1 Audit-Eintrag.
