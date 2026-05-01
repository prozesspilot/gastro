# 06 — Prompt-System für Code-Generierung

> **Zweck:** Aus der Architektur in `/Konzeptentwicklung/` systematisch Code (Backend + n8n) erzeugen — ohne neu nachdenken zu müssen.
> **Adressat:** Andreas + Claude Code.
> **Regel:** Jeder Prompt in diesem Dokument ist 1:1 copy-paste-fähig. Platzhalter sind `{{IN_DOPPEL_GESCHWEIFTEN_KLAMMERN}}`.

---

## 0. Mentales Modell (in 30 Sekunden)

```
Architektur-Doku (Quelle der Wahrheit)
        │
        ▼
   Prompt-Template (aus Section 1 dieses Dokuments)
        │  + Spec-Datei als Anhang/Kontext
        ▼
   Claude Code
        │
        ▼
   Generierter Code (Backend / n8n / Tests)
        │
        ▼
   Verifikation (Acceptance Criteria aus der Spec)
```

Wichtig:
1. Die Spec-Datei (`modules/M0X_*.md`) ist der **Vertrag**. Der Prompt referenziert sie, erfindet nichts.
2. Querschnittsdokumente (`01_Datenmodell_Events.md`, `02_Kundenprofil_System.md`, `04_Erweiterbarkeit_Pro.md`) werden bei jedem Prompt als Pflicht-Kontext angegeben.
3. Es gibt **fünf** Prompt-Klassen — mehr braucht es nicht.

---

# SECTION 1 — DIE 5 PROMPT-TEMPLATES

Reihenfolge: Verwendung von oben nach unten in einem Modul-Sprint.

## Template A — Modul-Generierung (komplett)

Wann: Du willst aus einer Modul-Spec (`modules/M0X_*.md`) einen lauffähigen Modul-Block bekommen (Backend-Code + JSON-Schemas + Tests + Migrations + n8n-Workflow-Stub).

```
ROLLE
Du bist Senior Backend Engineer (Node.js/TypeScript) und n8n-Architekt im Projekt
ProzessPilot. Du implementierst genau das, was in der angehängten Spec steht —
keine Erfindungen, keine Auslassungen.

KONTEXT (Pflicht-Lesen, in dieser Reihenfolge)
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md          (System-Überblick)
2. /Konzeptentwicklung/01_Datenmodell_Events.md                  (Receipt-Schema, Events, API-Konventionen, Error-Codes)
3. /Konzeptentwicklung/02_Kundenprofil_System.md                 (CustomerProfile-Struktur, Routing-Felder)
4. /Konzeptentwicklung/04_Erweiterbarkeit_Pro.md                 (Hook-System — falls Modul Hooks definiert)
5. /Konzeptentwicklung/modules/{{MODUL_DATEI}}                   (DIE Spec, verbindlich)

AUFGABE
Generiere das Modul {{MODUL_ID}} ({{MODUL_TITEL}}) exakt nach Spec, Section "Was Claude Code generieren soll".

VERBINDLICHE REGELN
- TypeScript strict, Node 20, Fastify, Zod für Schemas, pg-Treiber (kein ORM).
- Datei-Layout exakt wie in der Spec unter "Code-Struktur".
- Public-API-Form (Endpoints, Request/Response-Body) exakt wie in der Spec.
- Receipt-Felder NIE umbenennen — siehe 01_Datenmodell_Events.md §2.1.
- Idempotency-Key wird IMMER verarbeitet (Tabelle idempotency_keys).
- Events nur emittieren wenn in Spec §"Events" gelistet.
- Fehler im Format aus 01_Datenmodell_Events.md §5.4/§5.5.
- Hooks aufrufen, falls Spec sie nennt (vor/nach jedem fachlichen Schritt).

OUTPUT (in genau dieser Form, nichts anderes)
1. Liste aller zu erzeugenden Dateien mit absoluten Pfaden.
2. Pro Datei ein Codeblock mit dem vollständigen Inhalt.
3. Am Ende: ein "Verifikation"-Block, der 1:1 die Acceptance Criteria der
   Spec wiederholt und je Punkt sagt, welche Datei/welcher Test ihn erfüllt.

Wenn etwas in der Spec mehrdeutig ist: triff eine Entscheidung, markiere sie
mit `// DECISION:` als Inline-Kommentar und liste alle Decisions am Ende.
Keine ungestellten Rückfragen, keine TODOs ohne Begründung.
```

---

## Template B — n8n Workflow-Generierung

Wann: Du brauchst die `WF-{{MODUL_ID}}.json`-Datei (oder einen Master-Workflow). Backend ist bereits da oder wird parallel gebaut.

```
ROLLE
Du bist n8n-Spezialist im Projekt ProzessPilot. Du baust dünne Orchestrierungs-
Workflows, die das Backend per HTTP aufrufen. Keine Business-Logik in n8n.

KONTEXT
1. /Konzeptentwicklung/03_n8n_Workflows.md                       (Workflow-Konventionen, Master-Workflow)
2. /Konzeptentwicklung/01_Datenmodell_Events.md                  (Receipt + Standard-Header)
3. /Konzeptentwicklung/modules/{{MODUL_DATEI}}                   (Section 6 "n8n-Workflow")

AUFGABE
Erzeuge den n8n-Workflow `WF-{{MODUL_ID}}` als importierbares JSON
(n8n Workflow-Export-Format).

VERBINDLICHE REGELN
- Node-Namen exakt wie in der Spec-Tabelle (z. B. `Backend: Extract`).
- Trigger ist `Execute Workflow` (Sub-Workflow) — Schema gemäß Spec §5.1.
- HTTP-Calls ans Backend mit Headern: Idempotency-Key, X-Customer-ID,
  X-Trace-ID, X-PP-Signature (HMAC, Credential-Name `pp-backend-hmac`).
- Retry: 3× exponential für 5xx (5s/30s/3min), keine Retries für 4xx.
- Bei `response.ok===false` → `Respond to Workflow` mit Fehler-Payload,
  niemals Workflow-Crash.
- Keine Credentials inline — nur Credential-Refs.

OUTPUT
1. Eine einzige Datei: `n8n/workflows/WF-{{MODUL_ID}}.json`
2. Stichpunkt-Liste der manuellen Setup-Schritte (Credentials anlegen,
   Webhook registrieren, etc.)

Wenn die Spec eine Node nicht eindeutig spezifiziert (z. B. „Set: Build Result"),
triff eine sinnvolle Entscheidung und nenne sie unter „Decisions" am Ende.
```

---

## Template C — Backend-Service / einzelner API-Endpoint

Wann: Du willst nicht ein ganzes Modul, sondern z. B. nur den Routing-Endpoint, die Idempotency-Middleware, einen einzelnen Adapter oder einen Hilfs-Service.

```
ROLLE
Senior Backend Engineer (Node 20 / TypeScript / Fastify) in ProzessPilot.

KONTEXT
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md
3. {{ZUSÄTZLICHE_DOKS, z. B. modules/M01_Belegerfassung_OCR.md §8 für Adapter}}

AUFGABE
Implementiere {{KOMPONENTE_GENAU}} (ein Endpoint / ein Service / ein Adapter).
Genaue Signatur:

  Endpoint:    {{HTTP-METHODE}} {{PFAD}}
  Request:     {{LINK_AUF_SCHEMA_ODER_INLINE_JSON}}
  Response:    {{LINK_AUF_SCHEMA_ODER_INLINE_JSON}}
  Side-Effects:{{DB-Schreibvorgänge / Events / externe Calls}}

VERBINDLICHE REGELN
- Datei-Pfad: {{EXAKTER_PFAD}}
- Validierung mit Zod, Fehler im Standard-Format.
- Loggen mit pino, Felder: trace_id, customer_id, module, endpoint, took_ms.
- Tests in `*.test.ts` daneben, mind. happy-path + 2 error-paths.
- Falls externe API: Adapter-Pattern (Interface + Implementation getrennt).

OUTPUT
1. Datei-Liste mit Pfaden.
2. Vollständiger Code je Datei.
3. Ein cURL-Beispiel mit allen Pflicht-Headern.
```

---

## Template D — Debugging / Fehlerbehebung

Wann: Es gibt einen Bug, einen failing Test, ein unerwartetes Verhalten in n8n oder Backend.

```
ROLLE
Du bist Reviewer und Debugger im ProzessPilot-Projekt. Du änderst NUR was
nötig ist und hältst dich strikt an die Spec.

KONTEXT
1. Die relevante Spec: /Konzeptentwicklung/modules/{{MODUL_DATEI}}
2. /Konzeptentwicklung/01_Datenmodell_Events.md (für Status-Lifecycle und Events)

EVIDENZ (was ich beobachtet habe)
- Symptom:        {{KURZE_BESCHREIBUNG_DES_FEHLERS}}
- Reproduktion:   {{EXAKTE_SCHRITTE_ODER_EINGABE_JSON}}
- Erwartet:       {{WAS_LAUT_SPEC_PASSIEREN_SOLLTE — Spec-Section nennen}}
- Tatsächlich:    {{WAS_PASSIERT — Stacktrace / Response / Log}}
- Bereits geprüft: {{WAS_DU_SCHON_AUSGESCHLOSSEN_HAST}}

AUFGABE
1. Diagnose: Wo ist die Ursache (Datei, Zeile, Modul, n8n-Node)?
2. Minimaler Fix als Diff (Patch-Format).
3. Welcher Test fehlt, der den Fehler in Zukunft fängt? Schreibe ihn.

REGELN
- Keine Refactorings. Kein „while we're here".
- Wenn der Fehler in der Spec liegt (Spec ist falsch/unvollständig): das
  klar benennen, KEINEN Code ändern, sondern einen Spec-Patch vorschlagen.
- Wenn die Ursache unklar ist: zwei konkrete Hypothesen + jeweils ein
  Mini-Experiment, das sie unterscheidet.

OUTPUT
1. Diagnose (max. 8 Zeilen).
2. Patch (Diff-Format).
3. Neuer Testfall (vollständiger Code).
4. Optional: Spec-Korrektur-Vorschlag.
```

---

## Template E — Pro-Erweiterung / Custom Hook / kundenspezifische Logik

Wann: Ein Pro-Kunde braucht abweichendes Verhalten (z. B. eigener OCR-Provider, eigene Kategorisierungs-Regel, Slack-Notification statt Email). Es darf **nicht** im Kern-Modul landen.

```
ROLLE
Du bist Pro-Customizing-Engineer in ProzessPilot. Erweiterungen kommen
NIEMALS in Kern-Module — nur als Hook-Plugin oder Custom-Modul.

KONTEXT
1. /Konzeptentwicklung/04_Erweiterbarkeit_Pro.md                 (Hook-System, Custom-Module-Lifecycle)
2. /Konzeptentwicklung/02_Kundenprofil_System.md                 (custom-Feld, routing-Parameter)
3. /Konzeptentwicklung/modules/{{BETROFFENES_MODUL}}             (welche Hooks dort existieren)

ANFORDERUNG (vom Kunden)
{{KLARTEXT_ANFORDERUNG, z. B. "Beim Lieferant 'XY' soll der Beleg automatisch
ins Kostenstelle 'event_catering' kategorisiert werden."}}

KUNDE
- customer_id: {{cust_xxxx}}
- Paket: pro

AUFGABE
1. Entscheide: Hook (welcher?) oder Custom-Modul?
   Begründe in 3 Zeilen.
2. Implementiere die Erweiterung als eigenständiges Plugin unter
   `backend/src/plugins/{{customer_id}}/{{plugin_name}}/`.
3. Aktiviere sie über das CustomerProfile (Patch unter `custom.plugins`).
4. Tests, die nur für diesen Kunden laufen (Tag `@customer:{{customer_id}}`).

VERBINDLICHE REGELN
- Kein einziges Kern-Modul anfassen. Wenn die Anforderung das nötig macht
  → STOPP, melde es zurück, schlage einen Hook-Punkt vor, der noch fehlt.
- Plugin muss bei Deaktivierung im Profil sofort weg sein (kein Cleanup-Code im Kern).
- Plugin lädt sich selbst registry-basiert (siehe 04_Erweiterbarkeit_Pro.md §Plugin-Registry).

OUTPUT
1. Entscheidung + Begründung.
2. Datei-Liste mit Pfaden.
3. Code je Datei.
4. Patch fürs CustomerProfile (JSON-Diff).
5. Test-Datei.
```

---

## Template F — Sprint-0-Bootstrap (einmalig, vor allen anderen)

Wann: Genau **einmal** am Projektanfang. Erzeugt das leere Repo-Skelett, in das später alle A/C-Prompts ihre Module schreiben.

```
ROLLE
Senior Engineer im ProzessPilot-Projekt. Du legst ein leeres Repo neu an
nach den Konventionen aus der Architektur-Doku. Keine Business-Logik,
nur Skeleton.

KONTEXT
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/Foundation_Spec.md                        (Sprint-0-Spec, verbindlich §3 Code-Struktur, §4 ENV, §D1 Acceptance)
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
- HMAC-Middleware nur als STUB: wenn `PP_AUTH_DISABLED=1`, no-op;
  sonst 501 (Implementierung kommt in D3, nicht hier).
- Pino mit JSON-Output, ein einziger Smoke-Test in tests/smoke.test.ts.
- .env.example enthält ALLE Variablen aus Foundation_Spec §4.
- README.md mit Setup-Schritten (mkdir, install, compose up, migrate, dev).

OUTPUT (in genau dieser Form)
1. Datei-Tree (alphabetisch) aller zu erzeugenden Dateien mit Pfaden
   relativ zum Repo-Root.
2. Pro Datei ein Codeblock mit dem vollständigen Inhalt.
3. Setup-Schritte als nummerierte Liste, die ein Mensch durchführt:
   "1. mkdir prozesspilot && cd prozesspilot"
   "2. [die Dateien anlegen / git init / commit]"
   "3. cp .env.example .env"
   "4. docker compose up -d"
   "5. cd backend && npm install"
   "6. npm run dev → curl localhost:3000/health"
4. Verifikations-Block: 6 manuelle Checks, die zeigen, dass das Skeleton
   lebt — exakt die 6 Punkte aus Foundation_Spec.md §D1 Acceptance.
5. Decisions: was hast du gewählt, wo die Spec mehrdeutig war? (z. B.
   biome vs. eslint+prettier, Vitest-Config-Style, pg-Pool-Größe).

WICHTIG
- Generiere KEINE Migration-SQL, KEINE Module, KEINEN Auth-Code mit
  echter HMAC-Validierung. Das alles macht D2/D3 in eigenen Prompts.
- Wenn dir Felder in .env.example fehlen, die Spec aber nennt: aufnehmen.
- Wenn du Tools nicht kennst (z. B. n8n self-hosted Image-Tag): den
  jüngsten stabilen Tag wählen, der weit verbreitet ist.
```

---

# SECTION 2 — DER OPERATIVE WORKFLOW

So gehst du **jedes** Modul durch. Nichts überspringen, Reihenfolge ist wichtig.

## Schritt-für-Schritt (für ein Modul z. B. M01)

```
SCHRITT  AKTION                                   TEMPLATE   OUTPUT
────────────────────────────────────────────────────────────────────────────
1        Spec lesen, Acceptance Criteria          —          Verständnis
         ans Whiteboard. Falls unklar:
         Spec patchen, NICHT prompten.
2        Backend-Code generieren                  A          Modul-Ordner
                                                            backend/src/modules/m0X-*/
3        Tests laufen lassen (lokal)              —          Pass/Fail
         npm test -- m0X
4        Bei roten Tests:                         D          Patch-Diff
         Debug-Prompt mit echtem Stacktrace.
5        n8n-Workflow generieren                  B          WF-M0X.json
6        n8n-Workflow importieren, manuell        —          Lauffähiger
         smoketesten (1 echter Beleg).                       Sub-Workflow
7        Acceptance Criteria der Spec             —          Modul "done"
         abhaken. Alle erfüllt? → mergen.
8        Pro-spezifische Anforderungen?           E          Plugin
         (nur wenn vorhanden)                                unter plugins/
```

Faustregel: **Ein Modul = ein Sprint = genau ein A-Prompt + ein B-Prompt + n D-Prompts.**

## Reihenfolge der Module (Aus Roadmap §05_Roadmap.md)

Sprint 0 (Foundation, einmalig vor allen Modulen): **Template F + 8× A/C-Prompts** nach `Foundation_Spec.md §6`. Erst danach hat irgendein Modul-Prompt einen Ort, wohin er Code schreiben kann.

Phase 1 (MVP): **M10 → M01 → M02 → M05 → M07** (ohne KI, ohne DATEV, ohne Reporting).
Phase 2: **M03 → M06 → M08**.
Phase 3 (Pro): **M04 → M09 → Custom-Plugins**.

Pro Modul ist der Workflow oben identisch.

---

# SECTION 3 — END-TO-END BEISPIEL: M01 BELEGERFASSUNG & OCR

So sähe ein realer Sprint aus, vom Öffnen der Spec bis zum mergebaren Code.

## 3.1 Schritt 1 — Spec öffnen

Datei: `/Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md`.
Am Ende stehen 7 Acceptance Criteria — das ist die Definition of Done.

## 3.2 Schritt 2 — Backend generieren (Template A, ausgefüllt)

```
ROLLE
Du bist Senior Backend Engineer (Node.js/TypeScript) und n8n-Architekt im Projekt
ProzessPilot. Du implementierst genau das, was in der angehängten Spec steht —
keine Erfindungen, keine Auslassungen.

KONTEXT (Pflicht-Lesen, in dieser Reihenfolge)
1. /Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md
3. /Konzeptentwicklung/02_Kundenprofil_System.md
4. /Konzeptentwicklung/04_Erweiterbarkeit_Pro.md
5. /Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md

AUFGABE
Generiere das Modul M01 (Belegerfassung & OCR) exakt nach Spec,
Section 16 "Was Claude Code generieren soll".

VERBINDLICHE REGELN
- TypeScript strict, Node 20, Fastify, Zod für Schemas, pg-Treiber (kein ORM).
- Datei-Layout exakt wie in Spec §14 "Code-Struktur".
- Endpoint genau wie in Spec §7.1: POST /api/v1/receipts/{receipt_id}/extract
- Receipt-Felder NIE umbenennen — siehe 01_Datenmodell_Events.md §2.1.
- Idempotency-Key wird IMMER verarbeitet (Tabelle idempotency_keys).
- Events: pp.receipt.extracted | pp.receipt.requires_review | pp.receipt.extraction_failed.
- Fehler-Codes wie in 01_Datenmodell_Events.md §5.5.
- Hooks 'before_extraction' und 'after_extraction' aufrufen (Spec §2 + §7.1).

OUTPUT
1. Liste aller zu erzeugenden Dateien mit absoluten Pfaden.
2. Pro Datei ein Codeblock mit dem vollständigen Inhalt.
3. Am Ende: ein "Verifikation"-Block, der 1:1 die 7 Acceptance Criteria
   aus Spec §17 wiederholt und je Punkt sagt, welche Datei/welcher Test
   ihn erfüllt.

Wenn etwas in der Spec mehrdeutig ist: triff eine Entscheidung, markiere sie
mit `// DECISION:` als Inline-Kommentar und liste alle Decisions am Ende.
```

### Erwarteter Output (Skelett — so sollte Claude Code antworten):

```
Dateien:
  backend/src/modules/m01-receipt-intake/routes.ts
  backend/src/modules/m01-receipt-intake/handlers/extract.handler.ts
  backend/src/modules/m01-receipt-intake/services/field-extractor.ts
  backend/src/modules/m01-receipt-intake/services/validator.ts
  backend/src/modules/m01-receipt-intake/services/confidence-scorer.ts
  backend/src/modules/m01-receipt-intake/services/claude-extractor.ts
  backend/src/modules/m01-receipt-intake/schemas/extract.input.json
  backend/src/modules/m01-receipt-intake/schemas/extract.output.json
  backend/src/modules/m01-receipt-intake/tests/field-extractor.test.ts
  backend/src/modules/m01-receipt-intake/tests/validator.test.ts
  backend/src/modules/m01-receipt-intake/tests/e2e.test.ts
  backend/src/core/adapters/ocr/adapter.interface.ts
  backend/src/core/adapters/ocr/google-vision.adapter.ts
  backend/src/core/adapters/ocr/factory.ts
  backend/migrations/2026_05_01__suppliers_global.sql

[je Datei: vollständiger Code]

Verifikation:
  AC-1 (80% extraction success)  → tests/e2e.test.ts mit fixtures/m01/*.jpg
  AC-2 (Steuerzeilen-Konsistenz) → tests/validator.test.ts „totals_match"
  AC-3 (requires_review)         → tests/e2e.test.ts „low_confidence"
  AC-4 (Hooks)                   → tests/e2e.test.ts „hook_dummy"
  AC-5 (OCR-Adapter pluggable)   → tests/e2e.test.ts „mindee_stub"
  AC-6 (Claude nur Fallback)     → tests/field-extractor.test.ts „regex_first"
  AC-7 (Idempotenz)              → tests/e2e.test.ts „double_call"

Decisions:
  D1: confidence-scorer kombiniert OCR & Field-Extraction-Confidence
      gewichtet 0.4/0.6 (Spec sagt nur „combineConfidence"). Begründung: ...
```

## 3.3 Schritt 3 — Test laufen, ein Test fällt

Beispiel-Failure (echt-realistisch):
```
✕ tests/validator.test.ts > totals_match: tax_lines mit Rundung 0.005 fail
   AssertionError: expected 142.85 to equal 142.84 (diff 0.01)
```

## 3.4 Schritt 4 — Debug-Prompt (Template D, ausgefüllt)

```
ROLLE
Reviewer und Debugger im ProzessPilot-Projekt. Du änderst NUR was nötig ist.

KONTEXT
1. /Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md

EVIDENZ
- Symptom:        validator.test.ts „totals_match" schlägt fehl bei Rundungs-Edge-Case.
- Reproduktion:   tax_lines = [{rate:0.19, base:100.00, amount:19.005}, {rate:0.07, base:20.04, amount:1.40}]
                  total_gross = 142.85, total_net = 120.04
- Erwartet:       checks.totals_match === true (Toleranz 0.02 € laut Spec §10).
- Tatsächlich:    false. Diff ist 0.005 € — sollte innerhalb Toleranz sein.
- Bereits geprüft: Toleranzwert ist im Code 0.005 (statt 0.02 €).

AUFGABE
1. Diagnose.
2. Minimaler Fix als Diff.
3. Test, der dieses Edge-Case in Zukunft fängt.

REGELN
- Keine Refactorings.
- Wenn Spec falsch ist: melde es, kein Code-Change.
```

### Erwarteter Output:

```
Diagnose: validator.ts Zeile 42 verwendet TOLERANCE = 0.005, Spec §10 sagt 0.02 €.

Patch:
- const TOLERANCE = 0.005;
+ const TOLERANCE = 0.02;

Neuer Test (validator.test.ts):
it('totals_match akzeptiert 0.01 € Rundung (Spec-Toleranz 0.02)', () => { ... })
```

## 3.5 Schritt 5 — n8n-Workflow generieren (Template B, ausgefüllt)

```
ROLLE
n8n-Spezialist im Projekt ProzessPilot. Dünne Orchestrierung, Backend-HTTP-Calls,
keine Business-Logik in n8n.

KONTEXT
1. /Konzeptentwicklung/03_n8n_Workflows.md
2. /Konzeptentwicklung/01_Datenmodell_Events.md
3. /Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md (Section 6)

AUFGABE
Erzeuge `WF-M01` als importierbares JSON.

VERBINDLICHE REGELN
- Node-Namen exakt wie Spec §6: Trigger, Function: assert_status,
  Backend: Extract, IF: ok, Build: Result, Respond.
- Trigger: Execute Workflow, Schema gemäß Spec §5.1.
- HTTP-Call: POST {{BACKEND_URL}}/api/v1/receipts/{{$json.receipt.receipt_id}}/extract
- Header: Idempotency-Key={{$json.idempotency_key}}, X-Customer-ID={{...}},
  X-Trace-ID={{...}}, X-PP-Signature (Credential `pp-backend-hmac`).
- Retry 3× exponential für 5xx; keine Retries für 4xx.
- Bei response.ok===false → Respond to Workflow mit {ok:false, module:"M01", error:{...}}.

OUTPUT
1. Datei: n8n/workflows/WF-M01.json
2. Setup-Schritte (Credentials anlegen, Sub-Workflow registrieren).
```

## 3.6 Schritt 6 — Smoketest mit echtem Beleg

In n8n: `WF-MASTER-RECEIPT` triggern mit einem Test-Beleg-JSON. Ergebnis muss `status: "extracted"` und Event `pp.receipt.extracted` haben. Wenn nein → zurück zu Schritt 4 mit Template D.

## 3.7 Schritt 7 — Acceptance abhaken

Alle 7 Punkte aus Spec §17 grün → M01 ist fertig. Commit, mergen, weiter mit M02.

---

# SECTION 4 — BEST PRACTICES (TOKEN & QUALITÄT)

## 4.1 Wann Kontext wiederholen, wann nicht

| Situation                                                    | Kontext anhängen?       |
|--------------------------------------------------------------|-------------------------|
| Neue Konversation / neuer Sprint                             | **Ja**, alle 5 Doks.    |
| Folge-Prompt im selben Sprint, Claude hat Spec schon gelesen | Nein. Nur Kurz-Verweis. |
| Bug-Fix mit Stacktrace                                       | Nur Spec + Stacktrace.  |
| Cross-Modul-Feature (z. B. M03 ↔ M01)                        | Beide Specs + 01.       |
| Pro-Plugin                                                   | 04 + betroffene Spec.   |

Faustregel: **Wenn Claude einen Konflikt zwischen Spec und seiner Antwort lösen muss, hatte er die Spec wahrscheinlich nicht.** Lieber einmal zu viel anhängen als zu wenig.

## 4.2 Prompts kurz halten — die 4 Hebel

1. **Statt erklären → verlinken.** „Receipt-Schema: siehe 01_Datenmodell_Events.md §2.1" ist kürzer und präziser als das Schema inline.
2. **Liste statt Prosa.** Verbindliche Regeln als Bullet-Points, nicht als Fließtext.
3. **Output-Form vorgeben.** Wenn du sagst „1. Datei-Liste, 2. Code, 3. Verifikation", spart das Tokens vs. „mach was sinnvoll ist".
4. **Variable-Slots benennen.** `{{MODUL_DATEI}}` ist eindeutiger als „die Datei mit der Spec".

## 4.3 Wann NICHT neu generieren

- Fix für einen Bug, der ≤ 30 Zeilen betrifft → **Template D, Patch-Diff.** Nicht das ganze Modul neu.
- Refactor in nur einer Datei → einzelner C-Prompt mit Datei-Pfad. Nicht A.
- Spec-Verständnisfrage → einfach lesen oder fragen, nicht generieren.

Faustregel: **Generieren ist die teuerste Operation. Erst lesen, dann patchen, dann erst regenerieren.**

## 4.4 Iteration: 3-Runden-Maximum

Wenn nach 3 Iterationen ein Modul nicht grün wird → **Spec ist die Ursache, nicht der Code.** Stoppen, Spec anschauen, Spec präzisieren, dann frischer A-Prompt.

## 4.5 Decisions immer dokumentieren

Jede `// DECISION:` aus Claudes Output kommt am Ende des Sprints in die Spec-Datei (z. B. unter neuem `§18 Implementation Notes`). Sonst gehen sie verloren.

## 4.6 Hooks NIE im Prompt vergessen

Wenn die Spec Hooks definiert (`before_extraction` etc.), MUSS der A-Prompt das explizit auflisten. Sonst lässt Claude sie weg und Pro-Plugins sind tot.

---

# SECTION 5 — HÄUFIGE FEHLER (GUT vs. SCHLECHT)

Pro Beispiel: schlechter Prompt → was schiefgeht → guter Prompt → warum er funktioniert.

## Fehler 1 — Zu vage

**Schlecht:**
```
Bau mir bitte das OCR-Modul für ProzessPilot.
```
Was schiefgeht: Claude rät bei Endpoints, JSON-Feldnamen, Datei-Pfaden. Receipt-Schema wird neu erfunden (`receiptID` statt `receipt_id`). Kein Idempotency. Tests fehlen.

**Gut:** Template A mit `MODUL_DATEI=M01_Belegerfassung_OCR.md`. Spec wird angehängt, Acceptance Criteria sind die Definition of Done.

Warum: **Der Vertrag (Spec) ist im Prompt. Claude hat keine Freiheit, etwas zu erfinden, das es bricht.**

## Fehler 2 — Spec nicht lesen lassen

**Schlecht:**
```
Schreib mir den Extract-Endpoint, hier mein Skizzen-Code:
async function extract(...) { /* ... */ }
```
Was schiefgeht: Claude folgt deiner Skizze, ignoriert Hooks, Validator, Confidence-Scoring. M01 läuft, aber Pro-Plugins greifen ins Leere, Validation fehlt.

**Gut:**
```
Implementiere den Extract-Endpoint exakt nach
/Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md §7.1.
Pflicht: Hooks before/after_extraction, Validator §10, Confidence-Scorer.
```

Warum: **Verweis auf Section, nicht auf Skizze.** Die Spec ist vollständiger als jede Skizze.

## Fehler 3 — Ganzes Modul neu generieren bei Mini-Bug

**Schlecht:**
```
Der Validator-Test schlägt fehl. Bitte M01 nochmal komplett neu generieren.
```
Was schiefgeht: Du verlierst alle Decisions aus der ersten Runde, Tests werden umbenannt, Diff ist unreviewable.

**Gut:** Template D mit Stacktrace. Output ist ein Patch-Diff von 3 Zeilen.

Warum: **Patch ist reviewable, regenerierter Code ist Lottospiel.**

## Fehler 4 — Pro-Logik in Kern-Modul drücken

**Schlecht:**
```
In M03: wenn customer_id===cust_a3f4b2 und supplier===Metro,
dann Kategorie immer 'wareneinkauf_food'.
```
Was schiefgeht: Kern-Code wird kundenspezifisch verseucht. Beim nächsten Pro-Kunden wird's noch schlimmer. Tests werden brüchig.

**Gut:** Template E. Plugin unter `backend/src/plugins/cust_a3f4b2/metro-rule/`. Aktivierung über Profil. Kern-M03 bleibt unberührt.

Warum: **Erweiterbarkeit ist der ganze Sinn von Pro. Kein Plugin = kein Pro.**

## Fehler 5 — Kein Output-Format vorgeben

**Schlecht:**
```
Mach mir den n8n-Workflow für M01.
```
Was schiefgeht: Claude antwortet mit Markdown-Erklärung, nicht mit importierbarem JSON. Du musst hand-konvertieren.

**Gut:** Template B. Explizit: „OUTPUT: Eine Datei `n8n/workflows/WF-M01.json` im n8n-Export-Format."

Warum: **Output-Form ist Teil des Vertrags.** Sonst bekommst du Prosa.

## Fehler 6 — Acceptance Criteria weglassen

**Schlecht:**
```
Bau M01 nach Spec. Wenn Tests grün sind, sind wir fertig.
```
Was schiefgeht: „Tests grün" heißt nichts, wenn die Tests die Spec nicht abdecken. Hook-Aufruf fehlt → Test grün, Modul kaputt.

**Gut:** Template A mit explizitem Verifikations-Block, der die 7 Acceptance Criteria 1:1 wiederholt.

Warum: **Acceptance Criteria = Definition of Done. Was nicht abgehakt wird, gilt als nicht implementiert.**

## Fehler 7 — Mehrere Module in einem Prompt

**Schlecht:**
```
Bau M01, M02 und M03 in einem Rutsch, sind ja alles Beleg-Module.
```
Was schiefgeht: Output ist riesig, Claude verkürzt überall („für M02 analog"), Tests fehlen, Decisions kollidieren.

**Gut:** Drei separate A-Prompts, einer pro Modul. Reihenfolge nach Roadmap.

Warum: **Ein Modul pro Prompt = ein Diff pro Review = ein Sprint.** Skaliert sauber.

---

# ANHANG — Prompt-Datei-Template (für eigene Sprints)

Lege pro Sprint eine Datei an: `/Konzeptentwicklung/_sprints/M0X_prompt.md`.
Inhalt: nur die ausgefüllten Templates, die du benutzt hast (kein Code, keine Logs). Macht jede Generation in 6 Monaten reproduzierbar.

```
# Sprint M0X — {{Datum}}

## A-Prompt (verwendet)
{{eingefügt}}

## D-Prompts (Bug-Fixes)
1. {{eingefügt}}
2. ...

## B-Prompt (n8n)
{{eingefügt}}

## Decisions (aus Claudes Output, übernommen in Spec §18)
- D1: ...
- D2: ...
```
