# ADR-001: Customer-Welt vs. Tenant-Reboot

**Status:** Vorschlag (zur Entscheidung durch Steve + Andreas)
**Datum:** 2026-06-02
**Owner:** Andreas (Vorbereitung) + Steve (Mitentscheidung)

> Hinweis Nummerierung: Im Ordner `infra/decisions/` existieren bereits `001-pdf-engine.md`, `002-mail-provider.md`, `003-plugin-sandbox.md` ohne `ADR-`-Präfix. Diese Datei nutzt den vom Task-Auftrag (T028) vorgegebenen Namen `ADR-001-customer-vs-tenant.md`. Wenn die Konvention vereinheitlicht werden soll, bitte beim Merge in `004-customer-vs-tenant.md` umbenennen.

---

## Kontext

Das Gastro-Backend trägt zwei parallele Daten-Welten in genau einer Codebase:

- **Welt A — Legacy `customer`:** Die Konzept-Spezifikation `01_Datenmodell_Events.md` §6 (Zeilen 355–432) beschreibt das DB-Schema noch komplett als `customers (customer_id TEXT PK)`, `customer_profiles`, `customer_credentials`, `receipts (customer_id REFERENCES customers)`, `idempotency_keys`, `processed_events`. RLS soll laut Spec über `customer_id` greifen.
- **Welt B — Tenant-Reboot:** Die real ausgeführten Migrations (010–100) kennen ausschließlich `tenants (id UUID PK)` mit `tenant_id`-FKs auf allen Business-Tabellen. `030_belege.sql` (Zeile 11–12) erklärt explizit: „Die alte (Welt-A/B) `receipts`-Tabelle existiert nicht mehr nach dem Konzept-Reboot." RLS greift über `current_tenant_id()` (`002_helpers.sql`).

Beide Welten sind in `backend/src/app.ts` (Zeilen 260–315) gleichzeitig als Routen registriert. Die Legacy-Routen `/customers`, `/profiles`, `/documents`, `/reports`, `/receipts` greifen zur Laufzeit auf Tabellen zu (`customers`, `receipts`, `customer_profiles`, `documents`), die **in keiner einzigen Migration angelegt werden** (verifiziert per Grep über `backend/migrations/*.sql`). Das heißt: Die gesamte Legacy-Welt ist im aktuellen Repo-Stand DB-seitig tot — sie würde gegen `gastro_dev` nach Fresh-Setup `relation "customers" does not exist` werfen.

Gleichzeitig nutzen **alle relevanten n8n-Workflows ausschließlich die Legacy-API** (`/api/v1/customers/...`, `/api/v1/receipts/...`, `customer_id` im Payload). KEIN n8n-Workflow ruft `/api/v1/belege/` oder `/api/v1/tenants/` auf.

Das Audit `REPORT-2026-05-26.md` F09/F10 hat diese Situation als „Architektur-Entscheidung" markiert und nicht selbst entschieden, weil die Specs uneindeutig sind.

---

## Bestandsaufnahme

### Routen (Backend `app.ts:260–315`)

| Route-Präfix | Welt | Datei (registriert in app.ts) | DB-Tabellen die der Code anfasst |
|---|---|---|---|
| `/api/v1/tenants` | Tenant | `modules/tenants/tenant.routes.ts` | `tenants`, `tenant_settings` |
| `/api/v1/belege` (vor HMAC, JWT-geschützt) | Tenant | `modules/m01-receipt-intake/belege.routes.ts` | `belege` |
| `/api/v1/dsgvo` (v2, vor HMAC, JWT) | Tenant | `modules/dsgvo/dsgvo-v2.routes.ts` | `belege`, `dsgvo_requests` |
| `/api/v1/auth/...` | Tenant (cross-tenant Mitarbeiter) | `modules/m14-auth/*` | `users`, `auth_sessions`, `auth_audit_log` |
| `/api/v1/m15/oauth/sumup/...` | Tenant | `modules/m15-pos-connector/oauth.routes.ts` | `pos_credentials`, `kasse_*` |
| `/api/v1/customers` (CRUD) | Customer | `modules/customers/customer.routes.ts` | `customers` (existiert nicht in Migrations) |
| `/api/v1/customers/:id/profile` | Customer | `modules/profiles/profile.routes.ts` | `customer_profiles` (existiert nicht) |
| `/api/v1/internal/profile/...` | Customer | `modules/profiles/profile.routes.ts` (internal) | `customer_profiles` |
| `/api/v1/documents` | Customer | `modules/documents/document.routes.ts` | `documents` (existiert nicht) |
| `/api/v1/receipts` (CRUD) | Customer | `modules/receipts/receipt.routes.ts` | `receipts`, `customers` |
| `/api/v1/receipts/:id/...` (M01–M07) | Customer | `m01-receipt-intake/routes.ts`, `m02-archive`, `m03-ocr`, `m03-categorization`, `m05-lexoffice`, `m06-sevdesk`, `m07-spreadsheet`, `_shared/receipts/complete.routes` | `receipts` |
| `/api/v1/routing/plan` + `/jobs` | Customer | `modules/routing/{plan,routing}.routes.ts` | `receipts` (in `plan.handler.ts`) |
| `/api/v1/customers/:id/datev` | Customer | `m04-datev/routes.ts` | `receipts`, `customers` |
| `/api/v1/customers/:id/exports/{lexoffice,sevdesk}` | Customer | `m05-lexoffice`, `m06-sevdesk` (customer-prefix) | `receipts` |
| `/api/v1/customers/:id/reports/...` | Customer | `m08-reporting/routes.ts` | `receipts` |
| `/api/v1/reports` | Customer | `modules/reports/report.routes.ts` | `receipts` |
| `/api/v1/customers/:customerId/stats` | Customer | `modules/stats/routes.ts` | `receipts` |
| `/api/v1/internal/customers` | Customer (n8n-only) | `_shared/customers/internal.routes.ts` | `customer_profiles` |
| `/api/v1/internal/notifications/operator` | Customer | `_shared/customers/notifications.routes.ts` | n/a (Webhook-Forward) |
| `/api/v1/internal/whatsapp/...` | Customer | `m10-whatsapp/routes.ts` | `receipts` |
| `/api/v1/internal/imap/poll` | Customer | `m11-imap/routes.ts` | `receipts` |
| `/api/v1/communications/...` | Customer | `m09-supplier-comm/routes.ts` | `receipts` |
| `/api/v1/advisor/...` | Customer | `m06-advisor-portal/routes.ts` | `receipts` |
| `/api/v1/dsgvo/...` (v1) | Customer | `modules/dsgvo/routes.ts` | `receipts` (gemischt mit `belege` in Lösch-Service) |
| `/api/v1/hooks`, `/api/v1/errors`, `/api/v1/plugins` | gemischt | jeweilige Routen | meist Plugin-Tabellen, Error-Log |

### Tabellen (Migrations 001–110)

| Tabelle | Welt | Migration | Status im Code |
|---|---|---|---|
| `tenants` | Tenant | `010_tenants.sql` | aktiv (FK aller Reboot-Tabellen) |
| `tenant_settings` | Tenant | `010_tenants.sql` | aktiv |
| `users` | Tenant (cross-tenant) | `020_users_auth.sql` | aktiv (M14) |
| `auth_sessions`, `auth_audit_log` | Tenant | `020_users_auth.sql`, `061_auth_audit_log_insert_fn.sql` | aktiv |
| `pos_credentials` | Tenant | `022_pos_credentials.sql` | aktiv (M15) |
| `belege` | Tenant | `030_belege.sql` (+ `090_belege_soft_delete.sql`) | aktiv (M01–M03, DSGVO v2) |
| `kasse_integrations`, `kasse_transactions` | Tenant | `040_kasse.sql`, `110_kasse_transactions_fk_relax.sql` | aktiv (M15) |
| `export_log` | Tenant | `050_export_log.sql` | aktiv (Export-Tracking) |
| `audit_log` | Tenant | `060_audit_log.sql` | aktiv |
| `ocr_cost_log` | Tenant | `070_ocr_cost_log.sql` | aktiv (M03-OCR) |
| `dsgvo_requests` | Tenant | `080_dsgvo_requests.sql` | aktiv (M12) |
| `booking_credentials` | Tenant | `100_booking_credentials.sql` | aktiv |
| `customers` | Customer | **keine Migration** | von `customer.repository.ts` + 6 anderen Modulen referenziert |
| `customer_profiles` | Customer | **keine Migration** | von `profile.repository.ts`, `_shared/customers/internal.routes.ts` referenziert |
| `customer_credentials` | Customer | **keine Migration** | in §6 Spec, aber kein Code-Treffer in `backend/src/` |
| `receipts` | Customer | **keine Migration** | von M04–M11, advisor-portal, stats, routing, DSGVO v1 referenziert |
| `documents` | Customer | **keine Migration** | von `document.repository.ts` referenziert |
| `idempotency_keys` | Customer | **keine Migration** | in §6 Spec, kein Code-Treffer |
| `processed_events` | Customer | **keine Migration** | in §6 Spec, kein Code-Treffer |

> Befund: Die gesamte Legacy-Welt hat **kein DB-Backing**. Jeder Aufruf von `/api/v1/customers/...` oder `/api/v1/receipts/...` gegen eine frisch migrierte DB würde mit `relation "customers" does not exist` bzw. `relation "receipts" does not exist` fehlschlagen.

### n8n-Workflows (`n8n/workflows/`)

| Workflow | Nutzt Backend-Endpoints | Welt | Notiz |
|---|---|---|---|
| `WF-MASTER-RECEIPT.json` | `/api/v1/receipts`, `/receipts/{{id}}`, `/routing/plan`, `/internal/profile/{{id}}` | Customer | Zentraler Receipt-Lifecycle |
| `WF-INPUT-UPLOAD.json` | `/api/v1/receipts/{{id}}`, `/routing/plan`, `/internal/profile/...` | Customer | nutzt `customer_id`, `tenant_id` als Payload-Feld |
| `WF-INPUT-IMAP.json` | `/api/v1/internal/imap/poll` | Customer | Endpoint hängt an `receipts` |
| `WF-INPUT-WHATSAPP.json` | `/internal/whatsapp/{media,resolve,send-text}` | Customer | nutzt `customer_id` |
| `WF-M01.json` | `/api/v1/receipts`, `/receipts/{{id}}` | Customer | |
| `WF-M02.json` | `/api/v1/receipts/{id}/archive` | Customer | |
| `WF-M03.json` | `/api/v1/receipts/{{id}}` | Customer | |
| `WF-M04.json` | `/api/v1/customers/{{id}}/datev/...`, `/internal/customers` | Customer | |
| `WF-M05.json` | `/api/v1/receipts/{{id}}` | Customer | Lexoffice |
| `WF-M06.json` | `/api/v1/receipts/{{id}}` | Customer | sevDesk |
| `WF-M07.json` | `/api/v1/receipts/{id}/exports/spreadsheet` | Customer | |
| `WF-M08.json` | `/api/v1/customers/{{id}}/reports/...`, `/internal/customers` | Customer | |
| `WF-CRON-M08.json` | `/api/v1/customers/:id/reports/monthly/build|deliver`, `/internal/customers` | Customer | |
| `WF-CRON-M09-EXPECTED.json` | `/api/v1/communications/expected-check`, `/internal/customers`, `/customers` | Customer | |
| `WF-M09-SUPPLIER-COMM.json` | `/api/v1/communications/{build,send}` | Customer | nutzt `customer_id` und `tenant_id` parallel |
| `WF-ERROR-HANDLER.json` | `/api/v1/errors`, `/internal/notifications/operator`, `/receipts/{{id}}` | Customer | |
| `WF-PLUGIN-DISPATCHER.json` | `/api/v1/plugins`, `/plugins/{{id}}` | neutral | unabhängig |

> Befund: KEIN n8n-Workflow nutzt aktuell die Tenant-Welt (`/belege`, `/tenants`). Die Workflows wurden gegen die Legacy-Welt geschrieben und sind heute formal lauffähig nur, weil das Backend beide Welten parallel registriert — selbst wenn die DB-Tabellen unter den Legacy-Routen real fehlen.

### Backend-Module (Welt-Zuordnung)

**Sauber Tenant-Welt (nutzen `belege`/`tenants`/`tenant_id`):**

- `modules/tenants/`
- `modules/m01-receipt-intake/` (`belege.repository.ts`, `belege.routes.ts`, `routes.ts` (Update/Delete/Reprocess))
- `modules/m02-archive/` (greift auf `belege.payload`)
- `modules/m03-ocr/`, `modules/m03-categorization/` (über `belege`)
- `modules/m14-auth/`
- `modules/m15-pos-connector/` + `modules/kasse/` (über `kasse_*`)
- `modules/dsgvo/` (v2-Pfad `dsgvo-v2.routes.ts`, `services/loeschung.service.ts` + `auskunft.service.ts` nutzen `belege`; v1-Pfad `routes.ts` + `data-export.handler.ts` + `deletion-status.handler.ts` nutzen aber noch `receipts`)
- `modules/users/`

**Vollständig Legacy-Welt (greifen auf `customers`/`receipts`/`customer_profiles`/`documents`):**

- `modules/customers/`
- `modules/profiles/`
- `modules/documents/`
- `modules/receipts/`
- `modules/reports/`
- `modules/_shared/receipts/` (eigener parallel-Repository auf `receipts`)
- `modules/_shared/customers/internal.routes.ts` + `notifications.routes.ts`
- `modules/m04-datev/handlers/*` (`build.handler.ts` Z.85+295, `send.handler.ts`, `list.handler.ts`, `download.handler.ts`)
- `modules/m05-lexoffice/handlers/{push,exports,integration}.handler.ts`
- `modules/m06-sevdesk/handlers/{push,exports,integration}.handler.ts`
- `modules/m06-advisor-portal/` (alle Routes + Handler)
- `modules/m07-spreadsheet/`
- `modules/m08-reporting/` (`routes.ts`, `services/aggregator.ts`)
- `modules/m09-supplier-comm/` (`handlers/build.handler.ts`, `services/expected-checker.ts`)
- `modules/m10-whatsapp/services/receipt.repository.ts`
- `modules/m11-imap/routes.ts` (INSERT INTO receipts)
- `modules/routing/handlers/plan.handler.ts`
- `modules/stats/handlers/stats.handler.ts`
- `modules/dsgvo/handlers/{data-export,deletion-status}.handler.ts` (DELETE FROM receipts)

**Gemischt / neutral:**

- `modules/plugin-system/` (Plugin-eigene Tabellen, ohne `customer_id`/`tenant_id`-Bezug zu Belegen)
- `modules/_shared/errors/`
- `core/hooks/`

---

## Optionen

### Option A — Vollständiger Abbau der Legacy-`customer`-Welt

**Was:**
- Alle 17 oben gelisteten Legacy-Module auf `tenants`/`belege`/`tenant_id` umstellen.
- Routen `/customers/*`, `/receipts/*`, `/documents/*`, `/reports/*`, `/internal/customers`, `/internal/profile/*` aus `app.ts` entfernen.
- Module `modules/customers/`, `modules/profiles/`, `modules/documents/`, `modules/receipts/`, `modules/reports/`, `modules/_shared/{customers,receipts}/` löschen.
- M04, M05, M06, M07, M08, M09, M10, M11, M06-advisor, stats, routing/plan, DSGVO v1 auf `belege` umschreiben (SQL-Refactor in 30+ Handler-Dateien).
- Alle n8n-Workflows (`WF-MASTER-RECEIPT`, `WF-M01..M09`, `WF-CRON-M08`, `WF-CRON-M09-EXPECTED`, `WF-INPUT-*`, `WF-ERROR-HANDLER`) auf Tenant-Routen umstellen (`/api/v1/belege/...`, `/api/v1/tenants/:id/...`) und `customer_id` → `tenant_id` im Payload tauschen.
- `01_Datenmodell_Events.md` §6 komplett umschreiben (T029).

**Pro:**
- Eine Welt, eine Wahrheit. `01_Datenmodell_Events.md` §6 und Code erzählen dieselbe Geschichte.
- Schema-Reboot (Migration 030) wird endlich konsistent vollzogen — das Versprechen aus Z.11–12 (`receipts existiert nicht mehr`) wird Realität.
- RLS greift einheitlich über `current_tenant_id()`. Keine Sicherheits-Sonderfälle für Legacy-Routen mehr.
- Pilot-Wirt KW22 kommt ohne tote Routen-Last in Production.
- Auditierbarkeit: ein einziger Migrations-Pfad statt Spec-Drift.

**Contra:**
- Hoher Aufwand: ~30 Handler-Dateien (SQL umschreiben), 15+ n8n-Workflows, mehrere Webapp-Aufrufer wenn die noch `/receipts` rufen.
- Während Refactor sind n8n-Workflows kaputt → Master-Workflow-Pause nötig.
- Risiko, dass Felder, die im `Receipt`-JSON-Payload (Spec §2.1) leben, nicht 1:1 ins `belege.payload`-JSONB passen (Schema-Mapping-Aufwand).

**Aufwand:** XL (2–4 Wochen Vollzeit mit Tests + n8n-Migration).

**Risiko:** Mittel-Hoch. Refactor-Fenster mit Workflow-Downtime, aber DB-Risiko ist 0 (Legacy-Tabellen existieren ohnehin nicht).

**Migrationspfad (Wellen):**
1. **Welle 5a (T029):** Spec `01_Datenmodell_Events.md` §6 auf `tenants`/`belege` umziehen — Zielbild dokumentieren.
2. **Welle 5b:** `_shared/receipts/receipt.repository.ts` als zentraler Belege-Adapter neu schreiben (alle `FROM receipts` → `FROM belege`, `customer_id` → `tenant_id`). Alle abhängigen Module umstellen.
3. **Welle 5c:** M04, M05, M06, M07, M08 Handler-Refactor (jeweils einzeln testen).
4. **Welle 5d:** M09, M10, M11, advisor-portal, stats, routing/plan, DSGVO v1 → v2 mergen.
5. **Welle 5e:** n8n-Workflows umbauen (eine Welle, Master-Workflow zuletzt). Backend-Routen `/customers`, `/receipts` etc. entfernen → T019 erfüllt sich automatisch + Webapp-Cleanup.
6. **Welle 5f:** Module `customers/`, `profiles/`, `documents/`, `receipts/`, `reports/`, `_shared/{customers,receipts}/` löschen.

### Option B — Koexistenz mit klarer Grenze

**Was:**
- Legacy-Welt bleibt für n8n + Webapp-`/receipts`-Pages bestehen.
- Tenant-Welt ist Pilot-Pfad (`/belege` + Mitarbeiter-Webapp).
- Fehlende Legacy-Migrations (`100_legacy_customer.sql`) werden nachgezogen, um die heute defekte DB-Anbindung zu reparieren.
- Klare Regel in CLAUDE.md: „Neuer Code → Tenant-Welt. Bestehender n8n-Workflow → Legacy bis Migration X."

**Pro:**
- Schneller Pilot-Start ohne Refactor-Fenster.
- n8n-Workflows bleiben funktionsfähig.

**Contra:**
- Zementiert den Drift: zwei RLS-Mechanismen (`customer_id`-Check in Application-Code vs. `current_tenant_id()`-Policy), zwei Idempotenz-Wege, zwei Audit-Pfade.
- Spec §6 muss „beide Welten" beschreiben → mehr Doku-Wartung, nicht weniger.
- Pilot-Wirt KW22 läuft auf der Welt, die der Audit (F09/F10) als zu klärend markiert hat → bei späterem Umzug Daten-Migration nötig.
- Sicherheit: Legacy-RLS ist nicht über Postgres-Policies erzwungen (siehe `customers`/`receipts` ohne RLS-DDL) → höheres Cross-Tenant-Leak-Risiko.
- Aufwand für „Legacy nachziehen" ist nicht null: alle Tabellen-DDLs müssen rückwirkend geschrieben werden, inkl. RLS, Indexes, Crypto-Spalten.

**Aufwand:** L (1–2 Wochen für nachgezogene Migrations + Doku).

**Risiko:** Hoch. Wir bauen technische Schuld in den Pilot ein. Jede zukünftige Feature-Task muss „in welcher Welt?" entscheiden.

### Option C — Hybrid: Customer-Routen als dünner Read-Layer über `tenants`/`belege`

**Was:**
- Routen `/customers`, `/receipts` etc. bleiben als API-Oberfläche bestehen, aber die Repositories werden so umgebaut, dass sie unter der Haube gegen `tenants`/`belege` lesen/schreiben.
- `customer_id` in der API wird auf `tenant_id` gemappt (1:1, da fachlich identisch — ein Kunde = ein Tenant).
- n8n-Workflows bleiben unverändert.

**Pro:**
- Kein n8n-Refactor nötig.
- Eine DB-Wahrheit (`belege`), eine RLS-Policy.
- Schrittweiser Übergang: später können einzelne Workflows auf `/belege`-API umgestellt werden, ohne Big-Bang.

**Contra:**
- Mapping-Layer ist erneut Code, der gewartet werden muss.
- Receipt-Payload-Schema vs. Beleg-Payload-Schema: das alte `Receipt`-JSON (Spec §2.1) hat Felder, die in `belege.payload` evtl. andere Pfade haben — Mapping ist nicht trivial.
- Spec-Drift bleibt: §6 redet von `customer_id TEXT PK`, real ist es `tenant_id UUID FK`.
- Sicherheits-Audit kompliziert: zwei API-Oberflächen für dieselben Daten.

**Aufwand:** L (1–2 Wochen Mapping-Layer + Tests).

**Risiko:** Mittel. Kein DB-Risiko, aber Schema-Mismatch in JSON-Payloads ist eine Quelle für stille Bugs.

---

## Empfehlung

**Option A (vollständiger Abbau) — gestaffelt über Welle 5.**

Begründung:

1. Die Legacy-Welt ist DB-seitig nicht-existent. Wir entscheiden nicht, ob wir sie abbauen — wir entscheiden, ob wir ihre Trümmer wegräumen oder Migrations nachziehen, um sie wieder zum Leben zu erwecken. Trümmer wegräumen ist günstiger.
2. Der Schema-Reboot in `030_belege.sql:11–12` ist eine schriftliche Entscheidung von Andreas (T011-Akzeptanz). Sie wurde aber nur halb umgesetzt: DDL ist neu, Code nicht. Konsistenz herstellen heißt: Code zum DDL ziehen.
3. RLS-Sicherheit ist nur in der Tenant-Welt sauber erzwungen (Postgres-Policies + `FORCE ROW LEVEL SECURITY`). In der Legacy-Welt müssten wir RLS in Application-Code reimplementieren — DSGVO-Risiko für Buchhaltungs-Daten.
4. n8n-Refactor ist groß, aber endlich. Wenn wir ihn nicht jetzt machen, machen wir ihn später mit Pilot-Wirt-Daten dazwischen — riskanter.
5. T019 (Receipts-Routen entfernen) ist ohnehin geplant. Option A macht T019 zur natürlichen Konsequenz statt zur isolierten Cleanup-Insel.

Bedingung: **Welle 5 muss vor dem Pilot-Wirt-Go-Live abgeschlossen sein** (KW22 laut CLAUDE.md §3). Wenn das zeitlich nicht reicht, fällt der Pilot zurück auf Option C als Übergangslösung (Mapping-Layer), aber NICHT auf Option B (Koexistenz mit nachgezogenen Migrations) — wir wollen keine zweite Welt, die wir später erneut abreißen müssen.

---

## Konsequenzen wenn Entscheidung getroffen

### Bei Option A (Empfehlung)

- **T029 (Datenmodell-Doc-Sync):** `01_Datenmodell_Events.md` §6 wird komplett auf `tenants`/`tenant_settings`/`belege`/`audit_log` umgeschrieben. `customer_id` → `tenant_id` in §1, §2 (Receipt-JSON), §4.3 (Events) durchziehen. Zielbild: 1:1 mit `backend/migrations/SCHEMA.md`.
- **T019 (Receipts-Routen entfernen):** Erweitert sich von „Webapp-Pages entfernen" auf „Backend-Routen `/customers`, `/receipts`, `/documents`, `/reports` aus `app.ts:261–315` entfernen + Module löschen". Wird zur Schluss-Task von Welle 5.
- **T032 (Event-Vertrag §4.3):** Audit-Befund F11/F12 — Events, die `customer_id` führen (`pp.customer.profile_updated`), brauchen Refactor auf `tenant_id`-Schlüssel. Spec §4.3 wird mit `tenant_id` als Pflicht-Feld neu festgeschrieben.
- **n8n:** Vollständiger Workflow-Umbau (eigene Task-Batterie nötig: WF-MASTER-RECEIPT, WF-M01..M09, WF-CRON-*, WF-INPUT-*, WF-ERROR-HANDLER). Empfehlung: pro Workflow eine Task, parallel zum Backend-Module-Refactor.
- **Webapp:** Pages, die `/api/v1/receipts` rufen (`webapp/src/api/receipts.ts`, `ReceiptsPage.tsx`, `UploadPage.tsx`, `ReceiptDetailPage.tsx`) entfallen — bereits in T019 vorgesehen.
- **CI/Tests:** Alle Tests, die gegen `receipts`-Tabelle laufen, müssen auf `belege` umgeschrieben werden (siehe `_shared/receipts/receipt.repository.ts` + Tests in `m04`, `m05`, `m06`, `m07`, `m08`, `routing`, `stats`).

### Bei Option B (Koexistenz)

- T029: §6 muss beide Welten beschreiben, mit klarer „wann welche?"-Regel.
- T019: Bleibt isolierte Webapp-Task; Backend-Routen werden nicht entfernt.
- **Neue Tasks erforderlich:** „Legacy-Migrations nachziehen" (`xxx_legacy_customer.sql`, `xxx_legacy_receipts.sql`, `xxx_legacy_customer_profiles.sql` inkl. RLS + Crypto). Mind. 4 neue Migrations.
- CLAUDE.md §5 wird um eine „Welt-A vs. Welt-B"-Sektion ergänzt.
- T032: §4.3 muss beide ID-Schlüssel (`customer_id`, `tenant_id`) als gültig markieren.

### Bei Option C (Hybrid)

- T029: §6 wird Tenant-only, Legacy-API wird als „Compatibility-Layer über Tenant-DB" dokumentiert.
- T019: Bleibt Webapp-Task.
- **Neue Task:** „Customer-Routen Mapping-Layer auf `belege`" — `_shared/receipts/receipt.repository.ts` als Adapter umschreiben.
- T032: §4.3 wird auf `tenant_id` umgestellt; Events tragen das Tenant-Feld, n8n liest weiter `customer_id` aus Mapping.
- Receipt-JSON vs. Beleg-Payload-Schema-Mapping muss separat spezifiziert werden.

---

## Offene Fragen (für die Entscheidung)

1. **Pilot-Zeitplan KW22:** Reicht die Zeit für Option A bis Pilot-Go-Live, oder müssen wir Option C als Übergangs-Pfad einplanen? Wer entscheidet das auf Basis welcher Kapazitäts-Schätzung?
2. **n8n-Workflow-Pause:** Welt-A → Welt-B-Umstellung erzwingt eine n8n-Wartungs-Fenster-Phase, in der Belege nicht durch die Pipeline fließen. Wann liegt dieses Fenster, und wie kommunizieren wir das gegenüber dem Pilot-Wirt?
3. **`Receipt`-JSON ↔ `belege.payload`-Mapping:** Spec §2.1 (`receipt_id`, `customer_id`, `source.channel`, `extraction.fields`, …) vs. `belege.payload JSONB DEFAULT '{}'::jsonb` — gibt es ein dokumentiertes 1:1-Mapping, oder bauen wir das im Rahmen von T029? (nicht gefunden in `Modulkonzept/Konzeptentwicklung/`, ggf. nachfragen)
4. **`customer_id` ↔ `tenant_id`-Bijektion:** Ist tatsächlich „ein Kunde = ein Tenant", oder gibt es Filialisten-Szenarien (Paket „Filiale €299"), bei denen mehrere Wirte unter einem Tenant zusammenlaufen? Falls letzteres: `customer_id` ist möglicherweise feiner granuliert als `tenant_id` und ein 1:1-Mapping ist nicht möglich. (nicht eindeutig in `00_Vertriebsmodell.md` / `02_Kundenprofil_System.md` geklärt, ggf. nachfragen)
5. **DSGVO-v1 vs. v2:** `modules/dsgvo/` hat zwei parallele Pfade (`routes.ts` legacy auf `receipts`, `dsgvo-v2.routes.ts` neu auf `belege`). Wurde der Umstieg dokumentiert oder ist v1 noch verbindlich? (`T010-andreas-m12-dsgvo-endpoints.md` deutet auf v2 als Ziel hin.)
6. **Steuerberater-Portal M13/M06-advisor:** Hat eigene Receipt-Reviews. Ist das Portal pilot-relevant (KW22) oder Post-Pilot? Falls Post-Pilot: kann der Refactor auf `belege` verschoben werden, oder blockiert das den Lexware-Office-Pilotfluss?
7. **Plugin-System:** Nutzt `pp.customer.*`-Events als Hook-Trigger. Welt-A → Welt-B-Umstieg erfordert `pp.tenant.*`-Hooks. Migrations-Pfad für bestehende Plugins?
