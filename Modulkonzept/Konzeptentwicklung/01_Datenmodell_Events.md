# 01 — Datenmodell & Event-System

> Dieses Dokument definiert die einheitlichen Datenformate und Events, mit denen alle Module kommunizieren.
> Verbindlich für jede Modul-Implementierung. Keine Abweichung ohne Architektur-Entscheidung.

---

## 1. Naming-Konventionen

| Bereich                     | Konvention                            | Beispiel                                |
|-----------------------------|---------------------------------------|-----------------------------------------|
| JSON-Felder                 | `snake_case`                          | `receipt_id`, `total_amount`            |
| TypeScript / Code           | `camelCase`                           | `receiptId`, `totalAmount`              |
| Datenbanktabellen           | `snake_case`, Plural                  | `receipts`, `customer_profiles`         |
| n8n Workflow-Namen          | `WF-<Domain>-<Variant>`               | `WF-MASTER-RECEIPT`, `WF-M03`           |
| n8n Node-Namen              | `<Verb>: <Was>`                       | `Fetch: Customer Profile`               |
| Events                      | `pp.<entity>.<verb_past>`             | `pp.receipt.extracted`                  |
| API-Endpoints               | `/api/v1/<resource>` REST             | `/api/v1/receipts/{id}`                 |
| Modul-Kürzel                | `M01..M10`                            | M03 = Kategorisierung                   |
| Idempotenz-Header           | `Idempotency-Key`                     | UUID pro Operation                      |

---

## 2. Das `Receipt`-Objekt (zentrales Datenformat)

Jeder Beleg wird im System durch ein `Receipt`-JSON repräsentiert. Es wandert durch alle Module, wird stufenweise angereichert und ist am Ende der Pipeline der vollständige Datensatz für Export, Reporting und Archiv.

### 2.1 JSON Schema (vollständig)

```json
{
  "receipt_id": "01HVZ8X4M3R9K7N2P6T1Q5Y8B4",
  "customer_id": "cust_a3f4b2",
  "schema_version": "1.0",
  "status": "extracted",
  "created_at": "2026-04-29T08:14:21Z",
  "updated_at": "2026-04-29T08:14:53Z",

  "source": {
    "channel": "whatsapp",
    "received_at": "2026-04-29T08:14:18Z",
    "external_id": "wamid.HBgMNDk...",
    "sender": {
      "type": "phone",
      "value": "+4917612345678",
      "display_name": "Mario (Pizzeria Bella Italia)"
    },
    "raw_payload_ref": "s3://prozesspilot-raw/cust_a3f4b2/2026/04/wamid_HBgMNDk.json"
  },

  "file": {
    "object_key": "cust_a3f4b2/originals/2026/04/01HVZ8X4M3R9K7N2P6T1Q5Y8B4.jpg",
    "mime_type": "image/jpeg",
    "size_bytes": 482314,
    "sha256": "f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5",
    "page_count": 1
  },

  "extraction": {
    "engine": "google_vision",
    "engine_version": "v1",
    "confidence": 0.94,
    "raw_text": "PIZZERIA BELLA ITALIA\nMusterstr. 12\n80331 München\n...",
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

  "categorization": {
    "engine": "claude_sonnet_4_6",
    "engine_version": "2026-04",
    "confidence": 0.91,
    "category": "wareneinkauf_food",
    "category_label": "Wareneinkauf Lebensmittel",
    "skr_account": "3100",
    "tax_key": "9",
    "cost_center": "kueche",
    "rationale": "Lieferant ist als Lebensmittel-Großhändler bekannt; Positionen 'Mehl', 'Olivenöl' sind eindeutig Wareneinsatz."
  },

  "validation": {
    "is_valid": true,
    "issues": [],
    "checks": {
      "totals_match": true,
      "tax_lines_consistent": true,
      "supplier_known": true,
      "document_date_plausible": true,
      "duplicate": false
    }
  },

  "archive": {
    "status": "stored",
    "target": "google_drive",
    "path": "/ProzessPilot/Pizzeria Bella Italia/2026/04/Wareneinkauf/2026-04-28_PizzeriaBellaItalia_RE-2026-1042_142.85EUR.pdf",
    "external_id": "1aB2cD3eF4gH5iJ6kL7mN8oP9qR",
    "stored_at": "2026-04-29T08:14:48Z"
  },

  "exports": [
    {
      "target": "lexoffice",
      "status": "pushed",
      "external_id": "voucher_99887766",
      "pushed_at": "2026-04-29T08:14:52Z"
    }
  ],

  "audit": {
    "events": [
      { "at": "2026-04-29T08:14:21Z", "type": "received",      "actor": "system" },
      { "at": "2026-04-29T08:14:34Z", "type": "extracted",     "actor": "system" },
      { "at": "2026-04-29T08:14:42Z", "type": "categorized",   "actor": "system" },
      { "at": "2026-04-29T08:14:48Z", "type": "archived",      "actor": "system" },
      { "at": "2026-04-29T08:14:52Z", "type": "exported",      "actor": "system" }
    ]
  },

  "meta": {
    "tags": [],
    "notes": null,
    "custom": {}
  }
}
```

### 2.2 Status-Lifecycle (Finite State Machine)

```
received ─► extracting ─► extracted ─► categorizing ─► categorized ─► archiving ─► archived ─► exporting ─► exported ─► completed
                │                            │                              │                       │
                ▼                            ▼                              ▼                       ▼
          requires_review              requires_review                    error                   error
                │
                ▼
          (manual fix or M09 supplier query)
                │
                ▼
            received  (re-enter pipeline)
```

Verbindlich:

- Statuswechsel sind monoton entlang der oben gezeigten Pfade.
- Ein Modul darf einen Beleg **nur** annehmen, wenn der Eingangsstatus passt (siehe Modul-Specs unter `accepts_status`).
- Jeder Statuswechsel erzeugt einen Audit-Event (siehe Abschnitt 4).
- `requires_review` ist ein "Park-Status" — Beleg verlässt die Pipeline und wartet auf Eingriff (Web-App, Lieferanten-Rückfrage).

### 2.3 Pflicht- vs. Optionalfelder pro Phase

| Status         | Pflichtfelder                                                      |
|----------------|--------------------------------------------------------------------|
| `received`     | `receipt_id`, `customer_id`, `source`, `file`                      |
| `extracted`    | + `extraction.fields.{supplier_name, document_date, total_gross}`  |
| `categorized`  | + `categorization.category`, `categorization.skr_account`          |
| `archived`     | + `archive.{status, target, path}`                                 |
| `exported`     | + `exports[].{target, status, external_id}`                        |

Validierung passiert im Backend zu Beginn jedes Schrittes via JSON Schema (`backend/src/core/schemas/receipt.schema.json`).

---

## 3. Customer-Profile (Kurz-Überblick)

Detail in `02_Kundenprofil_System.md`. Hier nur die Grundstruktur, damit klar ist, was die Module übergeben bekommen:

```json
{
  "customer_id": "cust_a3f4b2",
  "package": "standard",
  "modules_enabled": ["M01", "M02", "M03", "M05", "M07", "M08", "M10"],
  "integrations": {
    "ocr": { "provider": "google_vision" },
    "archive": { "provider": "google_drive", "config": { "root_folder_id": "..." } },
    "booking": { "provider": "lexoffice" },
    "spreadsheet": { "provider": "google_sheets", "config": { "sheet_id": "..." } },
    "input_whatsapp": { "phone_number_id": "..." }
  },
  "routing": {
    "ki_kategorisierung": true,
    "min_amount_review": 1000.00,
    "default_currency": "EUR"
  }
}
```

---

## 4. Event-System

### 4.1 Transport

Events laufen über **Redis Streams**, ein Stream pro Domain-Entity.

| Stream                  | Producer (Module)             | Consumer (Module/Service)         |
|-------------------------|-------------------------------|-----------------------------------|
| `pp:events:receipt`     | M01, M02, M03, M04..M07       | M08 (Reporting), M09 (Comms), Audit-Service |
| `pp:events:customer`    | Backend Customer-Profile-API  | Cache-Invalidation, n8n Worker    |
| `pp:events:export`      | M04, M05, M06, M07            | M08, Audit-Service                |
| `pp:events:system`      | Alle (Errors)                 | Sentry-Bridge, Operator-Slack     |

### 4.2 Event-Schema

Jedes Event folgt diesem Format:

```json
{
  "event_id": "evt_01HVZ8X4M3R9K7N2P6T1Q5Y8B4",
  "type": "pp.receipt.extracted",
  "schema_version": "1.0",
  "occurred_at": "2026-04-29T08:14:34Z",
  "customer_id": "cust_a3f4b2",
  "trace_id": "trc_a8f3d2c1",
  "actor": { "type": "system", "id": "module:M01" },
  "subject": {
    "type": "receipt",
    "id": "01HVZ8X4M3R9K7N2P6T1Q5Y8B4"
  },
  "data": {
    "supplier_name": "Pizzeria Bella Italia",
    "total_gross": 142.85,
    "confidence": 0.94
  }
}
```

### 4.3 Verbindliche Event-Typen

| Event-Typ                       | Wer publiziert | Wer konsumiert            | Trigger                                  |
|---------------------------------|----------------|---------------------------|------------------------------------------|
| `pp.receipt.received`           | M10 / E-Mail   | Master-Workflow           | Beleg ist im System angekommen           |
| `pp.receipt.extracted`          | M01            | M03, Audit                | OCR fertig                               |
| `pp.receipt.extraction_failed`  | M01            | M09 (Pro), Operator       | OCR Fehlerfall                           |
| `pp.receipt.categorized`        | M03            | M02, M05/M06/M07, Audit   | KI-Kategorisierung fertig                |
| `pp.receipt.requires_review`    | M01, M03       | Web-App, M09 (Pro)        | Validation failed / niedrige Confidence  |
| `pp.receipt.archived`           | M02            | M04..M07, Audit           | Beleg in Archiv abgelegt                 |
| `pp.receipt.exported`           | M04..M07       | M08, Audit                | Erfolg eines Exports                     |
| `pp.receipt.export_failed`      | M04..M07       | Operator                  | Export-Fehler                            |
| `pp.report.monthly_generated`   | M08            | n8n-Send-Workflow         | Monatsreport erstellt                    |
| `pp.customer.profile_updated`   | Webapp/Backend | n8n Cache, alle Workflows | Kundenprofil hat sich geändert           |
| `pp.system.module_error`        | Alle           | Sentry, Operator          | Unerwarteter Fehler                      |

### 4.4 Konsum-Pattern (Backend)

```ts
// backend/src/core/events/subscriber.ts (Konzept)
const consumer = new RedisStreamConsumer({
  stream: 'pp:events:receipt',
  group: 'm08-reporting',          // Consumer-Group → at-least-once
  batchSize: 50,
  blockMs: 5000,
});

consumer.on('pp.receipt.exported', async (evt) => {
  await reportingService.recordExport(evt);
});
```

n8n abonniert via einem dedizierten Trigger-Workflow, der Redis Streams per `XREAD` pollt und das Event als Payload an den passenden Sub-Workflow weiterreicht (siehe `03_n8n_Workflows.md`).

### 4.5 At-least-once + Idempotenz

- Jedes Event hat eine eindeutige `event_id` (ULID).
- Konsumenten persistieren verarbeitete `event_id`s in einer `processed_events`-Tabelle (TTL 30 Tage).
- Doppelte Events → Idempotency-Check, kein Re-Processing.

---

## 5. Backend-API-Konventionen

Alle Module exponieren eine REST-API nach denselben Regeln.

### 5.1 Base-URL

```
https://api.prozesspilot.internal/api/v1
```

n8n erreicht das Backend unter `http://backend:3000/api/v1` im Docker-Netz.

### 5.2 Authentifizierung

- Service-to-Service (n8n → Backend): HMAC-SHA256 Header `X-PP-Signature`, Shared Secret pro Umgebung.
- Web-App → Backend: JWT (RS256), `customer_id` und `role` als Claims.
- Externe Webhooks: Signatur-Validierung des jeweiligen Anbieters (WhatsApp Meta, Lexoffice).

### 5.3 Standard-Header

| Header                | Pflicht | Bedeutung                                                     |
|-----------------------|---------|---------------------------------------------------------------|
| `Idempotency-Key`     | Ja      | UUID pro logischer Operation; Backend deduplicated 24h         |
| `X-Customer-ID`       | Ja      | Customer-Context, redundant zu JWT/HMAC                        |
| `X-Trace-ID`          | Empf.   | Korrelations-ID, vererbt durch alle Module                     |
| `Content-Type`        | Ja      | `application/json`                                             |

### 5.4 Standard-Response-Format

Erfolg:

```json
{
  "ok": true,
  "data": { "receipt_id": "01HVZ...", "status": "extracted" },
  "trace_id": "trc_a8f3d2c1"
}
```

Fehler:

```json
{
  "ok": false,
  "error": {
    "code": "RECEIPT_NOT_FOUND",
    "message": "No receipt with id 01HVZ... for customer cust_a3f4b2",
    "details": { "receipt_id": "01HVZ...", "customer_id": "cust_a3f4b2" }
  },
  "trace_id": "trc_a8f3d2c1"
}
```

### 5.5 Error-Codes (canonical)

| Code                     | HTTP | Bedeutung                                  |
|--------------------------|------|--------------------------------------------|
| `VALIDATION_FAILED`      | 400  | Schema-/Feldfehler                          |
| `UNAUTHORIZED`           | 401  | Auth fehlt/ungültig                         |
| `FORBIDDEN`              | 403  | Customer hat Modul nicht aktiviert          |
| `NOT_FOUND`              | 404  | Receipt/Customer/Resource nicht gefunden    |
| `CONFLICT`               | 409  | Duplikat / Status-Konflikt                  |
| `EXTERNAL_API_FAILED`    | 502  | Vision/Lexoffice/Drive haben gefailt        |
| `RATE_LIMITED`           | 429  | Limit überschritten; Retry-After Header     |
| `INTERNAL_ERROR`         | 500  | Unerwartet                                  |

---

## 6. Datenbank-Schema (Postgres, Auszug)

```sql
-- Kunden
CREATE TABLE customers (
  customer_id        TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL,
  package            TEXT NOT NULL CHECK (package IN ('basic','standard','pro')),
  status             TEXT NOT NULL DEFAULT 'active',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_profiles (
  customer_id        TEXT PRIMARY KEY REFERENCES customers ON DELETE CASCADE,
  profile_version    INT  NOT NULL DEFAULT 1,
  modules_enabled    JSONB NOT NULL,
  integrations       JSONB NOT NULL,        -- inkl. encrypted credentials_ref
  routing            JSONB NOT NULL,
  custom             JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_credentials (
  credential_id      TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL REFERENCES customers ON DELETE CASCADE,
  kind               TEXT NOT NULL,         -- 'lexoffice', 'sevdesk', 'gdrive', ...
  ciphertext         BYTEA NOT NULL,        -- pgcrypto AES-256-GCM
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at         TIMESTAMPTZ
);

-- Belege
CREATE TABLE receipts (
  receipt_id         TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL REFERENCES customers,
  status             TEXT NOT NULL,
  file_object_key    TEXT NOT NULL,
  file_sha256        TEXT NOT NULL,
  payload            JSONB NOT NULL,        -- vollständiges Receipt-JSON
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, file_sha256)         -- Idempotenz
);
CREATE INDEX idx_receipts_status ON receipts (customer_id, status);
CREATE INDEX idx_receipts_payload_date ON receipts ((payload->'extraction'->'fields'->>'document_date'));

-- Audit
CREATE TABLE audit_log (
  audit_id           BIGSERIAL PRIMARY KEY,
  customer_id        TEXT NOT NULL,
  receipt_id         TEXT,
  event_type         TEXT NOT NULL,
  actor              JSONB NOT NULL,
  payload_before     JSONB,
  payload_after      JSONB,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_receipt ON audit_log (customer_id, receipt_id);

-- Idempotenz
CREATE TABLE idempotency_keys (
  key                TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL,
  response           JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verarbeitete Events (Konsumenten)
CREATE TABLE processed_events (
  consumer_group     TEXT NOT NULL,
  event_id           TEXT NOT NULL,
  processed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_group, event_id)
);
```

Row-Level-Security via `customer_id` ist Pflicht für `receipts`, `customer_profiles`, `customer_credentials`, `audit_log`.

---

## 7. Routing-Logik (zentrale Funktion im Backend)

Diese Funktion wird von n8n und vom Backend verwendet, um zu entscheiden, welche Module ein Beleg durchläuft.

```ts
// backend/src/core/routing/route-receipt.ts
type RoutePlan = {
  receipt_id: string;
  customer_id: string;
  steps: Array<{ module: 'M01'|'M02'|'M03'|'M04'|'M05'|'M06'|'M07'|'M08'|'M09'; required: boolean }>;
};

export async function planRoute(receipt: Receipt, profile: CustomerProfile): Promise<RoutePlan> {
  const steps: RoutePlan['steps'] = [];

  // Eingang ist bereits passiert (M10/E-Mail). Nun:
  if (profile.modules_enabled.includes('M01')) steps.push({ module: 'M01', required: true });

  if (profile.modules_enabled.includes('M03') && profile.routing.ki_kategorisierung)
    steps.push({ module: 'M03', required: true });

  if (profile.modules_enabled.includes('M02')) steps.push({ module: 'M02', required: true });

  // Export-Fan-out (parallel ausführbar)
  const exportTargets = inferExportTargets(profile); // 'M04'|'M05'|'M06'|'M07'
  for (const t of exportTargets) steps.push({ module: t, required: true });

  return { receipt_id: receipt.receipt_id, customer_id: receipt.customer_id, steps };
}
```

n8n ruft `POST /api/v1/routing/plan` mit dem Receipt auf und bekommt den `RoutePlan` zurück. Das ist die einzige Routing-Logik im System — keine doppelten Wahrheiten.

---

## 8. Versionierung

- `schema_version` in jedem JSON-Objekt (Receipt, Customer-Profile, Event).
- Breaking-Changes erhöhen die Major-Version (`1.0` → `2.0`); ein Migration-Service rechnet ältere Belege bei Bedarf hoch.
- Backwards-Compatibility-Garantie: Backend liest immer alte Versionen, schreibt aber nur die aktuelle.

---

## 9. Was Module garantiert vorfinden

Bei jedem Aufruf eines Moduls (Backend-Endpoint oder n8n-Sub-Workflow) sind **immer** verfügbar:

1. Das vollständige `Receipt`-Objekt im aktuellen Status.
2. Das `CustomerProfile`-Objekt (gecached, max. 60s alt).
3. Eine `trace_id` für Logging.
4. Ein gültiger `Idempotency-Key`.

Damit hat jedes Modul alles, was es zur Verarbeitung braucht — kein Modul muss selbst irgendwo "das Profil holen" oder "den Status raten".
