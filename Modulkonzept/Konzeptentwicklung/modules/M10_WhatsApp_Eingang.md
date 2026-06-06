# M10 — WhatsApp Eingang

> ⚠️ **EINGEFROREN (Stand 2026-06-06)** — beschreibt ein ungebautes/totes Modul, das aktuell gegen nicht-existente (Geister-)Tabellen läuft (HTTP 500). Stand veraltet; diese Spec gilt erst nach Reaktivierung (Post-Pilot). Was wirklich läuft, steht in `.claude/CLAUDE.md` §3.

> **Paket:** Basic, Standard, Pro
> **Phase:** 1 (MVP)
> **Verantwortlich:** WhatsApp Business Cloud API → ProzessPilot Pipeline
> **Spec-Version:** 1.0

---

## 1. Zweck

M10 ist der Eingangskanal für Belege per WhatsApp. Der Gastronom fotografiert einen Beleg, schickt ihn an eine vom System verwaltete WhatsApp-Nummer, und das System nimmt das Bild entgegen, persistiert es, identifiziert den Kunden und übergibt an `WF-MASTER-RECEIPT`. Eine Bestätigungsnachricht geht zurück an den Sender.

---

## 2. Verantwortlichkeit (Single Responsibility)

M10 ist verantwortlich für:

- Empfang von WhatsApp-Webhooks (Meta Cloud API).
- Verifizierung der Webhook-Signatur.
- Mapping `phone_number_id` → `customer_id`.
- Mapping `from` (Absender-Nummer) → erlaubter Sender (gemäß Profil).
- Download des Medien-Inhalts (Bild/PDF) von WhatsApp.
- Persistenz der Original-Datei in MinIO.
- Versand der Bestätigungsnachricht an den Sender.
- Übergabe an `WF-MASTER-RECEIPT`.

M10 ist **nicht** verantwortlich für:

- OCR oder Datenextraktion (das macht M01).
- Statuswechsel des Receipts über `received` hinaus.
- Geschäftslogik (Kategorisierung, Routing).

---

## 3. Trigger

Webhook von Meta WhatsApp Business Cloud API:

```
POST https://api.prozesspilot.internal/webhooks/whatsapp
Headers:
  X-Hub-Signature-256: sha256=...
Body: WhatsApp Webhook Payload (siehe 5.1)
```

n8n exponiert den Webhook unter `/webhook/wa`, leitet aber die Signatur-Validierung an das Backend weiter.

---

## 4. Abhängigkeiten

| Abhängigkeit                         | Genutzt für                                |
|--------------------------------------|--------------------------------------------|
| WhatsApp Business Cloud API (Meta)   | Webhook-Empfang, Media-Download, Send-Msg  |
| Backend `/api/v1/internal/whatsapp/*`| Auflösung Customer, Storage, Templates     |
| MinIO (Storage)                      | Original-Datei                             |
| Postgres                             | Receipt-Anlage (über Backend)              |
| n8n                                  | Webhook-Empfang, Sub-Workflow-Aufruf       |
| Redis Streams                        | `pp.receipt.received` Event                |

---

## 5. Input / Output

### 5.1 Input — WhatsApp Webhook Payload

Vollständiges Beispiel für Bild-Nachricht:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+498912345678",
          "phone_number_id": "123456789012345"
        },
        "contacts": [{
          "profile": { "name": "Mario" },
          "wa_id": "4917612345678"
        }],
        "messages": [{
          "from": "4917612345678",
          "id": "wamid.HBgMNDk3MTYxMjM0NTY3OBUCABIYIDQ4...",
          "timestamp": "1714378458",
          "type": "image",
          "image": {
            "id": "1234567890987654",
            "mime_type": "image/jpeg",
            "sha256": "f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5",
            "caption": "Metro Beleg von gestern"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

Auch zu unterstützen:
- `type: "document"` (PDF-Belege)
- `type: "text"` (Hinweistext, ohne Anhang → freundliche Rückmeldung "Bitte schicke ein Foto")

### 5.2 Output — Sub-Workflow-Aufruf an `WF-MASTER-RECEIPT`

```json
{
  "trace_id": "trc_a8f3d2c1",
  "customer_id": "cust_a3f4b2",
  "source": {
    "channel": "whatsapp",
    "received_at": "2026-04-29T08:14:18Z",
    "external_id": "wamid.HBgMNDk3MTYxMjM0NTY3OBUCABIYIDQ4...",
    "sender": {
      "type": "phone",
      "value": "+4917612345678",
      "display_name": "Mario"
    },
    "raw_payload_ref": "s3://prozesspilot-raw/cust_a3f4b2/2026/04/wamid_HBgM.json"
  },
  "file": {
    "object_key": "cust_a3f4b2/originals/2026/04/01HVZ8X4M3R9K7N2P6T1Q5Y8B4.jpg",
    "mime_type": "image/jpeg",
    "size_bytes": 482314,
    "sha256": "f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5"
  },
  "user_caption": "Metro Beleg von gestern"
}
```

### 5.3 Output — Bestätigungsnachricht an WhatsApp

Template `confirmation_received_de`:
```
✓ Beleg empfangen.
Wir verarbeiten ihn jetzt – kommt zurück, sobald er verbucht ist.
```

Bei Fehler (z. B. Sender nicht in `allowed_senders`):
```
Hi! Diese Nummer ist bei uns nicht für die Belegerfassung registriert.
Bitte wende dich an deinen ProzessPilot-Ansprechpartner.
```

---

## 6. n8n-Workflow `WF-INPUT-WHATSAPP` (Node für Node)

| #  | Node-Typ                  | Name                                | Konfiguration / Code                                                                                  |
|----|---------------------------|-------------------------------------|-------------------------------------------------------------------------------------------------------|
| 1  | Webhook                   | `Trigger: Meta Webhook`             | POST /webhook/wa, raw body, response mode `Last Node`                                                 |
| 2  | HTTP Request              | `Verify: Signature`                 | POST `BACKEND/api/v1/internal/whatsapp/verify` with raw body + X-Hub-Signature header                 |
| 3  | IF                        | `IF: signature valid`               | continue if `verify.ok===true`, else `Respond Webhook 401`                                            |
| 4  | Code (JS)                 | `Function: Extract Message`         | Extrahiert `messages[0]`, `contacts[0]`, `metadata.phone_number_id`. Ergebnis: `{ from, image, ... }` |
| 5  | IF                        | `IF: type is image\|document`       | nur image/document → weiter; bei text → Branch zu Step 14 (Hint senden)                              |
| 6  | HTTP Request              | `Resolve: Customer`                 | POST `BACKEND/.../whatsapp/resolve` body: `{ phone_number_id, from }` → `{ customer_id, allowed }`    |
| 7  | IF                        | `IF: allowed===true`                | nein → Step 14 (Hinweis senden)                                                                       |
| 8  | HTTP Request              | `Download: Media`                   | POST `BACKEND/.../whatsapp/media` body: `{ media_id, customer_id }` → `{ object_key, sha256, mime }`  |
| 9  | HTTP Request              | `Persist: Raw Payload`              | POST `BACKEND/.../storage/raw-payload` body: full webhook → `{ raw_payload_ref }`                     |
| 10 | Set                       | `Build: Pipeline Input`             | Baut das JSON aus 5.2 zusammen                                                                         |
| 11 | Execute Workflow          | `Run: WF-MASTER-RECEIPT`            | übergibt Pipeline Input, runs in parallel mode                                                        |
| 12 | HTTP Request              | `Send: Confirmation Message`        | POST `BACKEND/.../whatsapp/send-template` body: `{ to, template:'confirmation_received_de' }`         |
| 13 | Respond to Webhook        | `Respond: 200`                      | `{ ok: true }`                                                                                        |
| 14 | HTTP Request              | `Send: Helper Message` (Branch)     | Hinweistext senden, danach Respond 200                                                                |

### 6.1 Wichtige Details

- **Antwort an Meta:** Innerhalb 5 Sekunden mit 200, sonst Retry. Daher: Schritt 11 (`Run: WF-MASTER-RECEIPT`) auf "fire-and-forget" (`continueOnFail: true`, `executionMode: 'parallel'`). Die Pipeline läuft asynchron.
- **Retry-Verhalten:** Meta retried den Webhook bis zu 7× über mehrere Stunden. Idempotenz greift via `external_id` (`wamid.*`).
- **Mehrere Bilder in einer Nachricht:** Meta liefert pro Foto eine Message → Loop über `messages[]`.

---

## 7. Backend-API-Endpoints (M10-spezifisch)

Alle unter `/api/v1/internal/whatsapp/*` (nur intern, HMAC-geschützt).

### 7.1 `POST /api/v1/internal/whatsapp/verify`

Verifiziert Webhook-Signatur.

**Request**:
```json
{
  "raw_body_b64": "...base64...",
  "signature": "sha256=abcdef..."
}
```

**Response 200**:
```json
{ "ok": true }
```

**Response 401**:
```json
{ "ok": false, "error": { "code": "INVALID_SIGNATURE" } }
```

### 7.2 `POST /api/v1/internal/whatsapp/resolve`

Mapped `phone_number_id + from` → `customer_id`.

**Request**:
```json
{ "phone_number_id": "123456789012345", "from": "4917612345678" }
```

**Response 200**:
```json
{
  "ok": true,
  "data": {
    "customer_id": "cust_a3f4b2",
    "allowed": true,
    "sender": { "name": "Mario", "role": "owner" }
  }
}
```

**Response 200 mit allowed=false**:
```json
{
  "ok": true,
  "data": {
    "customer_id": "cust_a3f4b2",
    "allowed": false,
    "reason": "sender_not_whitelisted"
  }
}
```

**Response 404**:
```json
{ "ok": false, "error": { "code": "CUSTOMER_NOT_FOUND" } }
```

### 7.3 `POST /api/v1/internal/whatsapp/media`

Lädt Medien-Datei von Meta, speichert in MinIO, errechnet sha256.

**Request**:
```json
{ "media_id": "1234567890987654", "customer_id": "cust_a3f4b2" }
```

**Backend-Logik**:
1. Hole Customer-Profile, daraus WA-Credential (`integrations.input_whatsapp.credentials_ref`).
2. Entschlüssele Access-Token.
3. `GET https://graph.facebook.com/v19.0/{media_id}` → liefert `url`.
4. `GET <url>` mit Authorization: Bearer <access_token> → Bytes.
5. Berechne sha256.
6. Idempotenz-Check: existiert in `receipts` ein Eintrag mit `(customer_id, file_sha256)`?
   - Ja → return existing `object_key`, kein Re-Upload.
7. Upload nach `s3://prozesspilot-raw/{customer_id}/originals/{yyyy}/{mm}/{ulid}.{ext}`.
8. Return.

**Response 200**:
```json
{
  "ok": true,
  "data": {
    "object_key": "cust_a3f4b2/originals/2026/04/01HVZ8X4M3R9K7N2P6T1Q5Y8B4.jpg",
    "sha256": "f3b8a91c...",
    "mime_type": "image/jpeg",
    "size_bytes": 482314,
    "is_duplicate": false
  }
}
```

### 7.4 `POST /api/v1/internal/whatsapp/send-template`

Sendet WhatsApp-Template.

**Request**:
```json
{
  "customer_id": "cust_a3f4b2",
  "to": "+4917612345678",
  "template_name": "confirmation_received_de",
  "variables": {}
}
```

**Response**: `{ "ok": true, "data": { "message_id": "wamid..." } }`.

### 7.5 `POST /api/v1/internal/storage/raw-payload`

Speichert vollständiges Webhook-Payload als JSON.

---

## 8. Backend-Services (Code-Struktur)

```
backend/src/modules/m10-whatsapp/
├── routes.ts                    # Fastify-Routes für /internal/whatsapp/*
├── handlers/
│   ├── verify.handler.ts
│   ├── resolve.handler.ts
│   ├── media.handler.ts
│   └── send-template.handler.ts
├── services/
│   ├── meta-graph.client.ts     # Wrapper um Graph API
│   ├── webhook-verifier.ts      # HMAC-Sha256 Validation
│   ├── customer-resolver.ts     # phone_number_id → customer
│   └── media-downloader.ts
├── schemas/
│   ├── webhook.schema.json
│   ├── resolve.input.json
│   └── media.input.json
└── tests/
    ├── verify.test.ts
    ├── resolve.test.ts
    ├── media.test.ts
    └── e2e.test.ts
```

### 8.1 Schlüsselfunktionen (Pseudocode)

```ts
// services/customer-resolver.ts
export async function resolveCustomer(
  phoneNumberId: string,
  from: string
): Promise<{ customerId: string; allowed: boolean; sender?: AllowedSender }> {
  const profile = await profileRepo.findByPhoneNumberId(phoneNumberId);
  if (!profile) throw new NotFoundError('CUSTOMER_NOT_FOUND');

  const senders = profile.integrations.input_whatsapp.allowed_senders ?? [];
  const normalizedFrom = normalizePhone(from); // +4917...
  const sender = senders.find(s => normalizePhone(s.phone) === normalizedFrom);

  return {
    customerId: profile.customer_id,
    allowed: !!sender,
    sender,
  };
}

// services/media-downloader.ts
export async function downloadMedia(
  customerId: string,
  mediaId: string
): Promise<MediaPersisted> {
  const accessToken = await credentialService.useCredential(customerId, 'wa_access_token');

  // 1) URL holen
  const meta = await metaClient.getMediaMeta(mediaId, accessToken);
  // 2) bytes
  const bytes = await metaClient.downloadMediaBytes(meta.url, accessToken);
  // 3) sha256
  const sha = sha256(bytes);
  // 4) Idempotenz
  const existing = await receiptRepo.findByHash(customerId, sha);
  if (existing) return { ...existing.file, is_duplicate: true };
  // 5) Upload
  const key = buildObjectKey(customerId, sha, meta.mime_type);
  await storage.upload(key, bytes, meta.mime_type);

  return { object_key: key, sha256: sha, mime_type: meta.mime_type, size_bytes: bytes.length, is_duplicate: false };
}
```

---

## 9. Datenstruktur

M10 schreibt **nicht direkt** in `receipts`. Es ruft `POST /api/v1/receipts` auf, das aus dem `WF-MASTER-RECEIPT` heraus passiert. M10 liefert nur die Inputs.

### 9.1 `customer_credentials` Eintrag (Beispiel)

```json
{
  "credential_id": "cred_wa_a3f4b2",
  "customer_id": "cust_a3f4b2",
  "kind": "wa_access_token",
  "ciphertext": "<verschlüsselt>",
  "meta": {
    "phone_number_id": "123456789012345",
    "graph_api_version": "v19.0"
  },
  "expires_at": "2026-12-31T23:59:59Z"
}
```

Tokens (System User Tokens) sind langlebig (60 Tage). Backend hat einen Rotation-Job, der 7 Tage vor Ablauf neu holt.

---

## 10. Events

| Event                  | Wann                                    | Payload                                          |
|------------------------|-----------------------------------------|--------------------------------------------------|
| `pp.receipt.received`  | Nach erfolgreichem Pipeline-Trigger      | siehe `01_Datenmodell_Events.md` §4.2            |
| `pp.system.module_error` | Bei nicht-recoverbarem Fehler in M10  | enthält `module: 'M10'`, error code, trace_id    |

---

## 11. Fehlerbehandlung

| Fehler                                         | Klasse        | Handling                                                    |
|------------------------------------------------|---------------|-------------------------------------------------------------|
| Invalid Signature                              | Validation    | 401 zurück, kein Receipt anlegen                            |
| `phone_number_id` unbekannt                    | Validation    | 200 zurück (nicht retryen!), Slack-Alert an Operator        |
| Sender nicht in `allowed_senders`              | Business      | 200 zurück, Hint-Message an Sender                          |
| Media-Download fehlgeschlagen (5xx Meta)       | Recoverable   | n8n retried 3× (5s/30s/3min); danach `pp.system.module_error` |
| Media-Download fehlgeschlagen (4xx)            | Fatal         | kein Retry; Receipt-Status `error`; Operator-Alert          |
| Storage-Upload fehlgeschlagen                  | Recoverable   | n8n retried; sonst Operator-Alert                           |
| Duplikat (sha256 existiert)                    | Business      | Bestätigung "Beleg bereits vorhanden", kein neuer Pipeline-Run |
| Datei > 16 MB (WhatsApp-Limit ist 5 MB Bild)   | Validation    | Hint-Message: "Bitte als kleineres Foto/PDF schicken"       |
| Mime-Type nicht unterstützt (z. B. Video)      | Validation    | Hint-Message: "Bitte Foto oder PDF"                         |

---

## 12. Sicherheit

- Webhook-Signatur via `X-Hub-Signature-256` (HMAC-SHA256 mit App Secret) — wird von Backend (nicht n8n) verifiziert.
- Rate-Limit pro `phone_number_id`: 60 Webhooks/Minute (Meta-Default reicht).
- Sender-Whitelist Pflicht — keine Verarbeitung ohne explizite Zulassung im Profil.
- Original-Bytes liegen in MinIO mit Server-Side-Encryption + per-Customer Key.

---

## 13. Tests

### 13.1 Unit

- `webhook-verifier.ts`: Signatur-Validierung mit gültigem/ungültigem Secret.
- `customer-resolver.ts`: alle Branches (allowed/not-allowed/customer-missing).
- `media-downloader.ts`: Idempotenz, Mime-Type-Mapping, sha256-Berechnung (Mocked Meta-Client).

### 13.2 Integration

- Fastify-Server hochfahren, Test-Webhook-Payload feuern, Backend-DB checken (kein Receipt direkt, aber Storage-Upload erfolgt).

### 13.3 E2E (Phase 1 Acceptance)

- Echte Test-WhatsApp-Nummer.
- Foto schicken → in MinIO sichtbar → Master-Workflow getriggert → Receipt-Eintrag in DB.
- Bestätigungsnachricht zurück.

---

## 14. ENV-Variablen (Backend)

| Variable                          | Beispiel                                | Zweck                              |
|-----------------------------------|-----------------------------------------|------------------------------------|
| `WHATSAPP_APP_SECRET`             | `aBc...`                                | Webhook-Signatur-Validierung       |
| `WHATSAPP_VERIFY_TOKEN`           | `pp-verify-token-xyz`                   | Initiale Verify-Challenge          |
| `WHATSAPP_GRAPH_API_VERSION`      | `v19.0`                                 | API-Version                        |
| `STORAGE_RAW_BUCKET`              | `prozesspilot-raw`                      | MinIO-Bucket für Originale         |

---

## 15. Was Claude Code generieren soll

1. DB-Migration: keine zusätzliche (nutzt `customers`, `customer_profiles`, `customer_credentials`).
2. Backend-Modul `backend/src/modules/m10-whatsapp/` (komplett, siehe §8).
3. JSON-Schemas für Inputs (siehe §7).
4. Tests (siehe §13).
5. n8n-Workflow `n8n/workflows/WF-INPUT-WHATSAPP.json` nach §6.
6. README in `backend/src/modules/m10-whatsapp/README.md`.

---

## 16. Acceptance Criteria

- [ ] Webhook-Signatur wird validiert; ungültige Signaturen geben 401.
- [ ] `phone_number_id` → `customer_id` mapping funktioniert.
- [ ] Nicht-whitelisteted Sender bekommen Hint-Message und kein Receipt wird angelegt.
- [ ] Medien-Download von Meta funktioniert mit echtem Test-Token.
- [ ] sha256 deduplication: gleicher Beleg zweimal geschickt → nur 1 Eintrag in `receipts`.
- [ ] Bestätigungsnachricht erreicht den Sender < 10s nach Eingang.
- [ ] Master-Workflow wird mit korrektem Pipeline-Input aufgerufen.
- [ ] Audit-Log enthält Entry `received` mit Trace-ID.
- [ ] Unit-Tests > 90% Coverage.
- [ ] E2E-Test mit echter WhatsApp-Nummer durchläuft.
