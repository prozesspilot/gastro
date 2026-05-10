# Sprint 0 — Foundation (ausgefüllte Prompts)

> **Ziel:** Repo + Postgres + Auth + Schemas + Profile-API + Event-Bus + Storage + Routing + Logging stehen, bevor das erste Modul gebaut wird.
> **Vorgehen:** Prompts der Reihe nach abarbeiten. Jeder Prompt ist 1:1 copy-paste-fähig. Nach jedem Prompt: Acceptance Criteria aus `Foundation_Spec.md` abhaken.
> **Spec-Quelle:** [Foundation_Spec.md](../Foundation_Spec.md)

---

## Schritt 1 — Repo-Bootstrap (D1, Template F)

**Wann:** Tag 1, vor allem anderen.
**Voraussetzung:** Leerer Ordner, Git installiert, Docker installiert.
**Erwartete Generations-Zeit:** ~2 Min.
**Erwartete Hand-Setup-Zeit:** ~10 Min (Dateien anlegen, `compose up`).

### Prompt (copy-paste)

```
ROLLE
Senior Engineer im ProzessPilot-Projekt. Du legst ein leeres Repo neu an
nach den Konventionen aus der Architektur-Doku. Keine Business-Logik,
nur Skeleton.

KONTEXT
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/Foundation_Spec.md (Sprint-0-Spec, verbindlich §3 Code-Struktur, §4 ENV, §D1 Acceptance)
3. /Konzeptentwicklung/01_Datenmodell_Events.md §5 (API-Konventionen)

AUFGABE
Generiere ein lauffähiges Repo-Skelett für ProzessPilot exakt nach
Foundation_Spec.md Deliverable D1.

VERBINDLICHE REGELN
- Stack: Node 20, TypeScript strict, Fastify, Vitest, pino, Zod, pg,
  ioredis, @aws-sdk/client-s3 (für MinIO), biome (lint+format).
- KEIN Prisma, KEIN ORM — pg-Treiber direkt.
- docker-compose.yml: Postgres 16, Redis 7, MinIO (Konsole auf :9001),
  n8n self-hosted (auf :5678). Volumes persistent.
- Backend-Skeleton mit /health und /ready (siehe Spec D1 Acceptance).
- HMAC-Middleware nur als STUB: wenn PP_AUTH_DISABLED=1, no-op;
  sonst 501 (Implementierung kommt in D3, nicht hier).
- Pino mit JSON-Output, ein einziger Smoke-Test in tests/smoke.test.ts.
- .env.example enthält ALLE Variablen aus Foundation_Spec §4.
- README.md mit Setup-Schritten (mkdir, install, compose up, migrate, dev).

OUTPUT (in genau dieser Form)
1. Datei-Tree (alphabetisch) aller zu erzeugenden Dateien mit Pfaden
   relativ zum Repo-Root.
2. Pro Datei ein Codeblock mit dem vollständigen Inhalt.
3. Setup-Schritte als nummerierte Liste, die ein Mensch durchführt.
4. Verifikations-Block: 6 manuelle Checks, exakt die 6 Punkte aus
   Foundation_Spec.md §D1 Acceptance.
5. Decisions: was hast du gewählt, wo die Spec mehrdeutig war?

WICHTIG
- Generiere KEINE Migration-SQL, KEINE Module, KEINEN Auth-Code mit
  echter HMAC-Validierung. Das alles macht D2/D3 in eigenen Prompts.
```

### Was du nach diesem Prompt machst

1. Dateien anlegen wie im Datei-Tree, Code reinkopieren.
2. `git init && git add . && git commit -m "Sprint 0: D1 bootstrap"`
3. `cp .env.example .env`
4. `docker compose up -d`
5. `cd backend && npm install && npm run dev`
6. Die 6 Verifikations-Checks aus Foundation_Spec §D1 durchklicken.
7. Bei Fehler: **Template D** (Debug) mit echtem Stacktrace — NICHT neu generieren.

### Decisions notieren
Trag alle `// DECISION:` aus Claudes Output unten ein:
- D1.1: ___
- D1.2: ___

---

## Schritt 2 — Postgres-Migrations + RLS (D2, Template A)

**Wann:** direkt nach D1, gleicher Tag.
**Voraussetzung:** D1 grün, `docker compose up` läuft, `npm run migrate` ist als Skript registriert (Skeleton aus D1).

### Prompt (copy-paste)

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / pg) in ProzessPilot.
Du implementierst genau das, was in der angehängten Spec steht —
keine Erfindungen, keine Auslassungen.

KONTEXT
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md §6 (Postgres-Schema-Auszug)
3. /Konzeptentwicklung/02_Kundenprofil_System.md §2.1 (Profil-Tabellen)
4. /Konzeptentwicklung/Foundation_Spec.md §D2 (Verbindliche Acceptance)

AUFGABE
Generiere die Migration-SQL-Dateien und den Migration-Runner exakt nach
Foundation_Spec.md Deliverable D2.

VERBINDLICHE REGELN
- Tabellen aus 01_Datenmodell_Events.md §6:
    customers, customer_profiles, customer_credentials, receipts,
    audit_log, idempotency_keys, processed_events
- Tabellen aus 02_Kundenprofil_System.md §2.1:
    customer_profile_history, customer_hooks
- Tabelle aus M01-Spec §11 (vorgreifend, schadet nicht):
    suppliers_global
- pgcrypto-Extension aktivieren (für customer_credentials.ciphertext).
- RLS aktivieren für: receipts, customer_profiles, customer_credentials,
  audit_log. Policy: customer_id = current_setting('pp.customer_id', true).
- Indizes wie in den Quell-Specs spezifiziert.
- Migration-Runner liest backend/migrations/*.sql alphabetisch, führt
  jede in einer Transaktion aus, schreibt nach _migrations(filename, applied_at).
  Idempotent: bereits angewandte Dateien werden übersprungen.
- Datei-Reihenfolge wie in Foundation_Spec §D2 Files.

OUTPUT
1. Datei-Liste mit Pfaden.
2. Vollständiger Inhalt jeder Migration-SQL.
3. backend/src/core/db/pool.ts und migrate.ts vollständig.
4. backend/src/core/db/schemas.ts: leere Re-Export-Datei (wird in D4 gefüllt).
5. backend/package.json-Patch: Skript "migrate": "tsx src/core/db/migrate.ts".
6. Tests: backend/tests/migrations.test.ts — startet Pool, ruft Runner
   zweimal auf, erwartet beim zweiten Mal 0 angewandte Migrations.
7. Verifikations-Block: 6 Punkte aus Foundation_Spec §D2 Acceptance, je
   mit Datei-/Test-Referenz.
8. Decisions.
```

### Was du nach diesem Prompt machst

1. Dateien anlegen, Code reinkopieren.
2. `npm run migrate` → erste Ausführung wendet alle Migrations an.
3. `npm run migrate` nochmal → 0 neue (Idempotenz-Check).
4. `npm test -- migrations` → grün.
5. `psql $DATABASE_URL -c "\dt"` → alle Tabellen sichtbar.
6. `psql $DATABASE_URL -c "SELECT extname FROM pg_extension"` → enthält pgcrypto.
7. RLS-Test: `SELECT * FROM receipts;` als pp-User → 0 Zeilen (RLS aktiv, kein customer_id gesetzt).

### Bei roten Tests → Template D mit Stacktrace.

---

## Schritt 3 — HMAC-Auth + Header-Middleware (D3, Template C)

**Wann:** Tag 2 morgens.
**Erwartete Zeit:** 1 Prompt + 1–2 Debug-Runden.

### Prompt (copy-paste)

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / Fastify) in ProzessPilot.

KONTEXT
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md §5.2/§5.3/§5.4/§5.5
3. /Konzeptentwicklung/Foundation_Spec.md §D3 (Acceptance)

AUFGABE
Implementiere zwei Fastify-Plugins:
  a) HMAC-SHA256-Validierung des Headers X-PP-Signature.
  b) Pflicht-Header-Validierung (Idempotency-Key, X-Customer-ID, X-Trace-ID).

ENDPOINT-SIGNATUREN
Diese Plugins werden in app.ts an alle /api/v1/*-Routen registriert.

DETAIL HMAC
- Signatur über: <method UPPER>\n<path>\n<sha256(body)>\n<unix_timestamp>
- Header X-PP-Signature: "v1=<hex>"
- Header X-PP-Timestamp: Unix-Sekunden, ±300 s Toleranz (PP_HMAC_TIMESTAMP_SKEW).
- Secret aus ENV PP_HMAC_SECRET.
- Bei Bypass (PP_AUTH_DISABLED=1, NUR wenn NODE_ENV!==production): no-op.

DETAIL HEADER-MIDDLEWARE
- Idempotency-Key Pflicht für POST/PUT/DELETE; sonst 400 VALIDATION_FAILED.
- X-Customer-ID Pflicht; setzt Postgres-Session via SET LOCAL pp.customer_id
  in einem Request-Scoped Hook (per AsyncLocalStorage erreichbar).
- X-Trace-ID übernehmen oder generieren (ULID); in pino-Context.
- Standard-Error-Format aus 01_Datenmodell_Events.md §5.4.

VERBINDLICHE REGELN
- Datei-Pfade exakt nach Foundation_Spec §D3:
    backend/src/core/auth/hmac.middleware.ts
    backend/src/core/auth/headers.middleware.ts
    backend/src/core/auth/auth.types.ts
- Tests: backend/src/core/auth/hmac.middleware.test.ts
         backend/src/core/auth/headers.middleware.test.ts
- Loggen aller Auth-Failures mit pino (level=warn, ohne Body).

OUTPUT
1. Datei-Liste.
2. Vollständiger Code je Datei.
3. cURL-Beispiele: gültige Signatur (200), falsche Signatur (401),
   alte Timestamp (401), fehlender Idempotency-Key (400).
4. Verifikation: 7 Punkte aus Foundation_Spec §D3 Acceptance.
5. Decisions.
```

### Was du nach diesem Prompt machst

1. Code einbauen, Plugins in `app.ts` registrieren.
2. `npm test -- auth` → grün.
3. cURL-Beispiele aus Output durchprobieren.

---

## Schritt 4 — Receipt + CustomerProfile Zod-Schemas (D4, Template C)

```
ROLLE
Senior Backend Engineer (TypeScript / Zod) in ProzessPilot.

KONTEXT
1. /Konzeptentwicklung/01_Datenmodell_Events.md §2 (Receipt komplett)
2. /Konzeptentwicklung/02_Kundenprofil_System.md §2.2 (CustomerProfile-Beispiel)
3. /Konzeptentwicklung/Foundation_Spec.md §D4

AUFGABE
Erstelle Zod-Schemas, die als Single Source of Truth für TypeScript-Typen
und Runtime-Validierung dienen.

DATEIEN (Pfade exakt nach Spec)
- backend/src/core/schemas/receipt.schema.ts
- backend/src/core/schemas/customer-profile.schema.ts
- backend/src/core/schemas/event.schema.ts
- backend/src/core/schemas/index.ts

VERBINDLICHE REGELN
- z.infer<>-Types werden exportiert mit Namen Receipt, CustomerProfile, PpEvent.
- Status-Enum für Receipt: received, extracting, extracted, categorizing,
  categorized, archiving, archived, exporting, exported, completed,
  requires_review, error.
- Currency: ISO-4217 (EUR, USD, ...) — Default EUR.
- Tax-Rates: number 0..1 (also 0.19 für 19 %, NICHT 19).
- ULIDs als z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).
- Customer-IDs als z.string().regex(/^cust_[a-z0-9]{6,}$/).
- snake_case in JSON, camelCase NUR in TS-Variablen (siehe Spec §1).

OUTPUT
1. Datei-Liste.
2. Vollständiger Zod-Code je Datei.
3. Test-Datei backend/src/core/schemas/schemas.test.ts:
   a) Beispiel-Receipt aus 01_Datenmodell §2.1 → parse erfolgreich.
   b) Beispiel-Profil aus 02_Kundenprofil §2.2 → parse erfolgreich.
   c) je 3 negative Tests (fehlende Pflichtfelder).
4. Verifikation: 6 Punkte aus Foundation_Spec §D4.
5. Decisions.
```

---

## Schritt 5 — Logging / Tracing (D10, Template C)

```
ROLLE
Senior Backend Engineer (TypeScript / pino / Fastify) in ProzessPilot.

KONTEXT
1. /Konzeptentwicklung/Foundation_Spec.md §D10
2. /Konzeptentwicklung/01_Datenmodell_Events.md §5.3 (Header)

AUFGABE
Erweitere das Skeleton-Logging zu Production-Quality.

DATEIEN
- backend/src/core/logger.ts (ersetzt Skeleton)
- backend/src/core/trace.ts (AsyncLocalStorage-Wrapper)
- backend/src/core/logger.middleware.ts
- backend/src/core/trace.test.ts

VERBINDLICHE REGELN
- pino mit JSON-Output, level aus ENV LOG_LEVEL.
- Pino-Redaction für: *.password, *.api_key, *.ciphertext,
  *.authorization, "headers.x-pp-signature".
- AsyncLocalStorage hält {trace_id, customer_id, module}.
- logger.child() bekommt diese Felder automatisch in Sub-Komponenten.
- Fastify-Hook (onRequest) → ALS-Run mit trace_id aus Header oder neu (ULID).
- Module setzen ihren module-Namen via wrapModule('m01').

OUTPUT
1. Datei-Liste.
2. Code je Datei.
3. Verifikation: 5 Punkte aus Foundation_Spec §D10.
4. Decisions.
```

---

## Schritt 6 — Customer-Profile-API CRUD (D5, Template A)

**Voraussetzung:** D2, D3, D4, D10 grün.

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / Fastify / pg) in ProzessPilot.

KONTEXT (Pflicht-Lesen)
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md §5
3. /Konzeptentwicklung/02_Kundenprofil_System.md (komplett)
4. /Konzeptentwicklung/Foundation_Spec.md §D5

AUFGABE
Implementiere das _foundation/customer-profiles-Modul: CRUD-API für
Customers + Profile + Credentials, plus Profile-Cache, plus
History-Tracking.

VERBINDLICHE REGELN
- Datei-Layout exakt nach Foundation_Spec §D5 Files.
- Endpoints exakt:
    POST /api/v1/customers
    GET  /api/v1/customers/:id/profile
    PUT  /api/v1/customers/:id/profile
    POST /api/v1/customers/:id/credentials
    GET  /api/v1/customers/:id/credentials/:kind
- Profile-Update inkrementiert profile_version, schreibt nach
  customer_profile_history, publiziert Event pp.customer.profile_updated
  auf Stream pp:events:customer (Stub-Publisher reicht — D6 ersetzt ihn).
- Credentials: pgcrypto-Verschlüsselung mit Schlüssel aus ENV PP_PGCRYPTO_KEY.
- Credential-API gibt NIEMALS Klartext im Response, nur {credential_id, kind, has_value:true}.
- Profile-Cache: ioredis, Key cust:{id}:profile, TTL 60 s.
- Validierung mit Zod-Schemas aus D4.
- RLS-Test: Request mit fremder X-Customer-ID → 0 Zeilen.

OUTPUT
1. Datei-Liste.
2. Vollständiger Code je Datei.
3. Verifikation: 5 Punkte aus Foundation_Spec §D5 Acceptance.
4. Decisions.
```

---

## Schritt 7 — Event-Bus (D6, Template C)

```
ROLLE
Senior Backend Engineer (TypeScript / ioredis / Redis Streams) in ProzessPilot.

KONTEXT
1. /Konzeptentwicklung/01_Datenmodell_Events.md §4 (Event-System)
2. /Konzeptentwicklung/Foundation_Spec.md §D6

AUFGABE
Implementiere Producer + Consumer-Helper für pp.*-Events.

DATEIEN
- backend/src/core/events/publisher.ts
- backend/src/core/events/subscriber.ts
- backend/src/core/events/streams.ts
- backend/src/core/events/publisher-subscriber.test.ts

VERBINDLICHE REGELN
- publisher.publish(stream, event) → XADD; event_id = ULID, occurred_at = now().
- subscriber.subscribe({ stream, group, handler, batchSize=50, blockMs=5000 })
  → XREADGROUP, ACK nach erfolgreichem Handler.
- Idempotenz: vor handler-Aufruf check INSERT INTO processed_events
  ON CONFLICT DO NOTHING; bei conflict → ACK ohne Re-Run.
- Retry: 3× bei Handler-Throw; danach XADD an pp:events:dlq.
- Streams aus 01 §4.1 als Konstanten:
    PP_STREAM_RECEIPT, PP_STREAM_CUSTOMER, PP_STREAM_EXPORT, PP_STREAM_SYSTEM, PP_STREAM_DLQ.
- Graceful shutdown: laufende Konsumenten warten auf inflight ACKs.

OUTPUT
1. Code je Datei.
2. Test, der 100 Events publishes, von 2 Consumern aus derselben Group
   konsumiert, am Ende: jeder Event genau einmal verarbeitet.
3. Verifikation: 6 Punkte aus Foundation_Spec §D6.
4. Decisions.
```

---

## Schritt 8 — Storage-Service MinIO (D8, Template C)

```
ROLLE
Senior Backend Engineer (TypeScript / @aws-sdk/client-s3) in ProzessPilot.

KONTEXT
1. /Konzeptentwicklung/Foundation_Spec.md §D8
2. /Konzeptentwicklung/00_Architektur_Hauptdokument.md (Adapter-Pattern)

AUFGABE
Storage-Service mit Adapter-Pattern (MinIO als erste Implementation,
Drive/Dropbox folgen in M02).

DATEIEN
- backend/src/core/storage/adapter.interface.ts
- backend/src/core/storage/minio.adapter.ts
- backend/src/core/storage/factory.ts
- backend/src/core/storage/routes.internal.ts
- backend/src/core/storage/minio.adapter.test.ts

INTERFACE (verbindlich)
  interface StorageAdapter {
    upload(input: { customerId, bytes, mimeType, suggestedExt? }): Promise<{ object_key, sha256, size_bytes }>;
    download(object_key): Promise<{ bytes, mime_type, size_bytes }>;
    presign(object_key, ttlSeconds): Promise<{ url }>;
  }

VERBINDLICHE REGELN
- Object-Key: cust_<id>/originals/<yyyy>/<mm>/<sha256>.<ext>
- Deterministisch: gleicher SHA256 → gleicher Key (Re-Upload no-op).
- Pre-Signed URLs für GET via @aws-sdk/s3-request-presigner.
- Internal-Routes unter /api/v1/internal/storage/* — NUR per HMAC erreichbar.
- Bucket aus ENV MINIO_BUCKET, auto-create on startup falls fehlt.

OUTPUT
1. Code je Datei.
2. Test: Upload zweimal mit gleichem Inhalt → gleicher object_key, kein 2. Write.
3. Verifikation: 5 Punkte aus Foundation_Spec §D8.
4. Decisions.
```

---

## Schritt 9 — Routing-Service (D9, Template C)

**Voraussetzung:** D5 (Profile-API) liefert Profile.

```
ROLLE
Senior Backend Engineer (TypeScript / Fastify / pg) in ProzessPilot.

KONTEXT
1. /Konzeptentwicklung/01_Datenmodell_Events.md §7 (Routing-Logik)
2. /Konzeptentwicklung/02_Kundenprofil_System.md §2.2 (Profil-Felder, modules_enabled, routing.*)
3. /Konzeptentwicklung/Foundation_Spec.md §D9

AUFGABE
Implementiere _foundation/routing-Modul mit POST /api/v1/routing/plan.

DATEIEN (exakt nach Foundation_Spec §D9)
- backend/src/modules/_foundation/routing/routes.ts
- backend/src/modules/_foundation/routing/handlers/plan.handler.ts
- backend/src/modules/_foundation/routing/services/route-planner.ts
- backend/src/modules/_foundation/routing/services/export-targets.ts
- backend/src/modules/_foundation/routing/services/route-planner.test.ts

VERBINDLICHE REGELN
- planRoute(receipt, profile) → RoutePlan (Reihenfolge wichtig).
- Reihenfolge: M01 → (M03 falls aktiv) → M02 → Export-Fan-out (M04..M07).
- Export-Fan-out aus profile.integrations + modules_enabled inferieren:
    profile.integrations.booking.provider==='lexoffice' && M05 enabled → M05
    booking.provider==='sevdesk' && M06 enabled → M06
    profile.integrations.spreadsheet.* && M07 enabled → M07
    package==='pro' && profile.integrations.datev.* && M04 enabled → M04
- Endpoint nimmt {receipt_id} im Body, lädt Receipt + Profil (via D5 Cache),
  ruft planRoute, gibt RoutePlan zurück.
- Wenn Receipt nicht existiert → 404 NOT_FOUND.
- Idempotent: gleicher Aufruf → gleicher RoutePlan.

OUTPUT
1. Code je Datei.
2. Tests: 3 Profile (basic, standard, pro) → erwarteter RoutePlan.
3. Verifikation: 5 Punkte aus Foundation_Spec §D9.
4. Decisions.
```

---

## Schritt 10 — n8n-Setup + Master-Workflow-Stub (D7, manuell + Template B)

### 10.1 Manuelle Schritte (Engineer)

1. n8n öffnen unter `http://localhost:5678`, Login mit `N8N_BASIC_AUTH_USER/PASSWORD` aus `.env`.
2. Credentials → New → "HTTP Header Auth", Name `pp-backend-hmac`, Header `X-PP-Signature` (Wert wird per Code-Node gesetzt — Credential dient nur zur Speicherung des Shared-Secrets als HTTP-Header-Auth-Eintrag).
3. Globale Variable `BACKEND_URL=http://backend:3000` setzen.
4. Test: ein leerer Workflow mit HTTP-Node `GET {{$env.BACKEND_URL}}/health` → 200.

### 10.2 Prompt (Template B, ausgefüllt)

```
ROLLE
n8n-Spezialist im Projekt ProzessPilot. Dünne Orchestrierung,
Backend-HTTP-Calls, keine Business-Logik in n8n.

KONTEXT
1. /Konzeptentwicklung/03_n8n_Workflows.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md §2 (Receipt-Schema)
3. /Konzeptentwicklung/Foundation_Spec.md §D7

AUFGABE
Erzeuge zwei n8n-Workflow-Skelette als importierbares JSON:

  a) WF-MASTER-RECEIPT.skeleton.json
     - Trigger: Execute Workflow (Sub-Workflow), Schema-Eingang { receipt_id, customer_id, trace_id }
     - HTTP-Node "Backend: PlanRoute": POST {{$env.BACKEND_URL}}/api/v1/routing/plan
       Headers: Idempotency-Key (UUID), X-Customer-ID, X-Trace-ID, X-PP-Signature
     - Code-Node "Build: Plan-Iterator": durchläuft data.steps Array
     - Switch-Node "Route: by-module": je Modul ein Output (M01, M02, ...)
       — alle Outputs zeigen vorerst auf "Set: NotImplemented" (HTTP 501-ähnlich)
     - Respond to Workflow

  b) WF-EVENT-LISTENER.skeleton.json
     - Trigger: Schedule (alle 5 s)
     - HTTP-Node "Redis: XREAD" gegen Backend-Internal-Endpoint
       (POST /api/v1/internal/events/poll mit { stream, group, batchSize })
       — Backend-Endpoint existiert noch nicht; im Workflow als Stub markieren.
     - Switch-Node "Route: by-event-type"
     - Pro Branch: Sub-Workflow-Aufruf-Stub (kommt später)

VERBINDLICHE REGELN
- Beide Workflows sind explizit "Skeleton" — kein Modul-Aufruf darin,
  nur die Verkabelung steht.
- HMAC-Signatur über einen Function-Node berechnen (sha256 des Bodys),
  Secret aus n8n-Env-Variable PP_HMAC_SECRET.
- Retry: 3× bei 5xx, kein Retry bei 4xx.

OUTPUT
1. Beide JSON-Dateien (n8n-Export-Format, importierbar).
2. Setup-Schritte: ENV PP_HMAC_SECRET in n8n setzen, Workflows importieren,
   Smoke-Test (manueller Trigger mit Dummy-Receipt-ID, prüfe dass
   PlanRoute aufgerufen wird).
3. Decisions.
```

### 10.3 Was du nach diesem Schritt machst

1. JSONs in n8n importieren.
2. Vorher in D5/D9 einen Test-Customer + Profil + Test-Receipt anlegen.
3. WF-MASTER-RECEIPT manuell triggern → erwartet RoutePlan-Response, danach Switch zeigt "NotImplemented".
4. Foundation_Spec §D7 Acceptance: alle 4 Punkte grün.

---

## Schritt 11 — Sprint-0 DoD-Check

End-to-End-Test laut Foundation_Spec §5. Alle 6 Schritte grün?
- [ ] `docker compose up -d`
- [ ] `npm run migrate`
- [ ] Customer + Profil per cURL anlegen
- [ ] RoutePlan abrufen → `[M01, M02, M07]`
- [ ] `redis-cli XLEN pp:events:customer` ≥ 1
- [ ] n8n-Test-Workflow ruft Backend → 200

**Wenn ja: Sprint 0 fertig. M10 kann starten.**

---

## Decisions-Log (über alle Schritte hinweg)

Nach jedem Schritt hier eintragen, was Claude mit `// DECISION:` markiert hat:

| Schritt | Decision-ID | Entscheidung | Begründung |
|---------|-------------|--------------|------------|
| D1      |             |              |            |
| D2      |             |              |            |
| D3      |             |              |            |
| D4      |             |              |            |
| D5      |             |              |            |
| D6      |             |              |            |
| D7      |             |              |            |
| D8      |             |              |            |
| D9      |             |              |            |
| D10     |             |              |            |

Am Ende von Sprint 0: alle Decisions in die jeweiligen Spec-Dateien zurückspielen (z. B. neuer §"Implementation Notes" am Ende von Foundation_Spec.md).
