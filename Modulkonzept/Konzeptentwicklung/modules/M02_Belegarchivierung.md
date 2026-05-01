# M02 — Belegarchivierung (GoBD)

> **Paket:** Basic, Standard, Pro
> **Phase:** 1 (MVP)
> **Verantwortlich:** GoBD-konforme Ablage in Kunden-Cloud
> **Spec-Version:** 1.0

---

## 1. Zweck

M02 legt jeden verarbeiteten Beleg in der vom Kunden gewählten Cloud (Google Drive, Dropbox, ggf. WebDAV) GoBD-konform ab — strukturiert nach Jahr/Monat/Kategorie, mit eindeutigem Dateinamen und unveränderlichem Audit-Pfad.

ProzessPilot **ersetzt nicht** das Speichersystem des Kunden — es schreibt nur in dessen bestehende Struktur.

---

## 2. Verantwortlichkeit

- Lesen der Original-Datei aus MinIO.
- Konvertierung Bild → PDF (für GoBD-Pflicht).
- Berechnen des Zielpfads aus Profil-Template + Receipt-Daten.
- Upload via Storage-Adapter.
- Eintrag in `receipts.payload.archive`.
- Hook-Calls `before_archive`, `after_archive`.
- Sicherstellen: keine Überschreibung — bei Kollision Counter-Suffix.

M02 ist **nicht** verantwortlich für:

- OCR/Extraktion (M01).
- Buchhaltungs-Push (M04–M07).

---

## 3. Trigger

- Sub-Workflow-Aufruf aus `WF-MASTER-RECEIPT`.
- Akzeptierte Eingangsstatus: `extracted`, `categorized`.

---

## 4. Abhängigkeiten

| Abhängigkeit                  | Genutzt für                          |
|-------------------------------|--------------------------------------|
| Google Drive API              | Phase 1 Standard                     |
| Dropbox API                   | Optional ab Standard                 |
| MinIO                         | Original-Datei lesen                 |
| `pdf-lib` / `sharp`           | Bild → PDF Konvertierung             |
| Storage-Adapter (Backend)     | Provider-agnostischer Upload         |

---

## 5. Input / Output

### 5.1 Input

```json
{
  "trace_id": "trc_a8f3d2c1",
  "idempotency_key": "ik_M02_01HVZ8X4...",
  "receipt": { "...": "..." },
  "customer_profile": { "...": "..." }
}
```

### 5.2 Output

```json
{
  "ok": true,
  "module": "M02",
  "receipt_patch": {
    "status": "archived",
    "archive": {
      "status": "stored",
      "target": "google_drive",
      "path": "/ProzessPilot/Pizzeria Bella Italia/2026/04/Wareneinkauf/2026-04-28_PizzeriaBellaItalia_RE-2026-1042_142.85EUR.pdf",
      "external_id": "1aB2cD3eF4gH5iJ6kL7mN8oP9qR",
      "stored_at": "2026-04-29T08:14:48Z",
      "checksum_sha256": "f3b8a..."
    }
  },
  "events_to_emit": ["pp.receipt.archived"]
}
```

---

## 6. n8n-Workflow `WF-M02`

| #  | Node-Typ           | Name                              |
|----|--------------------|-----------------------------------|
| 1  | Execute Workflow   | `Trigger`                         |
| 2  | Code (JS)          | `Function: assert_status`         |
| 3  | HTTP Request       | `Backend: Archive`                |
| 4  | IF                 | `IF: ok`                          |
| 5  | Set                | `Build: Result`                   |
| 6  | Respond to Workflow| `Respond`                         |

Endpoint: `POST /api/v1/receipts/{receipt_id}/archive`.

---

## 7. Backend-API

### 7.1 `POST /api/v1/receipts/{receipt_id}/archive`

**Backend-Logik (Pseudocode)**:

```ts
async function archiveReceipt(receiptId: string, profile: CustomerProfile) {
  let receipt = await receiptRepo.findById(receiptId, profile.customer_id);
  assertStatus(receipt, ['extracted', 'categorized']);

  const archiveCfg = profile.integrations.archive;            // provider, config, credentials_ref
  const adapter = storageAdapterFactory.for(archiveCfg.provider);

  // 1. Path bauen
  let targetPath = renderPathTemplate(archiveCfg.config.structure, receipt);
  const filename = renderFilename(archiveCfg.config.filename_template, receipt);

  // 2. Hook before_archive
  receipt = await hookRunner.run('before_archive', { receipt, profile, targetPath, filename });

  // 3. Datei holen (Original) → ggf. zu PDF konvertieren
  const original = await storage.download(receipt.file.object_key);
  const pdfBytes = isPdf(receipt.file.mime_type)
    ? original
    : await pdfConverter.imageToPdf(original, receipt.file.mime_type);

  // 4. Kollisionscheck
  let attempt = 0;
  let finalName = filename;
  while (await adapter.exists(`${targetPath}/${finalName}`, profile.customer_id)) {
    attempt++;
    finalName = appendCounter(filename, attempt);                  // _001, _002, ...
    if (attempt > 50) throw new Error('TOO_MANY_COLLISIONS');
  }

  // 5. Upload
  const result = await adapter.upload({
    customerId: profile.customer_id,
    path: `${targetPath}/${finalName}`,
    bytes: pdfBytes,
    mime: 'application/pdf',
    metadata: {
      receipt_id: receipt.receipt_id,
      sha256: receipt.file.sha256,
      document_date: receipt.extraction.fields.document_date,
    },
  });

  // 6. Receipt patchen
  receipt = mergeArchive(receipt, {
    status: 'stored',
    target: archiveCfg.provider,
    path: result.path,
    external_id: result.external_id,
    stored_at: new Date().toISOString(),
    checksum_sha256: sha256(pdfBytes),
  });
  receipt.status = 'archived';

  // 7. Hook after_archive
  receipt = await hookRunner.run('after_archive', { receipt, profile });

  // 8. Persist + Event
  const saved = await receiptRepo.update(receipt);
  await audit.log(saved, 'archived', { path: result.path });
  await events.emit('pp.receipt.archived', saved);

  return saved;
}
```

---

## 8. Storage-Adapter

```
backend/src/core/adapters/storage/
├── adapter.interface.ts
├── google-drive.adapter.ts
├── dropbox.adapter.ts
├── webdav.adapter.ts            # Phase 3
└── factory.ts
```

### 8.1 Interface

```ts
export interface StorageAdapter {
  readonly id: 'google_drive' | 'dropbox' | 'webdav';
  exists(path: string, customerId: string): Promise<boolean>;
  upload(input: UploadInput): Promise<UploadResult>;
  delete(externalId: string, customerId: string): Promise<void>;   // GoBD-Vorsicht!
  download(externalId: string, customerId: string): Promise<Buffer>;
}
```

### 8.2 Google Drive

- OAuth2 Refresh-Token (im `customer_credentials` verschlüsselt).
- Folder-Hierarchie wird **on-demand** angelegt (`drives.list` → `files.create kind=folder` falls fehlt).
- Datei-Upload via Resumable Upload (für >5 MB PDFs).
- Folder-Cache: Backend cached `path → folder_id` Mapping pro Kunde (Redis, 1h TTL).

### 8.3 Dropbox

- OAuth2 + Refresh-Token.
- `files/upload`-API für direkten Upload, `files/upload_session` für >150 MB.
- Pfad-System ist string-basiert, kein Folder-Cache nötig.

---

## 9. Pfad- und Filename-Templates

Templates liegen im Profil (`integrations.archive.config`):

```json
{
  "structure": "{year}/{month_de}/{category_label}/",
  "filename_template": "{document_date}_{supplier_name}_{document_number}_{total_gross}EUR.pdf",
  "naming_collisions": "append_counter"
}
```

### 9.1 Verfügbare Variablen

| Variable               | Quelle                                                | Beispiel                     |
|------------------------|-------------------------------------------------------|------------------------------|
| `{year}`               | `extraction.fields.document_date`                     | `2026`                       |
| `{month}`              | dito (zweistellig)                                     | `04`                         |
| `{month_de}`           | Deutsch ("April")                                      | `April`                      |
| `{document_date}`      | ISO `YYYY-MM-DD`                                       | `2026-04-28`                 |
| `{supplier_name}`      | normalisiert (Sonderzeichen → `_`)                     | `PizzeriaBellaItalia`        |
| `{supplier_safe}`      | extra strict (nur a-zA-Z0-9_)                          | `PizzeriaBellaItalia`        |
| `{document_number}`    | aus Extraktion                                         | `RE-2026-1042`               |
| `{total_gross}`        | mit `.` als Dezimal                                    | `142.85`                     |
| `{category_label}`     | aus M03 (falls bereits ausgeführt)                     | `Wareneinkauf`               |
| `{category_id}`        | technischer Slug                                       | `wareneinkauf_food`          |
| `{customer_name}`      | aus Profil                                             | `Pizzeria Bella Italia`      |
| `{receipt_id}`         | ULID                                                   | `01HVZ8X4M3R...`             |

### 9.2 Template-Engine

Einfacher Mustache-Stil, kein Logik-Code. Backend hat eine kleine, geprüfte Implementation (`backend/src/core/templates/path-template.ts`). Variablen ohne Wert → `unbekannt`.

### 9.3 Path-Sanitizing

- `/`, `\`, `..` werden entfernt.
- Nicht-ASCII → ASCII-Transliteration (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`).
- Max. Filename-Länge 200 Zeichen (Truncate Supplier-Namen).

---

## 10. Bild → PDF Konvertierung

```ts
// backend/src/core/pdf/image-to-pdf.ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

export async function imageToPdf(bytes: Buffer, mime: string): Promise<Buffer> {
  // Bild ggf. rotieren (EXIF), max. 2400x2400 verkleinern, in JPEG re-encodieren
  const normalized = await sharp(bytes)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  const pdf = await PDFDocument.create();
  const img = await pdf.embedJpg(normalized);
  const { width, height } = img.scale(1);
  const page = pdf.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });

  // Metadata für GoBD-Nachvollziehbarkeit
  pdf.setProducer('ProzessPilot');
  pdf.setCreationDate(new Date());

  return Buffer.from(await pdf.save());
}
```

---

## 11. GoBD-Anforderungen

- **Unveränderbarkeit:** PDF wird mit `prevent_modify`-Metadata erstellt; Original bleibt zusätzlich in MinIO (10 Jahre Aufbewahrung).
- **Vollständigkeit:** Receipt-ID + sha256 als Metadata in der Datei eingebettet.
- **Nachvollziehbarkeit:** `audit_log` enthält pro Beleg den Storage-Path + external_id + stored_at.
- **Schnelle Auffindbarkeit:** Verzeichnisstruktur (Jahr/Monat/Kategorie) + Web-App-Suche über `receipts.payload`.
- **Keine Hard-Deletes** durch System: `adapter.delete` ist nur via Operator-Endpoint und mit Audit-Eintrag möglich.

---

## 12. Datenstruktur

Keine zusätzliche Tabelle; nur Schreiben in `receipts.payload.archive` (siehe `01_Datenmodell_Events.md` §2.1).

---

## 13. Events

| Event                | Wann                              |
|----------------------|-----------------------------------|
| `pp.receipt.archived`| Nach erfolgreicher Ablage         |

---

## 14. Fehlerbehandlung

| Fehler                                  | Klasse        | Handling                                          |
|-----------------------------------------|---------------|---------------------------------------------------|
| Drive/Dropbox 5xx / Timeout             | Recoverable   | Retry 3× exponential                              |
| Auth-Token abgelaufen                   | Recoverable   | Token-Refresh-Flow, dann Retry                    |
| Token nicht refreshable (User has revoked) | Fatal      | Status `error`, Operator-Alert, Customer-Mail     |
| Quota-Limit überschritten               | Fatal         | Status `error`, Operator-Alert                    |
| Path-Collision > 50× counter            | Fatal         | Status `error`, Filename-Pattern prüfen           |
| Mime-Konvertierung fehlgeschlagen       | Recoverable   | Original direkt hochladen (mit `.original.<ext>`) |

---

## 15. Code-Struktur

```
backend/src/modules/m02-archive/
├── routes.ts
├── handlers/
│   └── archive.handler.ts
├── services/
│   ├── path-template.ts
│   ├── filename-sanitizer.ts
│   └── collision-resolver.ts
├── tests/
└── README.md
```

---

## 16. Acceptance Criteria

- [ ] Datei landet im richtigen Ordner laut Profil-Template.
- [ ] Filename ist deterministisch und kollisionsfrei.
- [ ] PDF-Metadata enthält `receipt_id`, `sha256`.
- [ ] Bei Token-Ablauf wird automatisch refreshed.
- [ ] Hooks werden aufgerufen.
- [ ] Storage-Adapter austauschbar (Dropbox-Mock-Test passt).
- [ ] Originalbild bleibt zusätzlich in MinIO erhalten.
- [ ] Audit-Log-Eintrag mit `path` und `external_id`.
