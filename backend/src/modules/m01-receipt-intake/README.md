# M01 — Belegerfassung & OCR (Backend-Modul)

> Spec: `Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md`
> Foundation: `Konzeptentwicklung/Foundation_Spec.md` §D3, §D6, §D8
> Datenmodell: `Konzeptentwicklung/01_Datenmodell_Events.md` §2, §4, §5
> Customer-Profil: `Konzeptentwicklung/02_Kundenprofil_System.md` §2.2
> Hooks: `Konzeptentwicklung/04_Erweiterbarkeit_Pro.md` §3

---

## Was dieses Modul tut

M01 nimmt einen rohen Beleg (Bild oder PDF), schickt ihn an einen OCR-Provider
(Phase 1: Google Vision), extrahiert daraus strukturierte Felder und liefert
ein angereichertes Receipt-Objekt:

1. Lädt Original-Datei aus MinIO.
2. OCR via Adapter → `OcrResult` (raw_text, confidence, blocks, words).
3. Field-Extraktion: Regex → `customer_profile.custom.supplier_overrides` →
   `suppliers_global` → Claude-Fallback (nur wenn Regex < 0.6 oder Lieferant fehlt).
4. Plausibilitätsprüfung (6 Checks aus M01 §10).
5. Confidence-Scoring (60 % OCR + 40 % Felder); Threshold aus
   `profile.routing.low_confidence_threshold` (Default 0.75).
6. Persistiert Receipt mit Status `extracted` oder `requires_review`.
7. Schreibt Audit-Log und veröffentlicht `pp.receipt.extracted` /
   `pp.receipt.requires_review` auf `pp:events:receipt`.

M01 schreibt **nicht** den Original-Upload — das macht M10/M-Email.

---

## Datei-Struktur (M01 §14)

```
backend/src/modules/m01-receipt-intake/
├── routes.ts
├── handlers/
│   └── extract.handler.ts
├── services/
│   ├── field-extractor.ts          # Regex + Stammdaten + Claude-Pipe
│   ├── validator.ts                # 6 Plausibilitäts-Checks
│   ├── confidence-scorer.ts        # OCR/Field-Gewichtung
│   ├── claude-extractor.ts         # @anthropic-ai/sdk Tool-Use Wrapper
│   ├── storage-download.ts         # GetObjectCommand → Buffer
│   └── event-emitter.ts            # pp.receipt.* auf pp:events:receipt
├── schemas/
│   ├── extract.input.ts            # Zod, M01 §5.1
│   └── extract.output.ts           # Zod, M01 §5.2/5.3
└── tests/
    ├── field-extractor.test.ts
    ├── validator.test.ts
    └── e2e.test.ts

backend/src/core/adapters/ocr/
├── adapter.interface.ts            # OcrAdapter, OcrResult
├── google-vision.adapter.ts        # @google-cloud/vision Phase 1
├── mindee.adapter.ts               # Phase 3 — wirft NOT_IMPLEMENTED
└── factory.ts                      # adapterFactory.for(provider)

backend/src/modules/_shared/receipts/
└── receipt.repository.ts           # findById / findByHash / create / update

migrations/
└── 003_suppliers_global.sql        # Globale Lieferanten-Stammdaten

n8n/workflows/
└── WF-M01.json                     # Sub-Workflow von WF-MASTER-RECEIPT
```

---

## Endpoints

`/api/v1/receipts/*` — HMAC-Auth via D3-Middleware (in Tests via
`PP_AUTH_DISABLED=1` deaktiviert).

### `POST /:receipt_id/extract`

**Request-Body** (M01 §7.1):
```json
{
  "customer_profile": { "...": "..." },
  "trace_id":         "trc_a8f3d2c1"
}
```

**Response 200** (Erfolg):
```json
{
  "ok": true,
  "data": {
    "receipt": { "...vollständiges Receipt..." },
    "receipt_patch": {
      "status": "extracted",
      "extraction": { "engine": "google_vision", "confidence": 0.94, "fields": { ... } },
      "validation": { "is_valid": true, "issues": [], "checks": { ... } }
    },
    "events_to_emit": ["pp.receipt.extracted"]
  }
}
```

**Status-Codes:**
- `200 OK` — Erfolg (Status `extracted` oder `requires_review`)
- `404 NOT_FOUND` — Receipt existiert nicht für den Customer
- `409 CONFLICT` — Eingangsstatus nicht in `{received, requires_review}`
- `422 VALIDATION_ERROR` — Body-Zod-Validierung fehlgeschlagen
- `502 EXTERNAL_API_FAILED` — OCR-Provider/Storage hat gefailt

---

## Hooks

> **Stand T051 (2026-06-13):** Das Hook-System (`core/hooks/hook-runner.ts` + `customer_hooks`) wurde entfernt — es war ein No-op-Stub gegen die abgebaute Geister-Tabellen-Welt und wurde nur vom ebenfalls entfernten Alt-`categorize.handler` aufgerufen. Erweiterbarkeit per Customer-Hooks ist Post-Pilot (Konzept 04 §3) und wird bei Bedarf neu auf der belege-Welt gebaut.

---

## Konfiguration

```bash
GOOGLE_VISION_KEY_FILE=/secrets/gcp-vision.json
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6
OCR_TIMEOUT_MS=15000
```

`customer_profile.integrations.ocr` steuert Provider (`google_vision` |
`mindee`) und Provider-Konfig (z. B. `language_hints: ["de", "it"]`).
`customer_profile.routing.low_confidence_threshold` (Default 0.75) entscheidet
über `extracted` vs. `requires_review`.

---

## Events

| Event                          | Wann                                |
|--------------------------------|-------------------------------------|
| `pp.receipt.extracted`         | Erfolgreiche Extraktion             |
| `pp.receipt.requires_review`   | Niedrige Confidence / Validation    |
| `pp.receipt.extraction_failed` | OCR-Fehler / Storage-Fehler         |

Stream: `pp:events:receipt`. Format wie 01 §4.2.

---

## Tests ausführen

```bash
cd backend
npm install          # installiert auch @google-cloud/vision + @anthropic-ai/sdk
npm run migrate      # legt suppliers_global an
npm test             # field-extractor.test.ts, validator.test.ts, e2e.test.ts
```

Die Tests mocken OCR und Claude vollständig — keine externen API-Calls, kein
echter Postgres/MinIO-Container nötig (alle DB-Queries laufen gegen ein
in-memory Fake-Pool).

---

## Decisions (was war mehrdeutig in der Spec)

1. **Customer-ID-Format** — Foundation D2 nutzt `customers(id UUID, tenant_id UUID)`,
   M10 nutzt `receipts(customer_id TEXT)` (ULID/Slug `cust_a3f4b2`). M01 folgt
   M10 (TEXT-IDs), weil das bestehende `receipts`-Schema das so führt.
   Sprint 0 D2 wird das später konsolidieren.

2. **Receipt-Repository-Lokation** — Spec §14 zeigt nur das M01-Modul,
   sagt aber nichts über shared receipt code. Wir legen ein neues
   `backend/src/modules/_shared/receipts/receipt.repository.ts` an, das
   M02..M07 ebenfalls nutzen können. M10 hat seinen eigenen Read-only-Lookup
   für die Idempotenz-Suche und bleibt unverändert.

3. **Claude-Fallback-Trigger** — Spec sagt „bei niedrigem Regex-Confidence".
   Wir interpretieren das als `regex_confidence < 0.6 ODER supplier_name leer`,
   weil ein Beleg ohne Lieferanten unbrauchbar ist, selbst wenn Datum + Brutto
   passen.

4. **Confidence-Gewichtung** — Spec sagt nur „kombiniere OCR + Fields"
   ohne konkrete Gewichte. Wir wählen 60 % OCR / 40 % Fields, weil OCR-Konfidenz
   die robustere Größe ist (Provider liefert ihn pro Word, deterministisch).

5. **suppliers_global RLS** — Spec sagt „nicht customer-spezifisch (globale
   Stammdaten), Backend-Service steuert Zugriff". Wir verzichten auf RLS-Policy
   und führen keinen `customer_id`-Spalte. Die einzelnen Override-Mappings
   pro Kunde liegen in `customer_profiles.custom.supplier_overrides`.

6. **PDF-OCR** — Phase 1 nur 1-seitig synchron via `batchAnnotateFiles`. Mehrere
   Seiten / `asyncBatchAnnotateFiles` mit GCS-Bucket kommen in Phase 3.

7. **Idempotency** — Auf Receipt-Ebene (UNIQUE `(customer_id, file_sha256)`)
   trägt Migration 010. Auf Operationsebene reicht Backend-D3-Middleware (Schwert
   pro `Idempotency-Key` 24 h). M01 selbst behandelt einen zweiten Aufruf
   einfach als Re-Run: er erzeugt einen neuen extraction-Pass und überschreibt
   den vorherigen — Audit-Log behält alle Pässe.

8. **Tax-Lines aus Regex** — Bei mehreren MwSt-Sätzen ist eine zuverlässige
   Aufteilung ohne Zeilendaten nicht möglich. Wir setzen tax_lines nur, wenn
   genau ein Satz erkannt wurde; bei mehreren übernimmt Claude.

---

## Acceptance Criteria (M01 §17 — Verifikation)

| # | Kriterium | Datei-Referenz |
|---|-----------|----------------|
| 1 | Extraktion liefert für 80 % von 20 Belegen `is_valid=true` ∧ Confidence ≥ 0.8 | `tests/fixtures/m01/fixture_01_supermarkt.json` (2 weitere Beispiele dort + Erweiterung in Sprint-1-MVP); end-to-end-Pfad in [extract.handler.ts:74](backend/src/modules/m01-receipt-intake/handlers/extract.handler.ts:74) |
| 2 | Steuerzeilen-Konsistenz + Brutto-Netto-Match werden korrekt validiert | [validator.ts](backend/src/modules/m01-receipt-intake/services/validator.ts) `totals_match` + `tax_lines_consistent`; Tests in [validator.test.ts](backend/src/modules/m01-receipt-intake/tests/validator.test.ts) |
| 3 | Bei niedriger Confidence wird Status `requires_review` gesetzt + Event emittiert | [extract.handler.ts:108](backend/src/modules/m01-receipt-intake/handlers/extract.handler.ts) (newStatus-Logik); Event in [event-emitter.ts](backend/src/modules/m01-receipt-intake/services/event-emitter.ts) |
| 4 | ~~Hooks `before_extraction`/`after_extraction`~~ | Hook-System in T051 entfernt (Post-Pilot — siehe Hooks-Abschnitt oben). |
| 5 | OCR-Adapter ist austauschbar (Mindee-Stub mockbar) | [factory.ts](backend/src/core/adapters/ocr/factory.ts) + [mindee.adapter.ts](backend/src/core/adapters/ocr/mindee.adapter.ts); E2E mockt den Adapter komplett ([e2e.test.ts](backend/src/modules/m01-receipt-intake/tests/e2e.test.ts)) |
| 6 | Claude-Fallback wird nur aufgerufen, wenn Regex unzureichend | [field-extractor.ts](backend/src/modules/m01-receipt-intake/services/field-extractor.ts) (`shouldUseClaude = regexConfidence < 0.6 \|\| supplierMissing`); Tests in [field-extractor.test.ts](backend/src/modules/m01-receipt-intake/tests/field-extractor.test.ts) |
| 7 | Idempotenz: gleicher Aufruf zweimal → identisches Ergebnis, nur 1 Audit-Eintrag | UNIQUE `(customer_id, file_sha256)` in [migrations/010_m10_minimal.sql:72](migrations/010_m10_minimal.sql); D3 dedupliziert pro `Idempotency-Key` 24 h. Re-Run mit Status `requires_review` ist ausdrücklich erlaubt (M01 §3) |
