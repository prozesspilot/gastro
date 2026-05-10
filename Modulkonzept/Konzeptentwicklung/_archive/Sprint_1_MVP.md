# Sprint 1 — MVP Basic (ausgefüllte Prompts)

> **Ziel:** Erster Kunde verkaufbar. Ein Gastronom kann WhatsApp-Belege schicken → erscheinen < 60s als PDF in seinem Google Drive + als Zeile in seinem Google Sheet.
> **Vorgehen:** Prompts der Reihe nach abarbeiten. Jeder Prompt ist 1:1 copy-paste-fähig in Claude Code. Nach jedem Prompt: Acceptance Criteria aus der jeweiligen Modul-Spec abhaken.
> **Kritischer Pfad:** `M10 → M01 → [M02 ∥ M07] → WF-MASTER → E2E`
> **Voraussetzung:** Sprint 0 vollständig grün (alle D1–D10 Acceptance Criteria erfüllt).

---

## Schritt 1 — M10: WhatsApp Eingang

**Wann:** Tag 1–4 von Sprint 1.
**Voraussetzung:** Sprint 0 grün. WhatsApp Business App-Verifizierung bei Meta bereits angestoßen (braucht 2–3 Wochen Vorlauf).
**Erwartete Generations-Zeit:** ~5 Min.
**Erwartete Review/Setup-Zeit:** 1–2 Tage (Meta-Webhook-Verifizierung, Credential-Setup).

### Prompt (copy-paste)

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / Fastify) + n8n-Spezialist in ProzessPilot.
Du implementierst Modul M10 — WhatsApp Eingang — vollständig nach Spec.
Keine Erfindungen, keine Auslassungen.

KONTEXT (Pflicht-Lesen in dieser Reihenfolge)
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md
3. /Konzeptentwicklung/02_Kundenprofil_System.md §2 (CustomerProfile-JSON, integrations.input_whatsapp)
4. /Konzeptentwicklung/03_n8n_Workflows.md
5. /Konzeptentwicklung/modules/M10_WhatsApp_Eingang.md (VERBINDLICH, alle §§)
6. /Konzeptentwicklung/Foundation_Spec.md §D3 (HMAC), §D6 (Events), §D8 (Storage)

AUFGABE
Generiere M10 vollständig:
  a) Backend-Modul unter backend/src/modules/m10-whatsapp/
  b) n8n-Workflow WF-INPUT-WHATSAPP.json

KEINE NEUEN DB-MIGRATIONS — M10 nutzt die bereits existierenden Tabellen:
  customers, customer_profiles, customer_credentials, receipts, audit_log.

BACKEND-MODUL: Datei-Struktur exakt nach M10-Spec §8:
  backend/src/modules/m10-whatsapp/
  ├── routes.ts
  ├── handlers/
  │   ├── verify.handler.ts
  │   ├── resolve.handler.ts
  │   ├── media.handler.ts
  │   └── send-template.handler.ts
  ├── services/
  │   ├── meta-graph.client.ts
  │   ├── webhook-verifier.ts
  │   ├── customer-resolver.ts
  │   └── media-downloader.ts
  ├── schemas/
  │   ├── webhook.schema.ts       (Zod, nach M10 §5.1)
  │   ├── resolve.input.ts
  │   └── media.input.ts
  └── tests/
      ├── verify.test.ts
      ├── resolve.test.ts
      ├── media.test.ts
      └── e2e.test.ts

VERBINDLICHE IMPLEMENTIERUNGSREGELN
- verify.handler.ts:
    POST /api/v1/internal/whatsapp/verify
    Prüft X-Hub-Signature-256 (HMAC-SHA256 mit WHATSAPP_APP_SECRET).
    Body: { raw_body_b64: string; signature: string }
    Response: { ok: true } | 401 { ok: false, error: { code: 'INVALID_SIGNATURE' } }
- resolve.handler.ts:
    POST /api/v1/internal/whatsapp/resolve
    Sucht customer_profile über profile.integrations.input_whatsapp.phone_number_id === req.phone_number_id.
    Prüft, ob from ∈ profile.integrations.input_whatsapp.allowed_senders[].phone (normalizePhone: + entfernen, führende 0→Ländervorwahl).
    Response exakt nach M10-Spec §7.2.
- media.handler.ts:
    POST /api/v1/internal/whatsapp/media
    Logik exakt nach M10-Spec §7.3 (URL holen → Bytes → sha256 → Idempotenz-Check → MinIO-Upload).
    Nutzt StorageAdapter aus D8 (factory.ts, MinIO-Adapter).
    Idempotenz: SELECT FROM receipts WHERE customer_id=$1 AND file_sha256=$2 → falls vorhanden, return existing object_key mit is_duplicate: true.
- send-template.handler.ts:
    POST /api/v1/internal/whatsapp/send-template
    Ruft Graph-API auf: POST https://graph.facebook.com/{WHATSAPP_GRAPH_API_VERSION}/{phone_number_id}/messages
    Template-Nachrichten (confirmation_received_de, sender_not_registered).
- meta-graph.client.ts:
    getMediaMeta(mediaId, accessToken): Promise<{ url, mime_type, sha256, file_size }>
    downloadMediaBytes(url, accessToken): Promise<Buffer>
    sendTemplateMessage(phoneNumberId, to, templateName, accessToken): Promise<{ message_id }>
    Axios oder node-fetch; Retry 3× bei 5xx; kein Retry bei 4xx.
- customer-resolver.ts: Pseudocode aus M10 §8.1 exakt implementieren.
- media-downloader.ts: Pseudocode aus M10 §8.1 exakt implementieren.
- webhook-verifier.ts: HMAC-SHA256 timing-safe compare (crypto.timingSafeEqual).
- Alle Endpoints sind HMAC-geschützt via D3-Middleware (PP_AUTH_DISABLED=1 für Tests).
- Credential-Entschlüsselung: nutze den bereits aus D5 implementierten credentialService.
- Event-Emission: nutze publisher.publish() aus D6.
  Bei receipt.received: Event auf PP_STREAM_RECEIPT.
- Audit-Log: nutze auditService aus D10-Skeleton (oder stub, falls noch nicht implementiert).
- ENV-Variablen aus M10 §14 in .env.example ergänzen.

N8N-WORKFLOW WF-INPUT-WHATSAPP.json:
  - Alle 14 Nodes aus M10-Spec §6 implementieren.
  - Node 1: Webhook POST /webhook/wa, Response Mode: "Using 'Respond to Webhook' Node".
  - Node 11 (Run: WF-MASTER-RECEIPT): continueOnFail: true, executionMode: 'parallel' (fire-and-forget).
  - Idempotenz: Wenn resolve zurückgibt { is_duplicate: true }, Respond 200 ohne neuen Pipeline-Run.
  - HMAC-Signatur: Code-Node berechnet sha256(body) + Timestamp, setzt X-PP-Signature und X-PP-Timestamp Header.
  - Retry: 3× bei 5xx auf HTTP-Nodes, kein Retry bei 4xx.
  - Hinweis-Message-Branch (Step 14): bei type='text' oder allowed===false.

TESTS
- verify.test.ts: gültige Signatur → 200, ungültige → 401, fehlendes Secret → 401.
- resolve.test.ts: bekannter Phone-Number-ID + erlaubter Sender → allowed:true; unbekannter Sender → allowed:false; unbekannte phone_number_id → 404.
- media.test.ts: Mock meta-graph.client, zweimal gleicher sha256 → is_duplicate:true, nur 1 Storage-Upload.
- e2e.test.ts: Kompletter Webhook-Payload (M10 §5.1 Beispiel) durch alle Endpoints pipen (Test-DB, MinIO-Container).
- Coverage-Ziel: > 90%.

OUTPUT
1. Datei-Liste mit Pfaden.
2. Vollständiger Code je Datei (kein Truncating).
3. .env.example-Patch (neue Variablen).
4. n8n/workflows/WF-INPUT-WHATSAPP.json (vollständig, importierbar).
5. backend/src/modules/m10-whatsapp/README.md.
6. Verifikations-Block: alle 10 Acceptance Criteria aus M10 §16 mit Test-/Datei-Referenz.
7. Decisions: was gewählt, wo Spec mehrdeutig war.
```

### Was du nach diesem Prompt machst

1. Dateien anlegen wie im Output.
2. `npm test -- m10` → grün.
3. `.env` mit echten Test-Werten (App Secret aus Meta, Test-Access-Token) befüllen.
4. Webhook-URL bei Meta konfigurieren: `https://<ngrok-url>/webhook/wa`.
5. Meta Webhook-Challenge: `GET /webhook/wa?hub.challenge=<token>&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>` → 200.
6. WF-INPUT-WHATSAPP.json in n8n importieren.
7. Test-Bild via WhatsApp schicken → MinIO-Objekt prüfen (`mc ls myminio/prozesspilot-raw`).
8. Alle 10 Acceptance Criteria aus M10 §16 abhaken.

### Wichtige Setup-Hinweise

- Meta-App-Verifizierung dauert 2–3 Wochen — muss parallel zu Phase 0 gestartet worden sein.
- Für Tests bis WhatsApp-Verifizierung: Postman oder ngrok für lokale Webhook-Tests nutzen.
- System-User-Token (langlebig, 60 Tage): in Meta Business Manager anlegen, in `customer_credentials` als kind='wa_access_token' speichern.

### Decisions notieren

| Decision-ID | Entscheidung | Begründung |
|-------------|--------------|------------|
| M10.1       |              |            |
| M10.2       |              |            |

---

## Schritt 2 — M01: Belegerfassung & OCR

**Wann:** Tag 5–9 (direkt nach M10 grün).
**Voraussetzung:** M10 grün. Google Cloud Vision API aktiviert, Service-Account-JSON vorhanden.
**Erwartete Generations-Zeit:** ~8 Min.
**Erwartete Review-Zeit:** 2 Tage (Fixtures anlegen, OCR-Qualität prüfen).

### Prompt (copy-paste)

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / Fastify) + n8n-Spezialist in ProzessPilot.
Du implementierst Modul M01 — Belegerfassung & OCR — vollständig nach Spec.

KONTEXT (Pflicht-Lesen)
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md §2 (Receipt vollständig), §4 (Events), §5 (API)
3. /Konzeptentwicklung/02_Kundenprofil_System.md §2.2 (integrations.ocr, routing.*)
4. /Konzeptentwicklung/04_Erweiterbarkeit_Pro.md §3 (Hook-Points before_extraction, after_extraction)
5. /Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md (VERBINDLICH, alle §§)
6. /Konzeptentwicklung/Foundation_Spec.md §D6 (publisher), §D8 (StorageAdapter)

AUFGABE
Generiere M01 vollständig:
  a) DB-Migration: Tabelle suppliers_global (M01 §11)
  b) OCR-Adapter-Interface + Google-Vision-Implementation (M01 §8)
  c) Backend-Modul backend/src/modules/m01-receipt-intake/ (M01 §14)
  d) n8n-Workflow n8n/workflows/WF-M01.json (M01 §6)
  e) Test-Fixtures (Placeholder-Dateien mit realistischen Strukturen)

DB-MIGRATION
Datei: backend/migrations/003_suppliers_global.sql
Inhalt exakt nach M01 §11:
  - Tabelle suppliers_global mit allen Feldern
  - GIN-Index idx_suppliers_aliases
  - RLS: customer-spezifisch NICHT anwenden (globale Stammdaten), aber Row-Level-Queries via Backend-Service.

OCR-ADAPTER (backend/src/core/adapters/ocr/)
Interface OcrAdapter + OcrResult exakt nach M01 §8.1.
google-vision.adapter.ts:
  - @google-cloud/vision SDK, Feature DOCUMENT_TEXT_DETECTION.
  - language_hints aus Config (z. B. ["de", "it"]).
  - Für PDF (syncAnnotateFile, nur 1-seitig, Phase 1).
  - Gibt OcrResult zurück: raw_text, confidence (Durchschnitt over all words), blocks[], words[], page_count.
  - Credential: keyFilename aus ENV GOOGLE_VISION_KEY_FILE.
  - OCR_TIMEOUT_MS aus ENV.
factory.ts: adapterFactory.for(provider: 'google_vision' | 'mindee') → OcrAdapter.
  mindee: throw new Error('NOT_IMPLEMENTED — kommt in Phase 3').

BACKEND-MODUL (backend/src/modules/m01-receipt-intake/)
Datei-Struktur exakt nach M01 §14.

extract.handler.ts:
  POST /api/v1/receipts/:receipt_id/extract
  Logik exakt nach M01 §7.1 Pseudocode:
    1. Receipt laden (assertStatus: received | requires_review)
    2. hookRunner.run('before_extraction', ...) — nutze hookRunner aus 04_Erweiterbarkeit_Pro.md §3
       (Stub falls noch nicht implementiert: einfach { receipt, profile } zurückgeben).
    3. OCR via adapterFactory.for(profile.integrations.ocr?.provider ?? 'google_vision')
    4. Field-Extraktion via fieldExtractor.extract(ocr, profile)
    5. Validator via validator.validate(fields)
    6. Confidence-Scoring: combineConfidence(ocr.confidence, fields.confidence)
       Threshold: profile.routing.low_confidence_threshold ?? 0.75
    7. hookRunner.run('after_extraction', ...)
    8. receiptRepo.update(patched)
    9. audit.log + events.emit

field-extractor.ts:
  Reihenfolge exakt nach M01 §9.1:
  a) Regex-Extraktion zuerst (Datum, USt-ID, Beträge, MwSt-Sätze) — alle Patterns aus §9.1 implementieren.
  b) Lieferant: zuerst customer_profile.custom.supplier_overrides (exact + fuzzy mit Levenshtein ≤2),
     dann SELECT FROM suppliers_global WHERE vat_id=$1 OR aliases @> ARRAY[$2],
     dann claude-extractor.ts.
  c) Claude-Fallback (claude-extractor.ts) NUR wenn:
     - regex_confidence < 0.6 ODER
     - supplier_name konnte nicht ermittelt werden.

claude-extractor.ts:
  Nutzt Anthropic SDK (@anthropic-ai/sdk).
  Tool-Use mit einem Tool "extract_receipt_fields", dessen Input-Schema alle extraction.fields.*-Felder definiert.
  System-Prompt: "Du bist ein präziser Beleg-Extraktor. Antworte ausschließlich via Tool-Call. Extrahiere alle Felder aus dem gegebenen Belegtext."
  Model: CLAUDE_MODEL aus ENV (default: claude-sonnet-4-6).
  Bei API-Fehler: loggen und { ..., claude_confidence: 0 } zurückgeben (kein Throw, Fallback auf Regex-Only).

validator.ts:
  Alle 6 Checks aus M01 §10:
  totals_match: |total_gross - (total_net + Σ tax_lines.amount)| ≤ 0.02
  tax_lines_consistent: für jede Line: |amount - (base * rate)| ≤ 0.02
  supplier_known: supplier_name vorhanden ODER supplier_vat_id vorhanden
  document_date_plausible: Datum ∈ [heute - 5 Jahre, heute + 1 Tag]
  duplicate: SELECT COUNT(*) FROM receipts WHERE customer_id=$1 AND extraction_supplier_vat_id=$2 AND extraction_document_number=$3 AND receipt_id != $4
  currency_supported: currency ∈ (profile.routing?.supported_currencies ?? ['EUR'])

confidence-scorer.ts:
  combineConfidence(ocrConfidence, fieldsConfidence): Gewichteter Durchschnitt (60% OCR, 40% Fields).
  fieldsConfidence berechnet aus: Anzahl pflichtiger Felder die vorhanden sind / total.

RECEIPT-REPOSITORY (falls nicht schon aus Phase 0 vorhanden)
Falls receiptRepo.findById / receiptRepo.update noch kein echtes Modul hat:
  Lege backend/src/modules/_shared/receipts/receipt.repository.ts an mit:
  - findById(id, customerId): Promise<Receipt | null>
  - update(receipt: Partial<Receipt> & { receipt_id: string, customer_id: string }): Promise<Receipt>
  - findByHash(customerId, sha256): Promise<Receipt | null>
  - create(data: Omit<Receipt, 'created_at' | 'updated_at'>): Promise<Receipt>
  Nutzt pg-Pool aus D2.

N8N-WORKFLOW WF-M01.json
  6 Nodes exakt nach M01 §6.
  Trigger (Execute Workflow) akzeptiert Input-Schema aus M01 §5.1.
  HTTP-Node Backend: Extract → POST {{$env.BACKEND_URL}}/api/v1/receipts/{{$json.receipt.receipt_id}}/extract
  Headers: X-Customer-ID, X-Trace-ID, Idempotency-Key, X-PP-Signature.
  IF: ok===true → Build Result → Respond.
  Else → Set Error-Output { ok: false, module: 'M01', error: {...} } → Respond.

TESTS
backend/src/modules/m01-receipt-intake/tests/field-extractor.test.ts:
  - 3 Test-Belege als Fixtures (inline JSON mit raw_text, erwartetem fields-Output).
  - Regex-Paths: Datum DE-Format, ISO-Format, Beträge mit Komma, USt-ID DE.
  - Claude-Fallback-Path: wenn regex_confidence < 0.6 → claude-extractor aufgerufen (Mock).
  - Lieferant über supplier_overrides gefunden (Mock).

backend/src/modules/m01-receipt-intake/tests/validator.test.ts:
  - totals_match: korrekte Summe → valid, Abweichung 0.05 → invalid.
  - duplicate: gleiche USt-ID + Belegnummer → duplicate=true.
  - Alle 6 Checks positiv + 1 Negativ-Case je Check.

backend/src/modules/m01-receipt-intake/tests/e2e.test.ts:
  - Legt Test-Receipt in DB (status=received), Dummy-Bild in MinIO.
  - POST /api/v1/receipts/{id}/extract → erwartet status=extracted ODER requires_review.
  - Prüft: Receipt in DB hat extraction.* gefüllt, audit_log-Eintrag vorhanden.
  - Nutzt PP_AUTH_DISABLED=1 für HMAC-Bypass in Tests.

backend/tests/fixtures/m01/ (Placeholder-Struktur anlegen):
  Erstelle 3 Beispiel-Fixture-Dateien als JSON (anonymisierte Beleg-Daten):
  - fixture_01_supermarkt.json  (klarer Beleg, Confidence > 0.9)
  - fixture_02_handschrift.json (schlechte OCR, Confidence < 0.6 → requires_review)
  - fixture_03_doppelt.json     (Duplikat-Beleg für Duplikat-Test)
  Format: { raw_text, expected_fields, expected_status, expected_confidence_range }

ENV-VARIABLEN (.env.example ergänzen):
  GOOGLE_VISION_KEY_FILE=/secrets/gcp-vision.json
  CLAUDE_API_KEY=sk-ant-...
  CLAUDE_MODEL=claude-sonnet-4-6
  OCR_TIMEOUT_MS=15000

OUTPUT
1. Datei-Liste mit Pfaden.
2. Vollständiger Code je Datei.
3. Migration-SQL vollständig.
4. n8n/workflows/WF-M01.json (vollständig).
5. .env.example-Patch.
6. backend/src/modules/m01-receipt-intake/README.md.
7. Verifikation: alle 7 Acceptance Criteria aus M01 §17 mit Test-/Datei-Referenz.
8. Decisions.
```

### Was du nach diesem Prompt machst

1. Dateien anlegen.
2. `npm run migrate` → 003_suppliers_global.sql angewandt.
3. `npm test -- m01` → grün.
4. Test-Bild lokal in MinIO hochladen, per `curl` den Extract-Endpoint aufrufen, Output prüfen.
5. 20 anonymisierte Test-Belege in `backend/tests/fixtures/m01/` ablegen (nach Onboarding erster Kunden).
6. Alle 7 Acceptance Criteria aus M01 §17 abhaken.

### Wichtige Hinweise

- Google Vision Service Account: in GCP Console anlegen, Rolle "Cloud Vision API User" vergeben.
- DATEV-Steuerschlüssel-Mapping (`tax_keys_map`) wird erst in M03/M04 gebraucht — M01 schreibt nur `rate`.
- Claude-Fallback-Kosten: pro Beleg ca. 0.002–0.005 USD. Überwachen wenn > 20% der Belege Claude nutzen.

### Decisions notieren

| Decision-ID | Entscheidung | Begründung |
|-------------|--------------|------------|
| M01.1       |              |            |
| M01.2       |              |            |

---

## Schritt 3 — M02: Belegarchivierung (parallel mit Schritt 4)

**Wann:** Tag 10–13 (parallel zu M07).
**Voraussetzung:** M01 grün. Google Drive OAuth2-Credentials für Test-Kunde vorhanden.
**Erwartete Generations-Zeit:** ~6 Min.
**Erwartete Review-Zeit:** 1–2 Tage (OAuth-Flow, Drive-Integration testen).

### Prompt (copy-paste)

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / Fastify) in ProzessPilot.
Du implementierst Modul M02 — Belegarchivierung (GoBD) — vollständig nach Spec.

KONTEXT (Pflicht-Lesen)
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md §2.1 (receipts.payload.archive)
3. /Konzeptentwicklung/02_Kundenprofil_System.md §2.2 (integrations.archive)
4. /Konzeptentwicklung/04_Erweiterbarkeit_Pro.md §3 (Hook-Points before_archive, after_archive)
5. /Konzeptentwicklung/modules/M02_Belegarchivierung.md (VERBINDLICH, alle §§)
6. /Konzeptentwicklung/Foundation_Spec.md §D8 (MinIO StorageAdapter, als Basis für neuen StorageAdapter)

AUFGABE
Generiere M02 vollständig:
  a) Storage-Adapter für Archive-Provider (Google Drive, Dropbox-Stub) — ACHTUNG: dieser Adapter
     ist UNTERSCHIEDLICH vom MinIO-StorageAdapter aus D8. Neues Interface für Kunden-Cloud-Ablage.
  b) Core-Utilities: pdf/image-to-pdf.ts, templates/path-template.ts
  c) Backend-Modul backend/src/modules/m02-archive/
  d) n8n-Workflow n8n/workflows/WF-M02.json

KEINE NEUEN DB-MIGRATIONS — M02 schreibt nur in receipts.payload (JSONB).

NEUE CORE-ADAPTER (backend/src/core/adapters/archive-storage/)
Interface ArchiveStorageAdapter exakt nach M02 §8.1:
  exists(path, customerId): Promise<boolean>
  upload(input: { customerId, path, bytes, mime, metadata }): Promise<{ path, external_id, url? }>
  delete(externalId, customerId): Promise<void>
  download(externalId, customerId): Promise<Buffer>

google-drive.adapter.ts (vollständig implementieren):
  - Nutzt googleapis SDK (npm install googleapis).
  - OAuth2 Client: Access-Token + Refresh-Token aus customer_credentials (kind='drive_oauth').
  - Token-Refresh: Wenn API → 401, Refresh-Token-Flow, neuen Access-Token in customer_credentials speichern.
  - Folder-Hierarchie on-demand anlegen: splitPath → für jede Ebene: files.list({q: "name='x' and 'parentId' in parents and mimeType='folder'"}) → falls kein Result: files.create(folder).
  - Folder-Cache: Redis-Key cust:{id}:drive:folder:{path_hash} → folder_id, TTL 3600s.
  - Upload: Für < 5MB: files.create mit multipart; für ≥ 5MB: Resumable Upload Session.
  - exists(): files.list mit name+parent → length > 0.
  - Datei-Metadata: appProperties { receipt_id, sha256, pp_version: '1' }.

dropbox.adapter.ts (Stub):
  Alle Methoden implementieren mit throw new Error('DROPBOX_NOT_IMPLEMENTED — kommt in Phase 2').
  Interface korrekt typisiert, damit factory.ts kompiliert.

factory.ts:
  archiveStorageAdapterFactory.for(provider: 'google_drive' | 'dropbox' | 'webdav'): ArchiveStorageAdapter

CORE-UTILITIES
backend/src/core/pdf/image-to-pdf.ts:
  Implementierung EXAKT nach M02 §10 (Code-Block aus der Spec eins-zu-eins übernehmen).
  Dependencies: pdf-lib, sharp.
  Export: async function imageToPdf(bytes: Buffer, mime: string): Promise<Buffer>
  Auch: isPdf(mime: string): boolean

backend/src/core/templates/path-template.ts:
  renderPathTemplate(template: string, receipt: Receipt): string
  renderFilename(template: string, receipt: Receipt): string
  Alle Variablen aus M02 §9.1 implementieren.
  Sanitizing nach §9.3: /, \, .. entfernen; ä→ae, ö→oe, ü→ue, ß→ss; max 200 Zeichen.

BACKEND-MODUL (backend/src/modules/m02-archive/)
Datei-Struktur nach M02 §15.

archive.handler.ts:
  POST /api/v1/receipts/:receipt_id/archive
  Logik exakt nach M02 §7.1 Pseudocode (alle 8 Schritte).
  assertStatus: ['extracted', 'categorized']
  Adapter-Auswahl: archiveStorageAdapterFactory.for(profile.integrations.archive.provider)
  Collision-Resolution: Counter-Suffix _001, _002, ... bis maximal 50, danach Error TOO_MANY_COLLISIONS.
  Bild → PDF: imageToPdf() wenn mime_type !== 'application/pdf'.
  GoBD-Compliance: pdf-lib setProducer('ProzessPilot'), setCreationDate(new Date()).

services/path-template.ts: Datei-Import aus backend/src/core/templates/path-template.ts.
services/collision-resolver.ts: Hilfsfunktionen appendCounter(filename, n): string.
services/filename-sanitizer.ts: Re-Export aus path-template.ts (für Lesbarkeit im Modul).

N8N-WORKFLOW WF-M02.json
  6 Nodes exakt nach M02 §6.
  Trigger: Execute Workflow, Input-Schema nach M02 §5.1.
  HTTP-Node: POST {{$env.BACKEND_URL}}/api/v1/receipts/{{$json.receipt.receipt_id}}/archive
  Headers: X-Customer-ID, X-Trace-ID, Idempotency-Key, X-PP-Signature.
  Retry: 3× bei 5xx (exponential: 5s, 30s, 3min).

TESTS
backend/src/modules/m02-archive/tests/:
  - archive.handler.test.ts:
      Mock archiveStorageAdapterFactory → Mock-Adapter gibt canned Response zurück.
      Test 1: Status 'extracted' → erfolgreich archiviert → Receipt status = 'archived'.
      Test 2: Status 'received' → assertStatus wirft → 422 INVALID_STATUS.
      Test 3: imageToPdf() wird nur bei image/jpeg aufgerufen, nicht bei application/pdf.
      Test 4: Token-Refresh: Drive gibt 401 → Refresh → Retry erfolgreich.
      Test 5: Kollision: exists() gibt 3× true, dann false → Dateiname endet auf _003.
  - path-template.test.ts:
      renderPathTemplate('{year}/{month_de}/{category_label}/', receipt) → '2026/April/Wareneinkauf/'.
      renderFilename mit Sonderzeichen: ä→ae, ü→ue, / entfernt.
      Leere Variable → 'unbekannt'.
  - image-to-pdf.test.ts:
      JPEG Buffer (3×3 Test-Pixel via sharp) → PDF-Output, enthält Producer='ProzessPilot'.

ABHÄNGIGKEITEN (package.json)
npm install googleapis pdf-lib sharp
Typen: @types/sharp falls nötig.

ENV-VARIABLEN (.env.example ergänzen):
  DRIVE_FOLDER_CACHE_TTL_SEC=3600
  (OAuth-Tokens werden per Customer-Credential gespeichert, kein globales ENV)

OUTPUT
1. Datei-Liste mit Pfaden.
2. Vollständiger Code je Datei.
3. package.json-Patch (neue Dependencies).
4. n8n/workflows/WF-M02.json (vollständig).
5. .env.example-Patch.
6. backend/src/modules/m02-archive/README.md.
7. Verifikation: alle 8 Acceptance Criteria aus M02 §16 mit Test-/Datei-Referenz.
8. Decisions.
```

### Was du nach diesem Prompt machst

1. Dateien anlegen, `npm install`.
2. `npm test -- m02` → grün.
3. OAuth2-Refresh-Token für Test-Google-Account holen (OAuth-Playground → Drive-Scope).
4. Customer-Credential (kind='drive_oauth') in Test-DB anlegen.
5. Test-Receipt (status=extracted) anlegen, `curl` Archive-Endpoint → Drive-Ordner prüfen.
6. Datei in Drive sichtbar? Metadata-Felder receipt_id + sha256 vorhanden?
7. Alle 8 Acceptance Criteria aus M02 §16 abhaken.

### Decisions notieren

| Decision-ID | Entscheidung | Begründung |
|-------------|--------------|------------|
| M02.1       |              |            |
| M02.2       |              |            |

---

## Schritt 4 — M07: Excel / Google Sheets Export (parallel mit Schritt 3)

**Wann:** Tag 10–12 (parallel zu M02, nur 3 Tage da weniger komplex).
**Voraussetzung:** M01 grün. Google Sheets API aktiviert, Test-Spreadsheet angelegt.

### Prompt (copy-paste)

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / Fastify) in ProzessPilot.
Du implementierst Modul M07 — Excel / Google Sheets Export — vollständig nach Spec.

KONTEXT (Pflicht-Lesen)
1. /Konzeptentwicklung/01_Datenmodell_Events.md §2 (Receipt), §5 (API)
2. /Konzeptentwicklung/02_Kundenprofil_System.md §2.2 (integrations.spreadsheet)
3. /Konzeptentwicklung/modules/M07_Excel_Sheets_Export.md (VERBINDLICH, alle §§)

AUFGABE
Generiere M07 vollständig:
  a) DB-Migration: Tabelle spreadsheet_row_index
  b) Spreadsheet-Adapter (Google Sheets vollständig, Excel-OneDrive als Stub)
  c) Backend-Modul backend/src/modules/m07-spreadsheet/
  d) n8n-Workflow n8n/workflows/WF-M07.json

DB-MIGRATION
Datei: backend/migrations/004_spreadsheet_row_index.sql
Tabelle exakt nach M07 §10, inkl. PRIMARY KEY (customer_id, sheet_id, tab, receipt_id).
RLS: NICHT aktivieren (kein sensitive Daten, nur Row-Index).

SPREADSHEET-ADAPTER (backend/src/core/adapters/spreadsheet/)
Interface SpreadsheetAdapter exakt nach M07 §9.1.
google-sheets.adapter.ts (vollständig):
  - googleapis SDK (nutzt bereits installiertes googleapis aus M02).
  - OAuth2: Access+Refresh-Token aus customer_credentials (kind='sheets_oauth').
    Achtung: Gleicher OAuth2-Client wie Google Drive; prüfe ob Drive-Token Drive+Sheets-Scope hat
    (scope 'https://www.googleapis.com/auth/spreadsheets').
    Falls Kunde Drive+Sheets getrennt hat: separates Credential kind='sheets_oauth'.
  - ensureTabExists: spreadsheets.get → prüfe sheets[].properties.title; falls fehlt: batchUpdate addSheet.
  - ensureHeader: values.get Range {tab}!A1:Z1 → wenn leer oder Header nicht matcht, values.update mit COLUMNS.
    KEIN Auto-Korrektur bei Konflikt (M07 §12) — nur prüfen und Operator-Alert auslösen.
  - findRowByReceiptId: SELECT FROM spreadsheet_row_index WHERE customer_id=$1 AND sheet_id=$2 AND tab=$3 AND receipt_id=$4.
  - appendRow: values.append valueInputOption=USER_ENTERED, insertDataOption=INSERT_ROWS.
    Nach Append: INSERT INTO spreadsheet_row_index (customer_id, sheet_id, tab, receipt_id, row_index).
    row_index aus API-Response (updates.updatedRange → parse "Tab!A157:P157" → 157).
  - updateRow: values.update Range {tab}!A{row}:P{row}, valueInputOption=USER_ENTERED.

excel-onedrive.adapter.ts (Stub):
  throw new Error('EXCEL_ONEDRIVE_NOT_IMPLEMENTED — kommt in Phase 2')

factory.ts: spreadsheetAdapterFactory.for(provider)

SPALTEN-SCHEMA (COLUMNS Konstante)
Exakt 16 Spalten nach M07 §8, in der beschriebenen Reihenfolge A–P.
buildRow(receipt: Receipt): RowValue[]
  - Spalte D (Kategorie): receipt.categorization?.category_label ?? '–'
  - Spalte E (SKR-Konto): receipt.categorization?.skr_account ?? ''
  - Spalte F (Kostenstelle): receipt.categorization?.cost_center ?? ''
  - Spalte I (MwSt-Betrag): Summe aller tax_lines.amount
  - Spalte J (MwSt-Satz): dominanter Satz × 100 (höchster Betrag)
  - Spalte M (Beleg-Datei): receipt.archive?.path → Hyperlink-Formel =HYPERLINK("{url}","{filename}")
  - Spalte P (Eingang am): erster audit_log-Eintrag mit type='received', dessen .at-Timestamp.

TAB-NAME RESOLVER
renderTabName(template: string, receipt: Receipt): string
Default-Template: "Belege {year}" → "Belege 2026"
Kunden können eigenes Tab-Template in profile.integrations.spreadsheet.config.tab_name_template setzen.

EXTRA-SPALTEN
Nach buildRow(): falls profile.custom?.spreadsheet_extra_columns (Array<{header, jsonpath}>),
jeden JSONPath gegen receipt ausführen (mit jsonpath-package oder einfachem dot-notation Lookup),
Wert an Row anhängen. Header ebenfalls append (nach P).

BACKEND-MODUL (backend/src/modules/m07-spreadsheet/)
Datei-Struktur nach M07 §13.
append.handler.ts:
  POST /api/v1/receipts/:receipt_id/exports/spreadsheet
  Logik exakt nach M07 §7.1 Pseudocode (alle Schritte).
  assertStatus: ['archived', 'categorized']
  Idempotenz: findRowByReceiptId → falls vorhanden updateRow, sonst appendRow.
  receipt.exports Array: filter(e => e.target !== provider) + push neuen Eintrag.
  receipt.status = 'exported' (wenn noch nicht 'exported').
  Persist + audit.log + events.emit('pp.receipt.exported').

N8N-WORKFLOW WF-M07.json
  6 Nodes nach M07 §6.
  Trigger: Execute Workflow.
  HTTP-Node: POST {{$env.BACKEND_URL}}/api/v1/receipts/{{$json.receipt.receipt_id}}/exports/spreadsheet
  Headers: Standard (X-Customer-ID, X-Trace-ID, Idempotency-Key, X-PP-Signature).
  Retry: 3× bei 5xx.

TESTS
backend/src/modules/m07-spreadsheet/tests/:
  - append.handler.test.ts:
      Mock spreadsheetAdapterFactory.
      Test 1: Neuer Beleg → appendRow aufgerufen, receipt.exports enthält Google-Sheets-Eintrag.
      Test 2: Re-Run (receipt_id schon in spreadsheet_row_index) → updateRow, KEIN appendRow.
      Test 3: Tab noch nicht vorhanden → ensureTabExists aufgerufen.
      Test 4: Header fehlt → ensureHeader aufgerufen.
      Test 5: Extra-Columns aus profile.custom.spreadsheet_extra_columns.
  - row-builder.test.ts:
      buildRow(receipt) → 16 Spalten in korrekter Reihenfolge.
      Kategorie leer → '–'.
      Hyperlink-Formel korrekt.
      MwSt-Summierung korrekt bei mehreren Tax-Lines.
  - tab-name-resolver.test.ts:
      Dezember-Beleg 2026 → "Belege 2026", Januar-Beleg 2027 → "Belege 2027".

ABHÄNGIGKEITEN
npm install jsonpath-plus (für Extra-Columns JSONPath-Lookup; oder lodash.get falls einfach)
(googleapis bereits installiert durch M02)

OUTPUT
1. Datei-Liste mit Pfaden.
2. Vollständiger Code je Datei.
3. Migration-SQL vollständig.
4. n8n/workflows/WF-M07.json (vollständig).
5. backend/src/modules/m07-spreadsheet/README.md.
6. Verifikation: alle 6 Acceptance Criteria aus M07 §14 mit Test-/Datei-Referenz.
7. Decisions.
```

### Was du nach diesem Prompt machst

1. Dateien anlegen, `npm run migrate` (004_spreadsheet_row_index).
2. `npm test -- m07` → grün.
3. Google-Sheets-Test: Test-Sheet-ID im Customer-Profil hinterlegen.
4. Test-Receipt (status=archived) über Endpoint pushen.
5. Sheet prüfen: Header vorhanden? Zeile korrekt? Hyperlink in Spalte M?
6. Re-Run: gleiche Receipt-ID nochmal → gleiche Zeile aktualisiert (nicht dupliziert).
7. Alle 6 Acceptance Criteria aus M07 §14 abhaken.

### Decisions notieren

| Decision-ID | Entscheidung | Begründung |
|-------------|--------------|------------|
| M07.1       |              |            |
| M07.2       |              |            |

---

## Schritt 5 — WF-MASTER-RECEIPT: Vollständiger Master-Workflow

**Wann:** Tag 14–15 (nach M01, M02, M07 grün).
**Voraussetzung:** M01, M02, M07 fertig. WF-MASTER-RECEIPT.skeleton.json aus Sprint 0 D7 existiert.
**Erwartete Generations-Zeit:** ~4 Min.

### Prompt (copy-paste)

```
ROLLE
n8n-Spezialist + Backend Engineer in ProzessPilot.
Du vervollständigst den WF-MASTER-RECEIPT vom Sprint-0-Skeleton zum voll funktionsfähigen
Master-Workflow für den MVP.

KONTEXT (Pflicht-Lesen)
1. /Konzeptentwicklung/03_n8n_Workflows.md (vollständig — Architektur, Konventionen, Sub-Workflow-Pattern)
2. /Konzeptentwicklung/01_Datenmodell_Events.md §2 (Receipt), §7 (Routing-Logik)
3. /Konzeptentwicklung/modules/M10_WhatsApp_Eingang.md §5.2 (Pipeline-Input)
4. /Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md §5 (Input/Output)
5. /Konzeptentwicklung/modules/M02_Belegarchivierung.md §5 (Input/Output)
6. /Konzeptentwicklung/modules/M07_Excel_Sheets_Export.md §5 (Input/Output)
7. /Konzeptentwicklung/Foundation_Spec.md §D7, §D9 (Routing-Service)

AUFGABE
Vervollständige n8n/workflows/WF-MASTER-RECEIPT.json — das Skeleton aus Sprint 0 D7 ersetzen.
Außerdem: Backend-Endpoint POST /api/v1/receipts (Receipt anlegen) falls noch nicht vorhanden.

ABLAUF DES MASTER-WORKFLOWS (Node für Node)

Node 1 — Trigger: Execute Workflow
  Input-Schema: { trace_id, customer_id, source, file, user_caption? }
  (entspricht M10 §5.2 Output)

Node 2 — HTTP Request: "Backend: Create Receipt"
  POST {{$env.BACKEND_URL}}/api/v1/receipts
  Body: {
    customer_id: {{$json.customer_id}},
    status: "received",
    source: {{$json.source}},
    file: {{$json.file}},
    user_caption: {{$json.user_caption}}
  }
  → Gibt { ok: true, data: { receipt_id, ... } } zurück.
  Idempotency-Key: Hash aus source.external_id (wenn whatsapp) oder trace_id.
  Bei 409 (Duplikat via Idempotency): weiter mit existierendem receipt_id aus Response.

Node 3 — HTTP Request: "Backend: PlanRoute"
  POST {{$env.BACKEND_URL}}/api/v1/routing/plan
  Body: { receipt_id: {{$node["Backend: Create Receipt"].json.data.receipt_id}} }
  Headers: X-Customer-ID = {{$json.customer_id}}
  → Gibt RoutePlan { steps: ['M01', 'M02', 'M07'] } zurück.

Node 4 — Code (JS): "Build: Execution Context"
  Baut ein Objekt { receipt_id, customer_id, trace_id, steps, step_results: {} }
  aus den bisherigen Node-Outputs.

Node 5 — Execute Workflow: "Run: M01 Extract"
  Workflow: WF-M01
  Input: {
    trace_id: {{$json.trace_id}},
    idempotency_key: "ik_M01_{{$json.receipt_id}}",
    receipt: {{fetched from DB via receipt_id}},
    customer_profile: {{fetched from profile endpoint}}
  }
  HINWEIS: Receipt + CustomerProfile vor Aufruf nachladen über:
    GET {{$env.BACKEND_URL}}/api/v1/receipts/{{receipt_id}} (neuer Endpoint)
    GET {{$env.BACKEND_URL}}/api/v1/customers/{{customer_id}}/profile

Node 6 — IF: "IF: M01 ok"
  True: status ∈ {extracted} → weiter zu Node 7
  False: status = requires_review → Node 11 (Notify: Requires Review)
  Error: ok===false → Node 12 (Notify: Error)

Node 7 — Execute Workflow: "Run: M02 Archive" (wenn M02 in RoutePlan.steps)
  Gleiche Übergabe-Struktur wie Node 5.
  Wait for result (synchron).

Node 8 — IF: "IF: M02 ok"

Node 9 — Execute Workflow: "Run: M07 Spreadsheet" (wenn M07 in RoutePlan.steps)
  Parallel zu Node 10 ausführen falls möglich (n8n Split-in-Batches-Pattern).

Node 10 — (Platzhalter) "Run: Future Exports"
  Für M04/M05/M06 (noch nicht aktiviert im MVP).
  Set-Node mit { skipped: true }.

Node 11 — HTTP Request: "Backend: Update Status"
  PUT {{$env.BACKEND_URL}}/api/v1/receipts/{{receipt_id}}/status
  Body: { status: "requires_review", reason: "..." }

Node 12 — HTTP Request: "Notify: Operator Alert"
  POST {{$env.BACKEND_URL}}/api/v1/internal/notifications/operator
  Body: { channel: "email", subject: "Beleg-Fehler", receipt_id, trace_id, error }

Node 13 — Respond to Workflow
  Output: { ok: true, receipt_id, final_status }

FEHLERBEHANDLUNG
- continueOnFail: false für Nodes 2, 3 (kritisch).
- continueOnFail: true für Nodes 7, 9 (Export-Fehler soll nicht alles stoppen).
- Globaler Error-Workflow: in n8n Settings → Error Workflow auf WF-ERROR-HANDLER zeigen.
  WF-ERROR-HANDLER.json (Stub anlegen):
    Trigger: Workflow Error, Body: { workflow, node, error, execution }
    HTTP-Node: POST BACKEND/api/v1/internal/notifications/operator

NEUER BACKEND-ENDPOINT: POST /api/v1/receipts (Receipt anlegen)
  Lege an: backend/src/modules/_shared/receipts/routes.ts
  Endpoint: POST /api/v1/receipts
  Body-Validierung (Zod): { customer_id, status: 'received', source, file, user_caption? }
  Idempotenz via Idempotency-Key-Header: INSERT INTO receipts ... ON CONFLICT (idempotency_key) DO UPDATE SET ... → gibt existierenden zurück.
  Publish Event pp.receipt.received nach erfolgreichem INSERT.
  Audit-Log-Eintrag.
  Response: { ok: true, data: Receipt }

NEUER BACKEND-ENDPOINT: GET /api/v1/receipts/:id
  Gibt vollständiges Receipt-Objekt zurück (für n8n nachladen).
  RLS via X-Customer-ID.

NEUER BACKEND-ENDPOINT: PUT /api/v1/receipts/:id/status
  Body: { status, reason? }
  Für Master-Workflow Status-Updates.

VERBINDLICHE REGELN
- Sub-Workflow-Aufrufe nutzen Execute Workflow-Node (nicht HTTP-Request).
- Alle HTTP-Requests gegen Backend: Standard-Header-Set (HMAC, X-Customer-ID, X-Trace-ID, Idempotency-Key).
- RoutePlan.steps bestimmt WELCHE Module aufgerufen werden — Module die nicht in steps sind, überspringen.
- HMAC-Code-Node: wiederverwendbare Funktion als n8n-Code-Snippet (kein Copy-Paste über alle Workflows).

OUTPUT
1. n8n/workflows/WF-MASTER-RECEIPT.json (vollständig, importierbar).
2. n8n/workflows/WF-ERROR-HANDLER.json (Stub, importierbar).
3. backend/src/modules/_shared/receipts/routes.ts (neue Endpoints).
4. backend/src/modules/_shared/receipts/handlers/ (create, findById, updateStatus).
5. Tests: backend/src/modules/_shared/receipts/tests/create.test.ts (Idempotenz).
6. Import-Anleitung: Reihenfolge der n8n-Workflow-Imports (WF-M01 zuerst, dann WF-M02, WF-M07, dann WF-MASTER).
7. Smoke-Test-Anleitung: manueller Trigger mit Dummy-Input, was in n8n zu prüfen ist.
8. Decisions.
```

### Was du nach diesem Prompt machst

1. Neue Backend-Endpoints anlegen, `npm test -- receipts` → grün.
2. Alle Sub-Workflows (WF-M01, WF-M02, WF-M07) in n8n importieren.
3. Dann WF-MASTER-RECEIPT + WF-ERROR-HANDLER importieren.
4. Smoke-Test: WF-MASTER-RECEIPT manuell triggern mit Dummy-Receipt-ID.
   - Erwartet: Receipt angelegt (status=received), RoutePlan holt [M01, M02, M07].
   - M01 wird aufgerufen (OCR läuft).
   - Nach M01: M02 und M07 werden aufgerufen.
   - Final-Status in DB: 'exported'.
5. Bei Fehler: WF-ERROR-HANDLER triggert → Operator-Alert-Endpoint geloggt.

---

## Schritt 6 — Web-App: Onboarding (intern, parallel zu Schritt 3–5)

**Wann:** Tag 10–13 (parallel zu M02/M07).
**Voraussetzung:** D5 Customer-Profile-API grün.
**Scope:** Intern bedienbar (kein Kunden-Login in Phase 1). Zweck: Neuen Kunden onboarden.

### Prompt (copy-paste)

```
ROLLE
Frontend-/Fullstack-Engineer in ProzessPilot.
Du baust eine minimale interne Onboarding-Webapp — nur für Operator-Nutzung in Phase 1.
Kein Customer-Self-Service. Kein komplexes Auth-System.

KONTEXT (Pflicht-Lesen)
1. /Konzeptentwicklung/02_Kundenprofil_System.md (vollständig — Profil-Struktur, CRUD-API)
2. /Konzeptentwicklung/00_Architektur_Hauptdokument.md §4 (Technologie-Entscheidungen)
3. /Konzeptentwicklung/Foundation_Spec.md §D5 (Customer-Profile-API Endpoints)

AUFGABE
Generiere eine minimal-funktionale Onboarding-Webapp.

TECH-STACK
- Next.js 14 (App Router, TypeScript strict)
- Tailwind CSS (kein weiteres UI-Framework nötig)
- React Hook Form + Zod für Formulare
- fetch() direkt gegen Backend-API (kein zusätzlicher API-Layer)
- Deployment: docker compose (next-dev-Server in compose.yml hinzufügen)

VERZEICHNIS: webapp/ im Repo-Root.

FEATURES (nur diese, keine Extras)

1. Seite: /customers/new — Neuen Kunden anlegen
   - Formular: company_name, billing_email, package (Basic/Standard/Pro)
   - POST /api/v1/customers → zeigt Erfolg mit customer_id

2. Seite: /customers/:id/profile — Profil konfigurieren
   GET /api/v1/customers/:id/profile → Formular vorauffüllen
   Felder:
     - Grunddaten: package, timezone, locale, currency
     - WhatsApp: phone_number_id, allowed_senders (dynamische Liste)
     - Archivierung: provider (Google Drive / Dropbox), folder_id / root_path
     - Spreadsheet: provider (Google Sheets), sheet_id, tab_name_template
   PUT /api/v1/customers/:id/profile → speichern + Success-Toast

3. Seite: /customers/:id/credentials — Credentials hinterlegen
   POST /api/v1/customers/:id/credentials
   Felder: kind (Dropdown: wa_access_token, drive_oauth, sheets_oauth), value (Passwort-Input), meta (JSON-Textarea)
   Nach Submit: zeigt { credential_id, has_value: true } — KEIN Klartext.

4. Seite: /customers — Kundenliste
   Zeigt alle Kunden (GET /api/v1/customers — neuen Listing-Endpoint im Backend anlegen).
   Spalten: customer_id, company_name, package, created_at, Link zu Profil.

VERBINDLICHE REGELN
- Kein User-Auth in Phase 1 (intern, hinter VPN/Firewall). Basic Auth via nginx ausreichend.
- Backend-URL über ENV-Variable NEXT_PUBLIC_BACKEND_URL.
- HMAC-Signing für Backend-Calls: Client-seitig nicht möglich (Secret darf nicht im Browser sein).
  Lösung: Next.js API-Route als Proxy (webapp/app/api/proxy/route.ts) — nimmt alle Calls entgegen,
  fügt HMAC-Header hinzu (Secret aus Server-ENV PP_HMAC_SECRET), leitet weiter.
  Alle Client-Calls gehen an /api/proxy/* (gleiche URL-Struktur).
- Fehler-Handling: Alle API-Fehler als Toast anzeigen (react-hot-toast oder einfache State-Lösung).
- Mobile-freundlich ist nice-to-have, kein Hard-Requirement.

NEUER BACKEND-ENDPOINT: GET /api/v1/customers (Listing)
  Füge in backend/src/modules/_foundation/customer-profiles/routes.ts hinzu:
  GET /api/v1/customers → Gibt [{ customer_id, company_name, package, created_at }] zurück.
  Keine Pagination nötig (Phase 1: < 10 Kunden).
  RLS: Operator sieht alle (X-Customer-ID: 'operator' umgeht RLS wenn PP_OPERATOR_BYPASS=1).

DOCKER-COMPOSE-PATCH
webapp-Service in docker-compose.yml hinzufügen:
  build context: ./webapp, Dockerfile: Dockerfile.dev (npm run dev), Port 3001.

OUTPUT
1. Datei-Baum: alle webapp/**-Dateien.
2. Vollständiger Code (Seiten, Proxy-Route, Layout, Typen).
3. docker-compose.yml-Patch.
4. Backend-Patch: GET /api/v1/customers.
5. Setup-Anleitung: webapp starten, ersten Kunden onboarden (Schritt-für-Schritt).
6. Decisions.
```

### Was du nach diesem Prompt machst

1. webapp/ anlegen, `npm install`, `npm run dev` → Port 3001 erreichbar.
2. `docker compose up -d` → webapp-Container startet.
3. Onboarding-Flow komplett durchspielen:
   - Neuen Kunden anlegen (`/customers/new`).
   - Profil konfigurieren (`/customers/:id/profile`): WhatsApp-Nummer, Google-Drive-Folder.
   - Credentials hinterlegen (`/customers/:id/credentials`): wa_access_token, drive_oauth.
4. Prüfen: Profil in DB per `psql`, Cache in Redis per `redis-cli`.

---

## Schritt 7 — E2E-Test: MVP Definition of Done

**Wann:** Tag 16–17 (nach allem anderen grün).
**Voraussetzung:** Schritte 1–6 grün. Echter WhatsApp-Account verfügbar.

### Prompt (copy-paste)

```
ROLLE
QA-Engineer + Backend-Engineer in ProzessPilot.
Du schreibst einen vollautomatischen E2E-Test, der die gesamte MVP-Pipeline
von WhatsApp-Eingang bis Google-Sheets-Export abdeckt.

KONTEXT (Pflicht-Lesen)
1. /Konzeptentwicklung/05_Roadmap.md §3.2 (MVP Definition of Done)
2. /Konzeptentwicklung/modules/M10_WhatsApp_Eingang.md §13.3 (E2E)
3. /Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md §17
4. /Konzeptentwicklung/modules/M02_Belegarchivierung.md §16
5. /Konzeptentwicklung/modules/M07_Excel_Sheets_Export.md §14

AUFGABE
Generiere:
  a) Automatisierten E2E-Integrationstest (kein echtes WhatsApp nötig für CI)
  b) Manuelles E2E-Testprotokoll (für Abnahme mit echtem WhatsApp)

AUTOMATISIERTER E2E-TEST (backend/tests/e2e/mvp-pipeline.test.ts)
Voraussetzungen: docker compose up, alle Services laufen.
Test-Setup:
  1. Test-Customer + Profil anlegen (Basic-Paket, Google Drive, Google Sheets).
  2. Test-Credentials in DB hinterlegen (Test-Access-Tokens aus ENV).
  3. Test-Bild-Fixture aus backend/tests/fixtures/m01/fixture_01_supermarkt.json
     ins MinIO hochladen (als Object-Key cust_{id}/originals/...).

Test-Cases:

E2E-01: Voller Pipeline-Durchlauf (Happy Path)
  - POST /api/v1/receipts mit { customer_id, status: 'received', file: {...}, source: { channel: 'test' } }
  - WF-MASTER-RECEIPT manuell triggern (via n8n API: POST n8n:5678/api/v1/executions, falls n8n-API aktiviert)
    ALTERNATIV: Direkt Backend-Endpoints sequenziell aufrufen (M01 → M02 → M07) ohne n8n.
    Die Direkt-Variante ist für CI stabiler.
  - Assert nach M01: Receipt.status = 'extracted', extraction.fields.total_gross vorhanden.
  - Assert nach M02: Receipt.status = 'archived', archive.path vorhanden.
    Drive-Mock: Mock-Adapter (kein echter Drive-Call in CI) → prüfe dass adapter.upload() aufgerufen wurde.
  - Assert nach M07: Receipt.status = 'exported', exports[0].target = 'google_sheets'.
    Sheets-Mock: Mock-Adapter → prüfe dass adapter.appendRow() aufgerufen wurde.
  - Assert: audit_log enthält Einträge für received → extracted → archived → exported.
  - Assert: Redis-Stream pp:events:receipt enthält alle 4 Events.
  - Durchlauf-Zeit < 60s (Stopwatch in Test).

E2E-02: requires_review Branch
  - Beleg mit fixture_02_handschrift.json (Confidence < 0.75).
  - Assert: Receipt.status = 'requires_review' nach M01.
  - Assert: pp.receipt.requires_review Event im Stream.
  - Assert: M02 und M07 wurden NICHT aufgerufen (RoutePlan respektiert Status).

E2E-03: Duplikat-Erkennung
  - Gleichen Beleg zweimal schicken (gleicher sha256).
  - Assert: nur 1 Receipt-Eintrag in DB.
  - Assert: zweiter Aufruf gibt { is_duplicate: true } zurück.

E2E-04: Operator-Alert bei OCR-Fehler
  - Beleg mit korruptem Bild (0-Byte-Datei).
  - Assert: Receipt.status = 'error'.
  - Assert: pp.system.module_error Event mit module='M01'.
  - Assert: Operator-Notification-Endpoint aufgerufen.

MANUELLES E2E-TESTPROTOKOLL (docs/e2e-manual-test.md)
Schritt-für-Schritt für Abnahme mit echtem WhatsApp:

Voraussetzung:
  - Test-Customer ongeboardet (Schritt 6).
  - WhatsApp-Business-Account verifiziert.
  - Google Drive + Sheets verbunden.
  - n8n läuft, WF-INPUT-WHATSAPP aktiv.

Test-1: Normaler Beleg
  1. Foto eines echten Belegs an Test-WhatsApp-Nummer schicken.
  2. Warten: Bestätigungsnachricht kommt zurück (< 10s).
  3. Prüfen Google Drive: PDF in korrektem Ordner (< 60s).
  4. Prüfen Google Sheets: Zeile mit Beleg-Daten (< 60s).
  5. Prüfen n8n: Execution grün, alle Nodes durchgelaufen.
  6. Prüfen Backend: `psql` → Receipt.status = 'exported', alle Felder befüllt.
  ✓ Erfüllt MVP DoD Punkt 1+2.

Test-2: Unbekannter Absender
  1. Foto von nicht-whitelisteter Nummer schicken.
  2. Warten: Hinweis-Nachricht kommt zurück.
  3. Prüfen: Kein Receipt in DB angelegt.
  ✓ Erfüllt Sicherheits-Anforderung M10 §12.

Test-3: Fehler-Szenario (schlechtes Bild)
  1. Screenshot (sehr niedriger Kontrast) schicken.
  2. Prüfen: Bestätigungsnachricht kommt zurück (System nimmt immer entgegen).
  3. Prüfen: Receipt.status = 'requires_review' in DB.
  4. Prüfen: Operator bekommt Alert (Slack/Mail).
  ✓ Erfüllt MVP DoD Punkt 4.

MVP DEFINITION OF DONE CHECKLISTE (aus Roadmap §3.2)
  [ ] Ein Test-Kunde ongeboardet (Profil, Drive, WhatsApp-Nummer).
  [ ] Belegfoto → PDF in Drive < 60s.
  [ ] Belegfoto → Zeile in Google Sheet < 60s.
  [ ] Bestätigungsnachricht zurück < 10s.
  [ ] OCR-Fehler → Operator-Alert (Slack/Mail).
  [ ] Audit-Log für alle Statuswechsel vorhanden.

OUTPUT
1. backend/tests/e2e/mvp-pipeline.test.ts (vollständig, lauffähig).
2. docs/e2e-manual-test.md (Testprotokoll zum Ausdrucken).
3. backend/tests/e2e/helpers/ (Test-Setup-Utilities: createTestCustomer, seedReceipt, etc.).
4. Verifikations-Block: alle 6 MVP-DoD-Punkte aus Roadmap §3.2.
5. Decisions.
```

### Was du nach diesem Prompt machst

1. `npm test -- e2e` → alle 4 automatisierten Tests grün.
2. Manuelles Testprotokoll ausdrucken / als Checkliste ablegen.
3. Echten E2E-Test mit WhatsApp durchführen (siehe Protokoll oben).
4. Alle 6 MVP-DoD-Punkte abhaken.
5. `git tag -a v0.1.0-mvp -m "MVP Basic fertig"` — Sprint 1 abgeschlossen.

---

## Parallele Arbeit: Was der Engineer (kein Claude Code) übernimmt

Während Claude Code die Module generiert, macht der Engineer parallel:

| Aufgabe                                         | Zeitfenster       | Blocking für               |
|-------------------------------------------------|-------------------|----------------------------|
| Google Cloud Vision API aktivieren + Key-File   | Tag 1             | M01 (Schritt 2)            |
| Meta WhatsApp Business API — Webhook-URL setzen | Tag 1–2           | M10 E2E-Test               |
| Google Drive OAuth-App anlegen + Test-Token     | Tag 3             | M02 (Schritt 3)            |
| Google Sheets Test-Spreadsheet anlegen          | Tag 3             | M07 (Schritt 4)            |
| n8n: WF-M01/M02/M07 importieren + testen        | Tag 10 (parallel) | WF-MASTER (Schritt 5)      |
| Erstes Kunden-Onboarding via Web-App            | Tag 14            | E2E-Test (Schritt 7)       |

---

## Kritische ENV-Variablen für Sprint 1

Ergänzung zu `.env.example` nach allen Schritten:

```
# M10 WhatsApp
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_GRAPH_API_VERSION=v19.0
STORAGE_RAW_BUCKET=prozesspilot-raw

# M01 OCR + Claude
GOOGLE_VISION_KEY_FILE=/secrets/gcp-vision.json
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-6
OCR_TIMEOUT_MS=15000

# M02 Archivierung
DRIVE_FOLDER_CACHE_TTL_SEC=3600

# Web-App
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

# n8n
N8N_WEBHOOK_URL=https://<deine-domain>/webhook
```

---

## Decisions-Log Sprint 1

| Schritt  | Decision-ID | Entscheidung | Begründung |
|----------|-------------|--------------|------------|
| M10      | M10.1       |              |            |
| M10      | M10.2       |              |            |
| M01      | M01.1       |              |            |
| M01      | M01.2       |              |            |
| M02      | M02.1       |              |            |
| M02      | M02.2       |              |            |
| M07      | M07.1       |              |            |
| M07      | M07.2       |              |            |
| WF-MASTER| WF1.1       |              |            |
| WebApp   | WA1.1       |              |            |

Am Ende von Sprint 1: Decisions in die jeweiligen Modul-Specs zurückspielen (§"Implementation Notes").

---

## Sprint-1 DoD-Check (finaler Gate)

Vor Abschluss Sprint 1 alle Punkte grün:

- [ ] `docker compose up -d` → alle 5 Services healthy (Postgres, Redis, MinIO, n8n, Backend, Webapp).
- [ ] `npm run migrate` → alle 4 Migrations angewandt.
- [ ] `npm test` → > 85% Coverage, 0 Fehler.
- [ ] `npm test -- e2e` → alle 4 automatisierten E2E-Tests grün.
- [ ] Manueller E2E-Test mit echtem WhatsApp: alle 6 MVP-DoD-Punkte.
- [ ] Web-App: Kompletter Onboarding-Flow (Customer anlegen, Profil, Credentials).
- [ ] n8n: WF-INPUT-WHATSAPP, WF-M01, WF-M02, WF-M07, WF-MASTER, WF-ERROR-HANDLER alle aktiv.
- [ ] `git tag v0.1.0-mvp`

**Wenn alles grün: Sprint 1 abgeschlossen. M03 (Standard) kann starten.**
