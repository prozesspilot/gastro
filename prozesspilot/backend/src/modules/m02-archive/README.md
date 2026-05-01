# M02 — Belegarchivierung (GoBD)

Sub-Workflow `WF-M02` in n8n + Backend-Modul `m02-archive`. Legt jeden
verarbeiteten Beleg in der vom Kunden gewählten Cloud-Ablage (Google Drive,
optional Dropbox) GoBD-konform ab. ProzessPilot **ersetzt nicht** das
Speichersystem des Kunden, sondern schreibt nur in dessen bestehende Struktur.

## Endpoint

`POST /api/v1/receipts/:receipt_id/archive`

- Input: `{ customer_profile, trace_id }` (Body) +
  Standard-Header (`X-Customer-ID`, `Idempotency-Key`, `X-PP-Signature`,
  `X-Trace-ID`).
- Akzeptierte Eingangsstatus: `extracted`, `categorized`.
- Output: `{ ok, data: { receipt, receipt_patch, events_to_emit } }`.

Logik exakt nach M02 §7.1 Pseudocode:

1. Receipt laden + Status prüfen (`assertStatus`).
2. Hook `before_archive`.
3. Original aus MinIO laden, ggf. Bild → PDF (M02 §10).
4. Kollisionscheck (Counter `_001`, `_002`, … bis 50).
5. Upload via `archiveStorageAdapterFactory`.
6. Receipt patchen (`status='archived'`, `archive.{path,external_id,…}`).
7. Hook `after_archive`.
8. Persist + `audit_log` + `pp.receipt.archived`.

## Code-Struktur

```
backend/src/modules/m02-archive/
├── routes.ts
├── handlers/
│   └── archive.handler.ts        # 8-Schritt-Pipeline (M02 §7.1)
├── services/
│   ├── path-template.ts          # Re-Export aus core/templates
│   ├── filename-sanitizer.ts     # Re-Export aus core/templates
│   ├── collision-resolver.ts     # appendCounter(filename, n) → '_001'..'_050'
│   ├── audit.service.ts          # Wrapper für audit_log
│   └── event-emitter.ts          # pp:events:receipt
├── schemas/
│   └── archive.input.ts          # Zod-Schema für Body
├── tests/
│   ├── archive.handler.test.ts   # 7 Tests (happy/Status/Mime/Kollision/Refresh/…)
│   ├── path-template.test.ts     # 10 Tests
│   └── image-to-pdf.test.ts      # 2 Tests
└── README.md
```

Wiederverwendbare Bausteine liegen unter `core/`:

- `core/adapters/archive-storage/` — Drive/Dropbox-Adapter + Factory.
- `core/templates/path-template.ts` — Mustache-Renderer + Sanitizer.
- `core/pdf/image-to-pdf.ts` — Bild → PDF Konvertierung.

## Storage-Adapter

`ArchiveStorageAdapter` ist **nicht** identisch mit dem MinIO-StorageAdapter
aus D8: D8 ist der ProzessPilot-eigene Object-Store für Originale; dieses
Interface ist die Cloud-Ablage des Kunden.

```ts
interface ArchiveStorageAdapter {
  exists(path, customerId): Promise<boolean>;
  upload({ customerId, path, bytes, mime, metadata }): Promise<{ path, external_id, url? }>;
  delete(externalId, customerId): Promise<void>;
  download(externalId, customerId): Promise<Buffer>;
}
```

### Google Drive (`google_drive`)

- OAuth2 Refresh-Token (verschlüsselt in `customer_credentials` mit
  `kind = 'drive_oauth'`).
- Token-Refresh: Bei 401 wird ein `refreshAccessToken()`-Roundtrip gemacht;
  der frische Access-Token wird in `customer_credentials` zurückgeschrieben
  und der ursprüngliche Call retried.
- Folder-Hierarchie wird on-demand angelegt (`mkdir -p`-Verhalten).
- Folder-Cache: Redis-Key `cust:{id}:drive:folder:{path_hash}` mit TTL
  aus `DRIVE_FOLDER_CACHE_TTL_SEC` (Default 3600 s) + Per-Process-LRU.
- Upload: Multipart < 5 MB, Resumable Upload Session ≥ 5 MB.
- `exists()`: `files.list` mit `name + parents`-Query.
- Datei-Metadata: `appProperties { receipt_id, sha256, pp_version: '1' }`.

### Dropbox (`dropbox`)

Stub. Phase 2. Alle Methoden werfen `DROPBOX_NOT_IMPLEMENTED`. Interface
korrekt typisiert, damit `factory.for('dropbox')` kompiliert.

### WebDAV (`webdav`)

Phase 3. Factory wirft `WEBDAV_NOT_IMPLEMENTED`.

## Pfad- und Filename-Templates

Templates kommen aus `customer_profile.integrations.archive.config`:

```jsonc
{
  "structure": "{year}/{month_de}/{category_label}/",
  "filename_template": "{document_date}_{supplier_name}_{document_number}_{total_gross}EUR.pdf",
  "naming_collisions": "append_counter"
}
```

Variablen siehe M02 §9.1. Sanitizer (M02 §9.3):

- `/`, `\`, `..` werden entfernt.
- Nicht-ASCII-Transliteration: `ä→ae`, `ö→oe`, `ü→ue`, `Ä→Ae`, `Ö→Oe`,
  `Ü→Ue`, `ß→ss`. Restliche Diakritika werden via NFD entfernt.
- Max. 200 Zeichen.
- Leere/fehlende Variable → `unbekannt`.

`{supplier_name}` wird "loose" gesäubert (Sonderzeichen → `_`),
`{supplier_safe}` strict (nur `[A-Za-z0-9_]`).

## Image-to-PDF

`core/pdf/image-to-pdf.ts` nimmt einen Buffer + MIME-Typ und gibt einen
PDF-Buffer zurück. Schritte:

1. `sharp().rotate()` (EXIF-orientation respektieren).
2. `resize({width:2400, height:2400, fit:'inside'})`.
3. `jpeg({quality: 88})`.
4. `pdf-lib.PDFDocument.create({updateMetadata: false})`.
5. `embedJpg` + `addPage` + `drawImage`.
6. `setProducer('ProzessPilot') + setCreationDate(new Date())`.

Wichtig: `updateMetadata: false` ist Pflicht — sonst überschreibt pdf-lib
den Producer beim Save mit `pdf-lib (...)`.

`isPdf(mime)` ist die Vorfilter-Funktion; nur Bilder gehen durch
`imageToPdf`.

## n8n-Workflow `WF-M02`

`n8n/workflows/WF-M02.json` — 6 Nodes nach M02 §6:

```
Trigger → Function: assert_status → Backend: Archive → IF: ok → Build: Result/Error → Respond
```

- `Function: assert_status` validiert `receipt.status ∈ {extracted,
  categorized}`, generiert Trace-ID + Idempotency-Key, baut die
  HMAC-Signatur (gleicher Algorithmus wie WF-M01).
- `Backend: Archive` ruft `POST /api/v1/receipts/{id}/archive` mit
  3× Retry bei 5xx (n8n built-in: `waitBetweenRetries: 5000`).

## Acceptance Criteria → Test-Mapping

| #   | M02 §16 Acceptance Criterion                                  | Test / Datei                                                                                          |
|-----|---------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| AC1 | Datei landet im richtigen Ordner laut Profil-Template         | `archive.handler.test.ts` Test 1 → `archive.path === '2026/April/Wareneinkauf/...'`                   |
| AC2 | Filename ist deterministisch und kollisionsfrei               | `archive.handler.test.ts` Test 5 (Kollision `_003`) + `path-template.test.ts` Filename-Render-Test    |
| AC3 | PDF-Metadata enthält `receipt_id`, `sha256`                   | `archive.handler.test.ts` Test 1 (`upload.metadata.receipt_id` + `sha256`); `image-to-pdf.test.ts`    |
| AC4 | Bei Token-Ablauf wird automatisch refreshed                   | `archive.handler.test.ts` Test 4 (Drive 401 → Refresh → Retry)                                        |
| AC5 | Hooks werden aufgerufen                                       | Handler ruft `hookRunner.run('before_archive')` + `hookRunner.run('after_archive')` (Stub gibt receipt unverändert zurück; Test 1 verifiziert E2E). |
| AC6 | Storage-Adapter austauschbar (Dropbox-Mock-Test passt)        | `archive.handler.test.ts` "Adapter-Austauschbarkeit" → `DropboxAdapter` Stub-Tests + Mock-Factory-DI im Happy-Path |
| AC7 | Originalbild bleibt zusätzlich in MinIO erhalten              | Handler ruft `downloadObject(s3, …)` zum LESEN und löscht das Original NICHT — implizit verifiziert in Test 1 (kein DELETE auf S3). |
| AC8 | Audit-Log-Eintrag mit `path` und `external_id`                | `archive.handler.test.ts` Test 1 (`audits` enthält `pp.receipt.archived` mit `path` + `external_id`). |

## Decisions

- **Adapter-Pfad**: `core/adapters/archive-storage/` statt `core/adapters/storage/`
  (M02 §8 schlägt Letzteres vor). Begründung: D8 belegt bereits
  `core/storage/` für MinIO; eine zweite `storage/`-Schiene wäre verwirrend.
  Das Modul-Design bleibt 1:1 das aus der Spec.
- **Status-Code für Status-Mismatch**: Spec sagt nicht explizit welche
  HTTP-Klasse. M01 nutzt 409 CONFLICT, der Aufgabentext fordert für M02
  jedoch 422 INVALID_STATUS. M02 folgt dem Aufgabentext.
- **`updateMetadata: false`** auf `PDFDocument.create()` — pdf-lib v1.17.1
  überschreibt sonst den Producer beim Save mit `pdf-lib (...)`. Die Option
  liegt am Constructor, NICHT an `save()`.
- **Retry-Steuerung in WF-M02**: n8n `waitBetweenRetries` ist fixe
  Wartezeit. Spec fordert exponential 5s/30s/3min — das wäre nur mit
  Custom-Code-Node oder externem Retry-Manager machbar. WF-M02 nutzt
  konsistent zur M01 5s-Fix-Backoff (Konsistenz > Mikro-Optimierung).
- **Audit/Event-Emitter** sind Modul-lokale Wrapper analog zu M01 — bis
  ein zentraler `auditService` aus Phase 2 verfügbar ist.
- **Hook-System**: Aktuell Stub (`hookRunner.run` gibt Receipt unverändert
  zurück). M02-Handler ruft `before_archive` + `after_archive` an den von
  04 §3.1 definierten Stellen — der eigentliche Hook-Code kommt mit Phase 2.
- **Kein neues DB-Migration**: M02 schreibt nur in `receipts.payload.archive`
  (JSONB, bereits in `0010_m10_minimal.sql` vorhanden).

## ENV-Variablen (M02-spezifisch)

| Variable                       | Default | Zweck                                            |
|--------------------------------|---------|--------------------------------------------------|
| `DRIVE_FOLDER_CACHE_TTL_SEC`   | `3600`  | TTL des Folder-ID-Caches in Redis (Sekunden)     |

OAuth-Tokens für Google Drive werden pro Customer in
`customer_credentials` (`kind = 'drive_oauth'`) gespeichert,
verschlüsselt mit `PP_PGCRYPTO_KEY`.

## Manuelles Smoke-Testing

```bash
# 1) Drive-OAuth-Token für Test-Customer hinterlegen
curl -X POST $BACKEND_URL/api/v1/customers/cust_test/credentials \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "X-Customer-ID: cust_test" \
  -H "X-PP-Signature: <sig>" \
  -d '{"kind":"drive_oauth","value":"{\"access_token\":\"...\",\"refresh_token\":\"...\"}","meta":{"root_folder_id":"<DriveFolderId>"}}'

# 2) Archive-Aufruf
curl -X POST $BACKEND_URL/api/v1/receipts/01HVZ8X4M3R9K7N2P6T1Q5Y8B4/archive \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "X-Customer-ID: cust_test" \
  -H "X-PP-Signature: <sig>" \
  -d '{"customer_profile":{...},"trace_id":"trc_smoke"}'
```
