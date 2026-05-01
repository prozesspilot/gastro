# 03 — n8n Workflow-Architektur

> Verbindliche Konventionen und Struktur für alle n8n-Workflows in ProzessPilot.
> Jeder Workflow wird als JSON ins Repo committet (`n8n/workflows/`) und per Sync-Skript deployed.

---

## 1. Grundsätze

1. **Ein Sub-Workflow pro Modul.** M01 hat exakt einen Workflow `WF-M01`, nicht mehrere.
2. **Master-Workflow orchestriert, Sub-Workflows arbeiten.** Routing-Entscheidungen kommen aus dem Backend (`/routing/plan`), nicht aus n8n-IF-Nodes.
3. **Kein Business-Code in Function-Nodes.** Maximal: Format-Mapping, Field-Pick, einfache Booleans. Alles andere → HTTP-Call zum Backend.
4. **Jeder Workflow ist idempotent.** Trigger-Node setzt `Idempotency-Key`, Backend dedupliziert.
5. **Workflows sind versioniert.** Jeder Workflow hat ein Tag `version: x.y` im Description-Feld.
6. **Credentials kommen aus dem Backend-Proxy.** n8n hat nur ein einziges Credential: das HMAC-Secret zum Backend.

---

## 2. Workflow-Inventar

| Workflow                  | Typ          | Zweck                                                  | Trigger                       |
|---------------------------|--------------|--------------------------------------------------------|-------------------------------|
| `WF-INPUT-WHATSAPP`       | Trigger      | Empfängt WhatsApp-Webhook, normalisiert                | Webhook (Meta)                |
| `WF-INPUT-EMAIL`          | Trigger      | IMAP-Polling oder Webhook (Mailgun/Postmark)           | Cron 1min / Webhook           |
| `WF-INPUT-WEB`            | Trigger      | Web-Upload aus Customer-Portal                          | Webhook                       |
| `WF-MASTER-RECEIPT`       | Orchestrator | Zentraler Pipeline-Workflow (M01→M03→M02→Exports)      | Sub-Workflow-Call             |
| `WF-M01`                  | Modul        | OCR & Extraktion                                        | Sub-Workflow-Call             |
| `WF-M02`                  | Modul        | Archivierung                                            | Sub-Workflow-Call             |
| `WF-M03`                  | Modul        | Kategorisierung                                         | Sub-Workflow-Call             |
| `WF-M04`                  | Modul        | DATEV-Export (Cron)                                     | Cron 0 7 5 * * + Manual       |
| `WF-M05`                  | Modul        | Lexoffice-Export                                        | Sub-Workflow-Call             |
| `WF-M06`                  | Modul        | sevDesk-Export                                          | Sub-Workflow-Call             |
| `WF-M07`                  | Modul        | Spreadsheet-Export                                      | Sub-Workflow-Call             |
| `WF-M08`                  | Modul        | Monatsreporting (Cron)                                  | Cron 0 8 1 * * + Manual       |
| `WF-M09`                  | Modul        | Lieferanten-Kommunikation                              | Sub-Workflow-Call / Event     |
| `WF-M10`                  | Modul        | WhatsApp-spezifische Verarbeitung                      | Aufgerufen aus WF-INPUT       |
| `WF-EVENTS-DISPATCH`      | Cron         | Pollt Redis Streams, dispatched zu Sub-Workflows        | Cron */1 * * * *              |
| `WF-CRON-CLEANUP`         | Cron         | Aufräumjobs (alte Idempotenzkeys, processed_events)    | Cron 0 3 * * *                |

---

## 3. Standard-Workflow-Struktur

Jeder Sub-Workflow folgt diesem Aufbau:

```
[Execute Workflow Trigger] ──► [Function: validate input]
        │                              │
        │                              ▼
        │                      [HTTP: backend module-endpoint]
        │                              │
        │                              ▼
        │                      [IF: response.ok]
        │                          ╱        ╲
        │                       Yes          No
        │                        │            │
        │                        ▼            ▼
        │                [Set: result]   [Function: shape error]
        │                        │            │
        │                        └────►  [Respond to Workflow]
        │
        ▼
  Always: [HTTP: emit event to Redis stream]  (parallel, fire-and-forget)
```

**Konvention:** Der erste Node ist `Execute Workflow Trigger` mit Schema. Der letzte ist `Respond to Workflow`. Dazwischen so wenig n8n-Nodes wie möglich — die Arbeit macht das Backend.

---

## 4. WF-MASTER-RECEIPT (zentraler Pipeline-Workflow)

Dies ist das Herzstück. Er nimmt einen rohen Beleg entgegen und steuert ihn durch alle Module.

### 4.1 Input

```json
{
  "trace_id": "trc_a8f3d2c1",
  "customer_id": "cust_a3f4b2",
  "source": {
    "channel": "whatsapp",
    "external_id": "wamid.HBgM...",
    "raw_payload_ref": "s3://prozesspilot-raw/cust_a3f4b2/2026/04/wamid_HBgMNDk.json"
  },
  "file": {
    "object_key": "cust_a3f4b2/originals/2026/04/01HVZ.jpg",
    "mime_type": "image/jpeg",
    "sha256": "f3b8a..."
  }
}
```

### 4.2 Node-Layout (Node für Node)

```
1.  [Execute Workflow Trigger]            input wie 4.1
2.  [HTTP: Backend create_receipt]        POST /api/v1/receipts → {receipt}
                                          - Idempotenz-Check (sha256+customer)
                                          - Status: 'received'
3.  [HTTP: Backend get_profile]           GET /api/v1/internal/profile/{customer_id}
4.  [HTTP: Backend route_plan]            POST /api/v1/routing/plan
                                          → { steps: [{module:'M01'}, ...] }
5.  [Loop Over Items: steps]              splittet die steps
6.    [Switch: step.module]
        case 'M01' → [Execute Workflow: WF-M01]
        case 'M03' → [Execute Workflow: WF-M03]
        case 'M02' → [Execute Workflow: WF-M02]
        case 'M05' → [Execute Workflow: WF-M05]
        case 'M06' → [Execute Workflow: WF-M06]
        case 'M07' → [Execute Workflow: WF-M07]
7.    [Function: collect result, update receipt]
8.    [HTTP: Backend save_receipt]        PATCH /api/v1/receipts/{id}
9.  End Loop
10. [HTTP: Backend finalize_receipt]      POST /api/v1/receipts/{id}/complete
                                          → status: 'completed'
11. [Respond to Workflow]                 { receipt_id, status: 'completed' }
```

### 4.3 Fehler-Pfade

- **Modul wirft Fehler** → Workflow setzt `receipt.status = 'error'`, schreibt Fehlerdetail nach `payload.errors`, bricht Loop ab. Operator-Alert via Sentry.
- **Validation-Failure** in M01 → Modul liefert `requires_review`. Master setzt Status, ruft optional `WF-M09` (nur Pro), bricht ab.
- **Recoverable Fehler** (5xx/Timeout) → n8n-Retry: 3× mit Exponential Backoff.

### 4.4 Parallelität

Die Export-Module (M04..M07) können parallel laufen. n8n unterstützt das nativ via "Split In Batches" + "Run In Parallel"-Option im Sub-Workflow-Call. Empfehlung: Batches von 4 (alle Exports gleichzeitig).

---

## 5. WF-INPUT-WHATSAPP

### 5.1 Input

Webhook von Meta WhatsApp Business Cloud API:

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "metadata": { "phone_number_id": "123456789012345" },
        "messages": [{
          "from": "4917612345678",
          "id": "wamid.HBgMNDk...",
          "type": "image",
          "image": { "id": "1234567890", "mime_type": "image/jpeg", "sha256": "..." }
        }]
      }
    }]
  }]
}
```

### 5.2 Node-Layout

```
1.  [Webhook]                              POST /webhooks/wa, signature-verify
2.  [Function: extract message]            extrahiert from, image.id, phone_number_id
3.  [HTTP: Backend resolve_customer]       POST /api/v1/internal/whatsapp/resolve
                                           → { customer_id }  (mappt phone_number_id → customer)
4.  [HTTP: WhatsApp Media Download]        GET https://graph.facebook.com/.../{image.id}
                                           via Backend-Proxy (Auth + Storage in einem)
5.  [HTTP: Backend store_raw]              POST /api/v1/internal/storage/raw
                                           → { object_key, sha256, mime_type }
6.  [Execute Workflow: WF-MASTER-RECEIPT]  übergibt customer_id, source, file
7.  [HTTP: WhatsApp send confirmation]     "Beleg empfangen ✓ wird verarbeitet"
                                           via Backend-Proxy
8.  [Respond Webhook 200]
```

### 5.3 Sicherheit

- Webhook-Signatur (`X-Hub-Signature-256`) wird vom Backend-Proxy verifiziert, nicht in n8n.
- Empfänger-Telefonnummer muss in `integrations.input_whatsapp.allowed_senders` stehen, sonst 403.

---

## 6. WF-INPUT-EMAIL

Zwei Modi, per Kundenprofil wählbar:

### 6.1 Modus A: Inbound-Webhook (bevorzugt)

ProzessPilot betreibt eigene Inbound-Mail-Domain `inbox.prozesspilot.de`. Alias `belege+{customer_id}@inbox.prozesspilot.de`. Mailgun/Postmark POSTet jede Mail an `/webhooks/email`.

```
1. [Webhook]
2. [Function: parse alias → customer_id]
3. [Loop: attachments]
4.   [Function: filter mime (pdf|jpg|png)]
5.   [HTTP: Backend store_raw]
6.   [Execute Workflow: WF-MASTER-RECEIPT]
7. End Loop
8. [Respond Webhook 200]
```

### 6.2 Modus B: IMAP-Polling (Legacy/Pro)

Für Kunden, die ihren bestehenden E-Mail-Account angebunden haben wollen.

```
1. [Cron: every 1 min]
2. [HTTP: Backend list_imap_customers]    GET /api/v1/internal/imap/customers
3. [Loop: customers]
4.   [HTTP: Backend imap_fetch_unread]    POST /api/v1/internal/imap/fetch
                                          → { messages: [...] }
5.   [Loop: messages → attachments]
6.     [HTTP: Backend store_raw]
7.     [Execute Workflow: WF-MASTER-RECEIPT]
8.   End Loop
9. End Loop
```

IMAP-Verbindung läuft im Backend (eigener `ImapWorker`-Service), nicht in n8n. n8n triggert nur.

---

## 7. WF-EVENTS-DISPATCH (Bridge Redis Streams → n8n)

Damit asynchrone Ereignisse (z. B. „export_failed" → Lieferanten-Mail) Workflows triggern können, läuft dieser Cron-Workflow jede Minute.

```
1. [Cron: */1 * * * *]
2. [HTTP: Backend pop_events]              POST /api/v1/internal/events/consume
                                           Body: { consumer: 'n8n-dispatcher', max: 50 }
                                           → { events: [...] }
3. [Loop: events]
4.   [Switch: event.type]
       case 'pp.receipt.requires_review' → [Execute Workflow: WF-M09]
       case 'pp.receipt.export_failed'   → [Execute Workflow: WF-OPERATOR-ALERT]
       case 'pp.report.monthly_generated'→ [Execute Workflow: WF-SEND-REPORT]
5. End Loop
6. [HTTP: Backend ack_events]              POST /api/v1/internal/events/ack
                                           Body: { event_ids: [...] }
```

Backend hält die Stream-Position (`XGROUP`) für Consumer `n8n-dispatcher`. n8n bestätigt nach erfolgreicher Ausführung.

---

## 8. Konventionen für Sub-Workflows (M01–M10)

Jeder Modul-Sub-Workflow folgt **exakt** diesem Schema:

### 8.1 Standardisierter Input

```json
{
  "trace_id": "trc_a8f3d2c1",
  "idempotency_key": "ik_M01_01HVZ8X4...",
  "receipt": { "...komplettes Receipt..." },
  "customer_profile": { "...komplettes Profil..." }
}
```

### 8.2 Standardisierter Output

Erfolg:
```json
{
  "ok": true,
  "module": "M01",
  "receipt_patch": {
    "status": "extracted",
    "extraction": { "..." }
  },
  "events_to_emit": ["pp.receipt.extracted"]
}
```

Fehler:
```json
{
  "ok": false,
  "module": "M01",
  "error": { "code": "...", "message": "...", "retryable": false },
  "receipt_patch": { "status": "error" }
}
```

### 8.3 Pflicht-Nodes

| Node                              | Zweck                                                   |
|-----------------------------------|---------------------------------------------------------|
| `Execute Workflow Trigger`        | Eingang, Schema definiert                               |
| `Function: assert_status`         | Prüft `receipt.status` ist in `accepts_status` (siehe Modul-Spec) |
| `HTTP: Backend modul-endpoint`    | Eigentliche Arbeit                                      |
| `IF: ok`                          | Routet auf Success/Error-Pfad                           |
| `HTTP: emit event`                | Schreibt Event nach Redis (außer Standard-Events, die das Backend selbst emittiert) |
| `Respond to Workflow`             | Ausgang im o. g. Format                                 |

### 8.4 Was im Function-Node erlaubt ist

Erlaubt:
```js
// Field-Mapping
return [{ json: { receipt_id: $input.first().json.receipt.receipt_id, ... } }];

// Status-Check
const ok = ['received','requires_review'].includes($input.first().json.receipt.status);
```

Nicht erlaubt:
- Schleifen über Daten
- API-Calls (gehört in HTTP-Node)
- Berechnungen (Steuersätze, Beträge, Konten) — die kommen vom Backend

---

## 9. Versionierung & Deployment

### 9.1 Repo-Struktur

```
n8n/
├── workflows/
│   ├── WF-INPUT-WHATSAPP.json
│   ├── WF-MASTER-RECEIPT.json
│   ├── WF-M01.json
│   ├── ...
│   └── _shared/
│       └── lib-functions.js          # gemeinsame Function-Snippets (per ESM-Import in Code-Node)
├── credentials/
│   └── BACKEND_HMAC.example.json     # Template, Wert kommt aus Vault
└── deploy.sh
```

### 9.2 Deploy-Skript

```bash
#!/usr/bin/env bash
# n8n/deploy.sh
set -euo pipefail
N8N_API="${N8N_API:-https://n8n.prozesspilot.internal/api/v1}"
TOKEN="${N8N_API_TOKEN:?missing}"

for f in n8n/workflows/*.json; do
  name=$(jq -r .name "$f")
  id=$(curl -sS -H "X-N8N-API-KEY:$TOKEN" "$N8N_API/workflows?name=$name" | jq -r '.data[0].id // empty')
  if [ -z "$id" ]; then
    curl -sS -X POST -H "X-N8N-API-KEY:$TOKEN" -H "Content-Type:application/json" \
      --data @"$f" "$N8N_API/workflows" >/dev/null
    echo "created: $name"
  else
    curl -sS -X PUT -H "X-N8N-API-KEY:$TOKEN" -H "Content-Type:application/json" \
      --data @"$f" "$N8N_API/workflows/$id" >/dev/null
    echo "updated: $name"
  fi
done
```

CI-Pipeline: PR-Merge auf `main` → GitHub Action ruft `deploy.sh` gegen Staging, manuelles Approval → Production.

### 9.3 Versionierung

Jeder Workflow trägt im Description-Feld:

```
version: 1.4
last_changed: 2026-04-29
owner: ProzessPilot Core Team
docs: docs/modules/M01_Belegerfassung_OCR.md
```

Bei Schema-Breaking-Changes (z. B. Receipt v1 → v2): zwei Workflows parallel betreiben (`WF-M01_v1`, `WF-M01_v2`) und Master entscheidet anhand `receipt.schema_version`.

---

## 10. Beobachtbarkeit

- **Execution Logs**: n8n speichert Executions 14 Tage. Bei Fehlern automatisch Sentry-Alert via `WF-OPERATOR-ALERT`.
- **Trace-ID-Propagierung**: Jeder Sub-Workflow-Call übergibt `trace_id`; HTTP-Nodes setzen `X-Trace-ID`-Header. So lässt sich ein Beleg von WhatsApp bis Lexoffice rückverfolgen (n8n + Backend + externe API).
- **Metriken**: Backend exposed `/metrics` (Prometheus-Format), Grafana-Dashboard zeigt Throughput, Fehlerquote, p95-Latenz pro Modul.

---

## 11. Lokale Entwicklung

```bash
docker compose up -d postgres redis minio backend n8n
# n8n läuft auf http://localhost:5678
# erste Workflows aus n8n/workflows/ werden per ./n8n/deploy.sh importiert
# Backend lauscht auf :3000
# Test-Fixture: ./scripts/seed-customer.sh && ./scripts/inject-receipt.sh sample.jpg
```

Im Compose-File ist `N8N_HOST=n8n.localhost`, `BACKEND_URL=http://backend:3000`. n8n und Backend teilen ein internes Docker-Netzwerk; nur Caddy ist exposed.

---

## 12. Migration aus dem bestehenden Konzept

Der ursprüngliche Konzept-Workflow (Schritt 1–7 im Hero) bildet sich 1:1 in dieser Architektur ab:

| Konzept-Schritt          | Implementierung                                        |
|--------------------------|--------------------------------------------------------|
| 1 — Belegeingang         | `WF-INPUT-WHATSAPP` / `WF-INPUT-EMAIL` → `WF-MASTER`   |
| 2 — OCR & Extraktion     | `WF-M01`                                               |
| 3 — Validierung          | Backend in M01 (Schema-Validierung) + ggf. M09         |
| 4 — Kategorisierung      | `WF-M03`                                               |
| 5 — Archivierung         | `WF-M02`                                               |
| 6 — Export/Integration   | `WF-M04`/`WF-M05`/`WF-M06`/`WF-M07`                    |
| 7 — Monatsreporting      | `WF-M08` (Cron, ruft Backend-Reporting-Service)        |

Damit ist der bestehende Workflow vollständig in einer **technisch entkoppelten, modular aufgebauten** Variante abgebildet.
