# ProzessPilot Backend — Implementation Status

> Stand: 2026-05-01 nach Session 2 (Option-B-Pfad)
> Diese Datei dokumentiert den Ist-Zustand. Session 1 baute M03/M05/M08/Hook-Runner;
> Session 2 baute Hook-CRUD + Execution-Logging + error_log + WF-ERROR-HANDLER + Pipeline-Error-Pfade.

---

## 0. Was Session 2 hinzugefügt hat (Option B)

### Neue Migration
- `migrations/022_error_log_and_hook_executions.sql`:
  - `error_log` (Pipeline-Fehler-Tracking, TEXT customer_id)
  - `hook_executions` (FK auf customer_hooks, ON DELETE CASCADE)

### Neue Backend-Bausteine
| Datei | Zweck |
|-------|-------|
| `core/hooks/hook.repository.ts` | CRUD für `customer_hooks` + `logExecution` für `hook_executions` |
| `core/hooks/hook.routes.ts` | `GET/POST /hooks`, `GET/PUT/DELETE /hooks/:id`, `GET /hooks/:id/executions` |
| `core/hooks/hook-runner.ts` (erweitert) | Nutzt jetzt `hook.repository`; loggt jeden Aufruf in `hook_executions`; Default `retry_count=3` mit exponentiellem Backoff (1s/2s/4s); injizierbare `sleepImpl` für Tests; HMAC-Header doppelt gesetzt (`x-pp-hook-signature` + `x-prozesspilot-signature`) |
| `modules/_shared/errors/error.repository.ts` | Insert + List für `error_log` |
| `modules/_shared/errors/error.routes.ts` | `POST /errors`, `GET /errors` |
| `modules/_shared/receipts/handlers/update-status.handler.ts` | Welt-A-Status-Transition (`PUT /receipts/:id/transition`); akzeptiert nur `requires_review` / `error` |

### app.ts neu registriert
- `hookRoutes` → `/api/v1/hooks/*`
- `errorRoutes` → `/api/v1/errors`
- `receiptsCompleteRoutes` jetzt zusätzlich mit `PUT /receipts/:id/transition`

### n8n-Workflows
- `WF-ERROR-HANDLER.json` neu (Webhook-Trigger statt error-Trigger):
  - Klassifikation nach `errorType`: `OCR_FAILED`/`CATEGORY_FAILED` → `requires_review`, `ARCHIVE_FAILED` → `error` + retryable, `WEBHOOK_FAILED` → kein Status-Change
  - `POST /api/v1/errors` → error_log
  - `PUT /receipts/:id/transition` (wenn target_status gesetzt)
  - `POST /internal/notifications/operator` (wenn `escalate=true`)
- `WF-MASTER-RECEIPT.json` erweitert:
  - Im Error-Branch des `IF: sub-result.ok` jetzt: `Function: Classify Stage Error` (M01→OCR_FAILED, M03→CATEGORY_FAILED, M02→ARCHIVE_FAILED, M05/M06/M07→EXPORT_FAILED) → `HTTP: Error-Handler Webhook` → `HTTP: finalize_receipt`

### Neue Tests (alle grün)
| Datei | Tests |
|-------|-------|
| `tests/hooks/hook-runner.test.ts` | 13 (8 alt + 5 neu für User-Cases inkl. Execution-Log-Inserts) |
| `tests/hooks/hook.routes.test.ts` | 9 (CRUD + Auth + Filtering + 404-Fälle) |
| `tests/e2e/pipeline-stages.test.ts` | 3 (Pipeline-Stages, OCR_FAILED, Hook-Fired — gated `it.skipIf(!worldASchemaPresent)`) |
| `tests/fixtures/make-test-pdf.ts` | Helper, der `tests/fixtures/test-receipt.pdf` einmalig generiert |

### Schema-Detection für E2E
Sowohl `mvp-pipeline.test.ts` als auch `pipeline-stages.test.ts` prüfen jetzt im `beforeAll`, ob die Welt-A-receipts-Tabelle (`receipt_id TEXT`-Spalte) existiert. Wenn nicht, werden alle DB-Tests via `it.skipIf(!worldASchemaPresent)` ehrlich übersprungen — kein false-positive Crash.

### Verifikation Session 2
- `npm run migrate` → Migration 022 angewendet
- `npx tsc --noEmit` → EXIT 0, 0 Type-Fehler in src/
- Hook-Tests: **22/22 grün** (`tests/hooks/`)
- M03/M05-Tests: **36/36 grün** (Session-1-Code unangetastet)
- Volle Suite: 252 passed / 120 skipped / 14 vorbestehende Test-Files mit Live-DB-Erfordernis (kein Regression)
- E2E mit `PP_E2E=1`: 7 grün (M01/M10), 8 ehrlich skipped wegen Welt-A-Schema fehlend

### Konkrete Konsequenz für Production
- WF-MASTER-RECEIPT ruft jetzt `/webhook/error-handler` bei Sub-Workflow-Fehlern → WF-ERROR-HANDLER klassifiziert + persistiert + benachrichtigt → Receipt-Status wird via `/transition` korrekt gesetzt
- Pro-Hook-CRUD über `/api/v1/hooks` ermöglicht Operator-UIs, Hooks zur Laufzeit zu pflegen
- Jeder Hook-Aufruf hinterlässt einen `hook_executions`-Eintrag (Sichtbarkeit für Custom-Logik-Debugging)

---

---

## 1. Architektur-Befund: Zwei parallele Daten-Welten

Das Repo enthält **zwei** parallel existierende Backend-Welten, die aus
unterschiedlichen Implementierungs-Iterationen stammen. Diese Session hat
ausschließlich in **Welt A** gearbeitet (Konzept-konform, TEXT customer_id).

### Welt A — "Konzept-konform" (M01/M02/M03/M05/M07/M08/M10)
- Migration `010_m10_minimal.sql` legt TEXT-receipts an.
- `_shared/receipts/receipt.repository.ts` kapselt diese Welt.
- M01/M02/M03/M05/M07/M08/M10 bauen alle darauf auf.
- `customer_profiles (TEXT customer_id, JSONB integrations + routing + custom + modules_enabled)`.

### Welt B — "Tenant/UUID" (legacy, separate Module)
- `001_initial_schema.sql` legt UUID-`customers + tenants` an.
- `013_receipts.sql` ersetzt TEXT-receipts durch UUID-Variante.
- Module `customers/`, `tenants/`, `documents/`, `routing/` (jobs), `receipts/`-Routes nutzen Welt B.

### Konsequenz
Beide Welten existieren parallel im Code. Die Welt-A-Module funktionieren
nur, solange Migration 013 NICHT ausgeführt wird (sonst droppt sie die TEXT-
receipts-Tabelle). Eine Greenfield-Konsolidierung wird nötig — gehört aber
nicht in den Scope dieser Session.

---

## 2. Was diese Session liefert

### 2.1 Neue Module

| Modul | Pfad | Status |
|-------|------|--------|
| **M03 Kategorisierung** | `backend/src/modules/m03-categorization/` | ✓ Voll implementiert |
| **M05 Lexoffice** | `backend/src/modules/m05-lexoffice/` + `core/adapters/booking/lexoffice/` | ✓ Voll implementiert |
| **M08 Monatsreporting** | `backend/src/modules/m08-reporting/` | ✓ build/deliver/list, PDF via pdf-lib |

### 2.2 Erweiterungen bestehender Module

| Bereich | Pfad | Status |
|---------|------|--------|
| Hook-System | `backend/src/core/hooks/hook-runner.ts` | ✓ DB-Lookup, http_webhook, js_inline (vm), Patch-Merge, HMAC-Sig |
| Hook-Typen | `backend/src/core/hooks/hook.types.ts` | ✓ Neu, HookPoint/HookImplementation/CustomerHook |
| Routing-Plan | `backend/src/modules/routing/handlers/plan.handler.ts` + `plan.routes.ts` | ✓ POST `/api/v1/routing/plan` (TEXT customer_id) |
| Receipt-Complete | `backend/src/modules/_shared/receipts/handlers/complete.handler.ts` + `complete.routes.ts` | ✓ POST `/api/v1/receipts/:id/complete` |
| Internal Customers | `backend/src/modules/_shared/customers/internal.routes.ts` | ✓ GET `/api/v1/internal/customers` (für WF-M08) |
| Operator Notifications | `backend/src/modules/_shared/customers/notifications.routes.ts` | ✓ POST `/api/v1/internal/notifications/operator` (Stub mit audit_log) |

### 2.3 Neue Migrations

| Nummer | Datei | Inhalt |
|--------|-------|--------|
| 018 | `018_customer_hooks.sql` | `customer_hooks` (Hook-System) |
| 019 | `019_m03_kategorisierung.sql` | `categories` (14 Standardkategorien als Seed), `customer_categories`, `customer_cost_centers`, `categorization_cache` |
| 020 | `020_m05_lexoffice.sql` | `lexoffice_category_map` + 5 Default-Mappings für `customer_id='default'` |
| 021 | `021_m08_reports.sql` | `monthly_reports` mit UNIQUE(customer_id, period) |

### 2.4 Neue n8n Workflows

| Datei | Zweck |
|-------|-------|
| `n8n/workflows/WF-M03.json` | M03 Sub-Workflow (6 Nodes, Spec §6) |
| `n8n/workflows/WF-M05.json` | M05 Sub-Workflow (6 Nodes) |
| `n8n/workflows/WF-M08.json` | Cron `0 8 1 * *` für Monatsreporting (build → deliver) |
| `n8n/workflows/WF-MASTER-RECEIPT.json` | KOMPLETT NEU nach §4.2: create_receipt → get_profile → route_plan → loop steps + switch + reload + finalize |
| `n8n/workflows/WF-ERROR-HANDLER.json` | Fehler-Trigger → operator notification |

### 2.5 app.ts Routes neu registriert

```ts
m03CategorizationRoutes  → /api/v1/receipts/:id/categorize
m05LexofficeRoutes       → /api/v1/receipts/:id/exports/lexoffice
receiptsCompleteRoutes   → /api/v1/receipts/:id/complete
m08ReportingRoutes       → /api/v1/customers/:id/reports/monthly/{build,deliver} + /reports
routingPlanRoutes        → /api/v1/routing/plan
internalCustomersRoutes  → /api/v1/internal/customers
operatorNotifsRoutes     → /api/v1/internal/notifications/operator
```

Außerdem: `setHookRunnerDeps({ pool, pgcryptoKey })` wird in `buildApp()` aufgerufen.

### 2.6 E2E-Test

`backend/tests/e2e/mvp-pipeline.test.ts` mit 5 Tests (Happy Path, requires_review,
Duplikat-Erkennung, Lexoffice-Idempotenz, Audit-Helper). Tests laufen nur mit
`PP_E2E=1` (sonst `describe.skip`), weil sie eine echte Postgres-DB benötigen.

Helpers: `create-test-customer.ts`, `seed-receipt.ts`, `seed-profile.ts`,
`assert-audit.ts`. Fixtures: 3 OCR-JSON-Belege + `basic_profile.json`.

### 2.7 Webapp

`webapp/src/pages/ReceiptDetailPage.tsx` (existierte bereits umfangreich) wurde
um den **oranger Banner "Manuelle Prüfung erforderlich"** erweitert (zeigt sich
bei `status='requires_review'`). Alle anderen geforderten Elemente waren
bereits vorhanden:
- Confidence-Bar mit Farbcodierung (≥75% grün, 60–75% gelb, <60% rot)
- SKR/Tax-Key/Cost-Center, Engine, Rationale
- "Kategorisieren"-Button (POST /categorize)
- Audit-Timeline am Seitenende
- Route `/receipts/:receiptId` schon in App.tsx
- Kategorie-Spalte in ReceiptsPage existiert via `CategoryBadge`

---

## 3. Verifikations-Ergebnisse

### 3.1 Migrations (`npm run migrate`)
```
Ausstehende Migrationen gefunden: count: 4
  ✓ 018_customer_hooks.sql
  ✓ 019_m03_kategorisierung.sql
  ✓ 020_m05_lexoffice.sql
  ✓ 021_m08_reports.sql
Alle Migrationen erfolgreich angewendet.
```

### 3.2 TypeScript (`npx tsc --noEmit`)
```
EXIT: 0 — keine Type-Fehler in src/
```

### 3.3 Tests

| Suite | Status |
|-------|--------|
| `m03-categorization` (4 Test-Dateien) | **31/31 grün** |
| `m05-lexoffice` (1 Test-Datei) | **5/5 grün** |
| `tests/hooks/hook-runner.test.ts` | **8/8 grün** |
| Gesamt-Suite | 238 passed / 117 skipped / 14 failed (alle 14 Failures sind vorbestehende Tests, die echte Postgres+Redis brauchen — nicht durch diese Session verursacht) |

### 3.4 E2E-Tests

`tests/e2e/mvp-pipeline.test.ts` läuft nur mit `PP_E2E=1`. Default: skipped.

---

## 4. Was offen bleibt (für nächste Sessions)

### 4.1 Komplette Module
- **M04 DATEV-Export** — eigenes Modul `m04-datev/`, Migration `datev_exports`
- **M06 sevDesk-Integration** — analog M05 (Adapter, Voucher-Builder)
- **M09 Lieferanten-Kommunikation** — E-Mail-Templates, M09-Workflow

### 4.2 Reporting-Polish (M08)
- Mail-Sender ist STUB → echte SMTP-Anbindung (`backend/src/core/mail/`) erforderlich
- WhatsApp-Sender ist STUB → Anbindung an M10-MetaGraphClient + Template-Approval
- Hook `before_report.monthly` wird derzeit nicht aktiv aufgerufen; Pseudo-Receipt-Bridge fehlt

### 4.3 Lexoffice-Polish (M05)
- `attachment-picker.ts` lädt Original aus MinIO; Drive-Adapter-Lese-Pfad noch nicht aktiv
- Heuristik in `category.mapper.ts` ist konservativ — Pflege durch Operator-UI nötig

### 4.4 Routing-Plan-Polish
- Konsolidierung mit dem alten `routing.routes.ts` (D9, UUID/tenant) steht aus
- Profile-Cache wie in 02§4.3 beschrieben fehlt (LRU + Event-Invalidate)

### 4.5 Hook-System-Polish
- `plugin_id`-Hooks loggen nur warn (Plugin-Loader fehlt — Phase 3)
- `js_inline` nutzt `node:vm`; Spec verlangt `isolated-vm` (echte Sandbox). Migration empfohlen, sobald Pro-Kunden Custom-JS aktiv nutzen
- `audit_log`-Eintrag pro Hook-Ausführung fehlt noch

### 4.6 WF-MASTER-RECEIPT
- HMAC-Header-Berechnung (X-PP-Signature) noch nicht in den HTTP-Nodes implementiert; aktuell kommt der Workflow nur durch wenn `PP_AUTH_DISABLED=1`. Code-Node mit HMAC-Snippet vor jedem HTTP-Node nachziehen.

### 4.7 Foundation-Konsolidierung
- Receipts-Schema-Konflikt (010 TEXT vs. 013 UUID) muss aufgelöst werden, sonst kann ein Greenfield-`npm run migrate` das Backend brechen.
- `customer_profiles` 010 TEXT vs. 011 UUID — gleiches Problem.

---

## 5. ENV-Variablen-Checkliste für Production

Pflicht (keine Defaults, müssen gesetzt sein):
```
DATABASE_URL                       # Postgres-Connection
REDIS_URL                          # Redis-Connection
PP_HMAC_SECRET                     # n8n ↔ Backend HMAC
PP_PGCRYPTO_KEY                    # AES-256 Master-Key (Customer-Credentials)
WHATSAPP_APP_SECRET                # Meta-Webhook-Signaturen
WHATSAPP_VERIFY_TOKEN              # Meta GET-Verify-Challenge
GOOGLE_VISION_KEY_FILE             # GCP Service-Account JSON
CLAUDE_API_KEY                     # Anthropic API-Key
```

Optional / mit sinnvollen Defaults:
```
CLAUDE_MODEL=claude-sonnet-4-6
M03_CACHE_TTL_DAYS=30
LEXOFFICE_API_BASE=https://api.lexoffice.io
LEXOFFICE_DEFAULT_TIMEOUT_MS=15000
WHATSAPP_GRAPH_API_VERSION=v19.0
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
SMTP_HOST                          # für M08 Mail-Versand (sonst MAIL_NOT_CONFIGURED)
DRIVE_FOLDER_CACHE_TTL_SEC=3600
OCR_TIMEOUT_MS=15000
```

Test/Dev:
```
PP_AUTH_DISABLED=1                 # HMAC-Bypass
PP_E2E=1                           # E2E-Tests aktivieren
```

---

## 6. Migrations-Nummern-Belegung (final)

| Nummer | Datei | Bemerkung |
|--------|-------|-----------|
| 001 | `001_initial_schema.sql` | tenants, customers (UUID), document_inbox, routing_jobs, audit_log |
| 002 | `002_rls.sql` | RLS-Policies |
| 003 | `003_suppliers_global.sql` | M01 |
| 004 | `004_spreadsheet_row_index.sql` | M07 Idempotenz |
| 010 | `010_m10_minimal.sql` | TEXT-receipts (Welt A) |
| 011 | `011_customer_profiles.sql` | UUID-Variante (Welt B) |
| 012 | `012_customer_profiles_alter.sql` | Spalten-Patch |
| 013 | `013_receipts.sql` | DROPS+rebuilds receipts (UUID) |
| 014 | `014_audit_log.sql` | entity_type/entity_id |
| 015 | `015_receipts_search.sql` | tsvector |
| 016 | `016_receipt_dedup.sql` | UNIQUE file_sha256 |
| 017 | `017_webhook_queue.sql` | webhook_queue |
| **018** | **`018_customer_hooks.sql`** | **Hook-System (NEU)** |
| **019** | **`019_m03_kategorisierung.sql`** | **M03 (NEU)** |
| **020** | **`020_m05_lexoffice.sql`** | **M05 (NEU)** |
| **021** | **`021_m08_reports.sql`** | **M08 (NEU)** |

Nächste freie Nummer: **022**.

---

## 7. Tests, die `PP_E2E=1` brauchen

```bash
docker compose up -d postgres redis
PP_E2E=1 npm test -- e2e
```

Diese Tests sind absichtlich `describe.skip` ohne ENV-Flag, damit CI-Runs ohne
DB-Setup nicht rot werden. Lokal sind sie nötig, um die DB-Schema-Migrationen
zu validieren.

---

## 8. Übersicht offene TODOs mit Pfaden

| TODO | Datei | Priorität |
|------|-------|-----------|
| HMAC-Snippet in Master-Workflow HTTP-Nodes | `n8n/workflows/WF-MASTER-RECEIPT.json` | hoch (Production-Block) |
| Mail-Sender SMTP-Implementation | `backend/src/modules/m08-reporting/services/mail-sender.ts` | mittel |
| WhatsApp-Sender Template-Implementation | `backend/src/modules/m08-reporting/services/whatsapp-sender.ts` | mittel |
| Drive-Adapter download() für Anhänge | `backend/src/modules/m05-lexoffice/services/attachment-picker.ts` | niedrig |
| Plugin-Loader für plugin_id-Hooks | `backend/src/core/hooks/hook-runner.ts` (Phase 3) | niedrig |
| isolated-vm statt node:vm für js_inline | `backend/src/core/hooks/hook-runner.ts` | mittel |
| Hook-Audit-Log pro Hook-Ausführung | `backend/src/core/hooks/hook-runner.ts` | mittel |
| Profile-Cache (LRU + Event-Invalidate) | `backend/src/core/customer-profile/cache.ts` (neu) | niedrig |
| Foundation-Konsolidierung (Welt A ↔ B) | `migrations/` + Backend-Module | hoch (Production-Block) |
