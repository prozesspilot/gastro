# Foundation Spec — Sprint 0

> **Phase:** 0 (Foundation, Woche 1–2)
> **Adressat:** Engineer + Claude Code
> **Spec-Version:** 1.0
> Diese Datei ist die Spec-Quelle für alle Sprint-0-Prompts. Sie ersetzt die fehlende `modules/M00_*.md`.

---

## 1. Zweck

Das Fundament, ohne das kein einziges Modul gebaut werden kann. Liefert: Repo-Struktur, Datenbank, Auth, Storage, Event-Bus, Routing, Logging — alles, was alle 10 Module später voraussetzen.

**Sprint-0 ist fertig, wenn:** ein leerer Test-Beleg via HTTP an `POST /api/v1/receipts` ins System kommt, in Postgres landet, ein `pp.receipt.received`-Event auf Redis landet, und ein RoutePlan aus `POST /api/v1/routing/plan` zurückkommt — ohne dass irgendein M0X-Modul existiert.

---

## 2. Lieferumfang (10 Deliverables)

Jedes Deliverable hat: ID, Was, Wer, Files, Acceptance Criteria.

### D1 — Repo-Bootstrap

**Was:** Repo-Skelett mit Docker-Compose, Backend-Skeleton, n8n-Setup.
**Wer:** Engineer, gestützt durch Bootstrap-Prompt (Template F).
**Files:**
```
prozesspilot/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── biome.json (oder eslint+prettier)
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── server.ts
│   │   ├── app.ts
│   │   ├── core/
│   │   │   ├── config.ts
│   │   │   ├── logger.ts
│   │   │   └── trace.ts
│   │   └── routes/
│   │       └── health.ts
│   └── tests/
│       └── smoke.test.ts
├── n8n/
│   └── workflows/
└── infra/
    └── README.md
```
**Acceptance:**
- [ ] `docker compose up -d` startet Postgres 16, Redis 7, MinIO, n8n.
- [ ] `cd backend && npm install && npm run dev` startet Fastify auf `:3000`.
- [ ] `GET /health` → `{ ok: true, version, uptime }`.
- [ ] `GET /ready` → `200` wenn DB+Redis erreichbar, sonst `503`.
- [ ] `npm test` zeigt 1 grünen Smoke-Test.
- [ ] `.env.example` enthält alle Variablen aus §4.

### D2 — Postgres-Migrations + RLS

**Was:** Alle Tabellen aus `01_Datenmodell_Events.md §6` und `02_Kundenprofil_System.md §2.1`.
**Wer:** Claude Code (Template A).
**Files:**
```
backend/migrations/
├── 0001_init_customers.sql
├── 0002_customer_profiles.sql
├── 0003_customer_credentials.sql
├── 0004_customer_hooks.sql
├── 0005_receipts.sql
├── 0006_audit_log.sql
├── 0007_idempotency_keys.sql
├── 0008_processed_events.sql
├── 0009_suppliers_global.sql
└── 0010_rls_policies.sql
backend/src/core/db/
├── pool.ts                    # pg-Pool mit pg-Treiber, kein ORM
├── migrate.ts                 # einfacher Runner (liest *.sql alphabetisch)
└── schemas.ts                 # Re-Exports der TS-Typen aus Zod-Schemas (D4)
```
**Acceptance:**
- [ ] `npm run migrate` läuft idempotent (zweite Ausführung = no-op).
- [ ] Alle Tabellen aus `01 §6` + `02 §2.1` existieren.
- [ ] RLS aktiviert für `receipts`, `customer_profiles`, `customer_credentials`, `audit_log`. Policy: `customer_id = current_setting('pp.customer_id')`.
- [ ] pgcrypto-Extension aktiv (`customer_credentials.ciphertext`).
- [ ] Index-Definitionen aus `01 §6` und `02 §2.1` vorhanden.
- [ ] Migration-Runner schreibt nach `_migrations`-Tabelle und überspringt bereits ausgeführte.

### D3 — HMAC-Auth + Validierungs-Middleware

**Was:** Service-to-Service-Authentifizierung (n8n → Backend) plus Standard-Header-Validierung.
**Wer:** Claude Code (Template C).
**Files:**
```
backend/src/core/auth/
├── hmac.middleware.ts         # X-PP-Signature validieren
├── headers.middleware.ts      # X-Customer-ID, Idempotency-Key, X-Trace-ID
└── auth.types.ts
```
**Acceptance:**
- [ ] HMAC-SHA256 über `<method>\n<path>\n<body-sha256>\n<timestamp>`, Shared Secret aus ENV `PP_HMAC_SECRET`.
- [ ] Replay-Schutz: Timestamp ±300 s, sonst 401.
- [ ] `Idempotency-Key` Pflicht für POST/PUT/DELETE; fehlt → 400 `VALIDATION_FAILED`.
- [ ] `X-Customer-ID` setzt Postgres-Session-Variable `pp.customer_id` (für RLS).
- [ ] `X-Trace-ID` propagiert in Pino-Context; falls fehlt, generiere ULID.
- [ ] Bei `PP_AUTH_DISABLED=1` (nur Dev): Middleware no-op, aber Header werden weiterhin gesetzt.
- [ ] Tests: gültige Signatur 200, falsche 401, alte Timestamp 401, fehlender Header 400.

### D4 — Receipt + CustomerProfile Zod-Schemas

**Was:** Single Source of Truth in TypeScript für alle Datenobjekte.
**Wer:** Claude Code (Template C).
**Files:**
```
backend/src/core/schemas/
├── receipt.schema.ts          # Zod, exportiert Receipt-Type, Status-Enum
├── customer-profile.schema.ts # Zod, package/modules/integrations/routing/custom
├── event.schema.ts            # Zod für pp.* Events
└── index.ts
```
**Acceptance:**
- [ ] `receipt.schema.ts` validiert das Beispiel-JSON aus `01_Datenmodell_Events.md §2.1`.
- [ ] Status-Enum exakt: `received`, `extracting`, `extracted`, `categorizing`, `categorized`, `archiving`, `archived`, `exporting`, `exported`, `completed`, `requires_review`, `error`.
- [ ] `customer-profile.schema.ts` validiert das Beispiel aus `02_Kundenprofil_System.md §2.2`.
- [ ] Schemas exportieren TS-Typen via `z.infer`, die von Modulen importiert werden.
- [ ] `event.schema.ts`: `event_id`, `type`, `schema_version`, `occurred_at`, `customer_id`, `trace_id`, `actor`, `subject`, `data`.
- [ ] Tests: positiv (Beispiel valide), negativ (fehlendes Pflichtfeld → ZodError).

### D5 — Customer-Profile-API (CRUD)

**Was:** REST-Endpoints zum Anlegen/Lesen/Updaten von Customers + Profilen + Credentials.
**Wer:** Claude Code (Template A — eigenes Sub-Modul `_foundation/customer-profiles`).
**Files:**
```
backend/src/modules/_foundation/customer-profiles/
├── routes.ts
├── handlers/
│   ├── create-customer.handler.ts
│   ├── get-profile.handler.ts
│   ├── update-profile.handler.ts
│   └── upsert-credential.handler.ts
├── services/
│   ├── profile.repository.ts   # SELECT/UPDATE customer_profiles + History-Eintrag
│   ├── credential.repository.ts# pgcrypto AES-256-GCM
│   └── profile.cache.ts        # Redis, TTL 60 s
└── tests/
    ├── repository.test.ts
    └── e2e.test.ts
```
**Endpoints:**
- `POST /api/v1/customers` → legt Customer + leeres Profil an
- `GET  /api/v1/customers/:id/profile`
- `PUT  /api/v1/customers/:id/profile` → schreibt History, inkrementiert `profile_version`
- `POST /api/v1/customers/:id/credentials` → Klartext rein, ciphertext raus
- `GET  /api/v1/customers/:id/credentials/:kind` → entschlüsselt nur intern, NIE im API-Response

**Acceptance:**
- [ ] CRUD funktioniert, Validierung via Zod-Schema aus D4.
- [ ] Update schreibt automatisch nach `customer_profile_history`.
- [ ] Profile-Cache invalidiert sich bei Update (Event `pp.customer.profile_updated`).
- [ ] Credential-Endpoints geben **niemals** Klartext zurück, nur `{credential_id, kind, has_value:true}`.
- [ ] RLS-Test: Request mit fremder `X-Customer-ID` sieht keine Daten.

### D6 — Event-Bus (Redis Streams)

**Was:** Producer + Consumer-Helper für `pp.*`-Events nach `01 §4`.
**Wer:** Claude Code (Template C).
**Files:**
```
backend/src/core/events/
├── publisher.ts               # XADD an pp:events:{stream}
├── subscriber.ts              # XREADGROUP, at-least-once
├── streams.ts                 # Stream-Konstanten
└── tests/
    └── publisher-subscriber.test.ts
```
**Acceptance:**
- [ ] `publisher.publish(streamName, event)` → XADD, `event_id` per ULID.
- [ ] `subscriber.subscribe({stream, group, handler})` → XREADGROUP, ACK nach erfolgreichem Handler.
- [ ] Doppelter Konsum: `processed_events`-Tabelle prüft `(consumer_group, event_id)` → kein Re-Processing.
- [ ] Handler-Fehler → kein ACK, Pending-Liste; nach 3 Retries → DLQ-Stream `pp:events:dlq`.
- [ ] Test: 100 Events publizieren, von 2 Consumern konsumieren, alle einmal verarbeitet.
- [ ] Streams aus `01 §4.1` als Konstanten exportiert.

### D7 — n8n-Setup + Backend-Proxy-Pattern

**Was:** n8n-Container läuft, kann Backend authentifiziert ansprechen, Master-Workflow-Stub vorhanden.
**Wer:** Engineer (manuell) + ein kleiner A-Prompt für den Master-Workflow-Stub.
**Files:**
```
n8n/workflows/
├── WF-MASTER-RECEIPT.skeleton.json   # leer mit Trigger + Routing-Call
└── WF-EVENT-LISTENER.skeleton.json   # XREAD von pp:events:receipt
```
**Acceptance:**
- [ ] n8n erreichbar unter `:5678`, persistent Volume.
- [ ] HMAC-Credential `pp-backend-hmac` angelegt.
- [ ] Test-Workflow ruft `GET /health` über HMAC-Proxy → 200.
- [ ] `WF-MASTER-RECEIPT.skeleton.json` importierbar, ruft `POST /api/v1/routing/plan` auf, gibt RoutePlan zurück (kein Modul-Aufruf darin — das kommt erst in M01+).

### D8 — Storage-Service (MinIO + Adapter)

**Was:** Datei-Upload/-Download mit Adapter-Pattern (Phase 1: MinIO; Phase 3: GDrive-Adapter folgt in M02).
**Wer:** Claude Code (Template C).
**Files:**
```
backend/src/core/storage/
├── adapter.interface.ts       # StorageAdapter
├── minio.adapter.ts
├── factory.ts
├── routes.internal.ts         # POST /api/v1/internal/storage/upload, GET /download
└── tests/
    └── minio.adapter.test.ts
```
**Acceptance:**
- [ ] Upload speichert nach `cust_<id>/originals/<yyyy>/<mm>/<sha256>.<ext>`.
- [ ] Download liefert Bytes + Metadata (mime, size, sha256).
- [ ] Object-Key ist deterministisch (gleicher SHA256 → gleicher Key, kein Re-Upload).
- [ ] Pre-Signed URLs für n8n (TTL 5 min).
- [ ] Adapter-Interface ist so geschnitten, dass GDrive-Adapter später ohne Änderung am Caller ergänzt werden kann.

### D9 — Routing-Service

**Was:** Zentrale `planRoute()`-Funktion aus `01 §7`. Nimmt Receipt + Profile, gibt RoutePlan zurück.
**Wer:** Claude Code (Template C).
**Files:**
```
backend/src/modules/_foundation/routing/
├── routes.ts                  # POST /api/v1/routing/plan
├── handlers/
│   └── plan.handler.ts
├── services/
│   ├── route-planner.ts       # die Funktion aus 01 §7
│   └── export-targets.ts      # inferExportTargets()
└── tests/
    └── route-planner.test.ts
```
**Endpoint:** `POST /api/v1/routing/plan` Body: `{ receipt_id }` (lädt Receipt + Profil server-seitig). Response: `{ ok:true, data: RoutePlan }`.
**Acceptance:**
- [ ] Profil mit `modules_enabled=["M01","M02","M07"]` → RoutePlan `[M01, M02, M07]`.
- [ ] Profil mit `package=pro` und Lexoffice + DATEV → Export-Fan-out in `[M05, M04]`.
- [ ] Fehlt ein aktiviertes Modul (z. B. KI ohne `routing.ki_kategorisierung=true`) → wird übersprungen.
- [ ] Idempotent (gleicher Aufruf → gleiches Ergebnis, deterministische Reihenfolge).
- [ ] Tests decken alle 3 Pakete (basic/standard/pro) ab.

### D10 — Logging / Tracing

**Was:** Pino mit JSON-Output, Trace-ID-Propagation überall.
**Wer:** Claude Code (Template C, kann an D3 angehängt werden).
**Files:**
```
backend/src/core/logger.ts          # pino Instance, redaction
backend/src/core/trace.ts           # AsyncLocalStorage für trace_id, customer_id
backend/src/core/logger.middleware.ts
```
**Acceptance:**
- [ ] Jede Log-Zeile hat: `level`, `time`, `trace_id`, `customer_id`, `module`, `msg`.
- [ ] Pino-Redaction für `*.password`, `*.api_key`, `*.ciphertext`, `*.authorization`.
- [ ] `trace_id` aus Header übernommen oder neu generiert (ULID).
- [ ] AsyncLocalStorage so, dass Logs aus Repository-/Service-Layer automatisch `trace_id` haben.
- [ ] Test: Request-Roundtrip, Log-Output enthält die per Header gesendete Trace-ID.

---

## 3. Top-Level Code-Struktur (kanonisch)

```
prozesspilot/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── biome.json
│   ├── vitest.config.ts
│   ├── migrations/                      ← D2
│   ├── src/
│   │   ├── server.ts
│   │   ├── app.ts
│   │   ├── core/
│   │   │   ├── config.ts
│   │   │   ├── logger.ts
│   │   │   ├── trace.ts
│   │   │   ├── auth/                    ← D3
│   │   │   ├── db/                      ← D2
│   │   │   ├── schemas/                 ← D4
│   │   │   ├── events/                  ← D6
│   │   │   ├── storage/                 ← D8
│   │   │   ├── adapters/                ← (für Module: ocr/, booking/, ...)
│   │   │   ├── hooks/                   ← Stub jetzt, befüllt in Phase 2
│   │   │   └── audit/                   ← Stub jetzt, befüllt in Phase 2
│   │   ├── modules/
│   │   │   └── _foundation/
│   │   │       ├── customer-profiles/   ← D5
│   │   │       └── routing/             ← D9
│   │   └── plugins/                     ← leer; Pro-Plugins kommen ab Phase 3
│   └── tests/
├── n8n/
│   └── workflows/                       ← D7 Skeletons
└── infra/
    └── README.md
```

**Kanonische Regeln (verbindlich für alle Module):**
- Modul-Code IMMER unter `backend/src/modules/<scope>/<modul>/`. Scope = `m01-receipt-intake`, `m02-archive`, etc., oder `_foundation` für Querschnittsdienste.
- Wiederverwendbare Bausteine unter `backend/src/core/`. Wer sich mehr als 1 Modul teilt, gehört nach `core/`.
- Kein Modul importiert direkt aus einem anderen Modul — nur über `core/` oder Events.

---

## 4. ENV-Variablen-Katalog (Pflicht in `.env.example`)

| Variable                  | Beispiel                                          | Zweck                                  |
|---------------------------|---------------------------------------------------|----------------------------------------|
| `NODE_ENV`                | `development` \| `production`                     |                                        |
| `PORT`                    | `3000`                                            | Backend HTTP                           |
| `LOG_LEVEL`               | `debug` \| `info`                                 |                                        |
| `DATABASE_URL`            | `postgres://pp:pp@postgres:5432/prozesspilot`     | Postgres                               |
| `REDIS_URL`               | `redis://redis:6379`                              | Streams + Cache                        |
| `MINIO_ENDPOINT`          | `http://minio:9000`                               |                                        |
| `MINIO_ACCESS_KEY`        | `pp`                                              |                                        |
| `MINIO_SECRET_KEY`        | `pp-secret`                                       |                                        |
| `MINIO_BUCKET`            | `prozesspilot-raw`                                |                                        |
| `PP_HMAC_SECRET`          | `<32-byte hex>`                                   | n8n ↔ Backend Signatur                 |
| `PP_HMAC_TIMESTAMP_SKEW`  | `300`                                             | Replay-Fenster Sekunden                |
| `PP_AUTH_DISABLED`        | `1` (nur Dev)                                     | HMAC-Bypass für lokale Tests           |
| `PP_PGCRYPTO_KEY`         | `<32-byte base64>`                                | AES-256-GCM für `customer_credentials` |
| `N8N_BASIC_AUTH_USER`     | `admin`                                           |                                        |
| `N8N_BASIC_AUTH_PASSWORD` | `<random>`                                        |                                        |
| `CLAUDE_API_KEY`          | leer in Dev                                       | erst ab M01/M03                        |
| `GOOGLE_VISION_KEY_FILE`  | leer in Dev                                       | erst ab M01                            |

`PP_AUTH_DISABLED=1` ist NUR in Dev erlaubt. In Production-Compose-Profile muss die Variable `0` oder fehlend sein, sonst startet das Backend nicht.

---

## 5. Sprint-0 Definition of Done

Sprint 0 ist abgeschlossen, wenn folgender End-to-End-Test grün ist:

```bash
# 1. System hochfahren
docker compose up -d

# 2. Migration laufen lassen
cd backend && npm run migrate

# 3. Customer + Profil anlegen
curl -X POST http://localhost:3000/api/v1/customers \
  -H "Idempotency-Key: $(uuidgen)" -H "X-Customer-ID: cust_test" \
  -H "X-PP-Signature: <sig>" \
  -d '{"display_name":"Test","contact_email":"t@x.de","package":"basic","modules_enabled":["M01","M02","M07"]}'

# 4. RoutePlan abrufen (mit dummy receipt_id, Routing nutzt nur das Profil)
curl -X POST http://localhost:3000/api/v1/routing/plan \
  -H "X-Customer-ID: cust_test" \
  -H "X-PP-Signature: <sig>" \
  -d '{"receipt_id":"01HVZTEST..."}'
# → 200, RoutePlan: [M01, M02, M07]

# 5. Event-Bus prüfen
redis-cli XLEN pp:events:customer
# → ≥ 1 (pp.customer.profile_updated wurde publiziert)

# 6. n8n-Test-Workflow ausführen → ruft /health → 200
```

Wenn alle 6 Schritte grün sind: **Sprint 0 fertig, M10 kann starten.**

---

## 6. Reihenfolge der Generierung

```
TAG  DELIVERABLE             PROMPT-TYP   ABHÄNGIG VON
────────────────────────────────────────────────────────
1    D1 Repo-Bootstrap       F (einmalig) —
1    D2 Migrations           A            D1
2    D3 HMAC + Headers       C            D1
2    D4 Zod-Schemas          C            D1
3    D10 Logging/Tracing     C            D1
3    D5 Profile-API          A            D2, D3, D4, D10
4    D6 Event-Bus            C            D1
4    D8 Storage              C            D1
5    D9 Routing-Service      C            D2, D4, D5
5    D7 n8n-Setup            manuell + A  D5, D9
6    Sprint-0 DoD-Check      —            alle
```

D1+D2 an Tag 1, weil ohne Tabellen kein Service. D5 sammelt 4 Vorgänger ein. D7 zum Schluss, weil n8n Backend-Endpoints zum Testen braucht.

---

## 7. Was bewusst weggelassen wird in Sprint 0

- Hook-Runner (nur Stub-Interface; Implementierung kommt in Phase 2 mit M03).
- Audit-Service (nur Stub-Tabelle; Logger reicht für Sprint 0).
- Web-App (kommt in Phase 1 parallel).
- Sentry, Grafana (Phase 4).
- Mail-Service (Phase 2 mit M08).

Keiner dieser Punkte blockiert das MVP. Kommt erst, wenn ein Modul es konkret braucht.
