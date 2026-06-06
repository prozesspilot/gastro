# ADR-004: Datenmodell — Legacy-`customer`-Welt vs. `tenant`/`belege`-Reboot

**Status:** Akzeptiert — umgesetzt (Reboot vollzogen; Routen-Cleanup F1 offen, siehe Ist-Stand)  
**Datum:** 2026-05-27 (Ist-Stand-Update + nach main nachgezogen: 2026-06-06)  
**Entscheider:** Steve (Geschäftsführer); Gegencheck Andreas zur n8n-Verdrahtung ausstehend (siehe Konsequenzen)  
**Bezug:** Task T028 · Audit `Modulkonzept/Konzeptentwicklung/_audit/REPORT-2026-05-26.md` F09/F10

> **🟢 Ist-Stand (2026-06-06): Entscheidung gilt und ist weitgehend umgesetzt.** Reale DB = 14 Tabellen auf `tenants`/`belege`-Basis (kein `CREATE TABLE customers|receipts|customer_profiles` irgendwo im Repo). **Seit dieser ADR umgesetzt:** T028/Option Z (#105) entfernte isolierte tote Module; **T041** (#103/#104) vereinheitlichte den RLS-Tenant-Context-GUC repo-weit auf **`app.current_tenant`** — die unten erwähnte Funktion `current_tenant_id()` ist insofern überholt. **Noch offen (Schritt F1):** die toten `/receipts`- und `/customers`-Routen hängen weiter im `apiApp`-Block von `backend/src/app.ts` (≈ Z. 263–313); alle n8n-Workflows rufen genau diese → HTTP 500. Vollständiger verifizierter Stand: `.claude/CLAUDE.md` §3. Diese ADR wurde am 2026-06-06 aus Commit `871dccb` (lag auf einem Branch, **nie nach main gemergt**) in main nachgezogen, damit die Datenmodell-Entscheidung versioniert im Baum steht.

## Kontext

Der Konzept↔Code-Audit (2026-05-26) fand zwei scheinbar parallele Daten-Welten. Die Untersuchung im Rahmen von T028 ergab:

- **DB-Realität:** Migrationen **und** laufende Dev-DB enthalten nur `tenants` + `belege` (+ `audit_log`, `pos_credentials`, `kasse_transactions`, …). Die Tabellen `customers`, `receipts`, `customer_profiles`, `documents` aus `01_Datenmodell_Events.md` §6 **existieren nicht** (mehr).
- **Tote Module:** `backend/src/modules/customers/`, `receipts/`, `profiles/`, `documents/` fragen `FROM customers` (6×) bzw. `FROM receipts` (10×) ab — also nicht-existente Tabellen. Diese Code-Pfade sind tot bzw. würden bei Aufruf `relation does not exist` werfen.
- **M01–M08** hängen am Routen-**Präfix** `/receipts` + `/customers`, arbeiten intern aber auf `belege`/`tenants` (Namens-Drift Route↔Tabelle).
- **n8n:** 9 Workflows rufen `/receipts`, 4 rufen `/customers`, **0** rufen `/belege`/`/tenants`. Die Produktions-Integration hängt an den alten Routen-**Präfixen**.

Kern: Der Daten-Reboot auf `belege`/`tenants` ist **faktisch bereits vollzogen**. Übrig sind toter Modul-Code (Geister-Tabellen) und alte Routen-Namen, an denen n8n klebt.

## Optionen

- **A — Reboot zementieren:** `belege`/`tenants` ist Standard; tote `customers`/`receipts`/`profiles`/`documents`-Module entfernen; Routen-Präfixe `/receipts`+`/customers` für n8n-Kompatibilität **vorerst behalten**; Konzept §6 angleichen.
- **B — Voll umbenennen auf `/belege`+`/tenants`:** Sauberste Namen, aber alle 13 n8n-Workflows müssen umgeschrieben werden — großer Aufwand + Risiko vor dem KW22-Pilot.
- **C — Koexistenz dokumentieren:** Nichts entfernen, nur Regel festhalten — Drift + toter Code bleiben.

## Entscheidung

**Option A.** `tenants`/`belege` + RLS (`current_tenant_id()`) ist das verbindliche Datenmodell. Der Reboot ist real schon durch; es fehlt nur Aufräumen + Doku-Angleich. Die alten Routen-Präfixe bleiben aus Pilot-Risiko-Gründen vorerst bestehen; eine Umbenennung auf `/belege`+`/tenants` ist optional und frühestens Post-Pilot.

## Konsequenzen

**Sofort / verbindlich:**
- `01_Datenmodell_Events.md` §6 wird auf `tenants`/`belege`/`audit_log` gezogen → **T029**.
- Tote Module `customers/`, `receipts/`, `profiles/`, `documents/` werden entfernt → **T019** (erweitern: nicht nur „/receipts-Routen entfernen", sondern die toten Geister-Tabellen-Module).

**Vorbedingung für die Modul-Entfernung (T019) — von Andreas zu bestätigen:**
- Verifizieren, dass n8n's `/receipts`- und `/customers`-Calls die **funktionierenden M01–M08-Handler** (auf `belege`/`tenants`) treffen und **nicht** die toten Module. Erst dann ist das Entfernen risikofrei. Falls doch tote Routen getroffen werden: das sind latente Produktions-Bugs, die T019 mitfixt.

**Bewusst NICHT jetzt:**
- Keine Umbenennung der Routen-Präfixe (`/receipts`→`/belege`) — würde alle n8n-Workflows brechen. Optional Post-Pilot als eigener Task.

**Re-Drift-Schutz:**
- Neue Tabellen/Routen folgen `tenant_id`/`belege`-Konvention. Spec-Änderungen zuerst, dann Code (CLAUDE.md §8).
