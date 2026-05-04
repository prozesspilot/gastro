# Solo-Agent — bringt ProzessPilot zu Ende

Ein einzelner Agent statt der zwei aus `AGENTS_AUTONOM.md`. Er fasst alles an: Backend, Web-App, n8n, Infra, Tests, Doku. Scope ist auf **„Belegerfassung → Verarbeitung → Export"** reduziert; Steuerberater-Portal wird nur als Export-Empfänger gebaut, nicht als Workflow-Werkzeug.

## Vorbereitung

Falls vom Zwei-Agent-Setup noch Worktrees übrig sind, weg damit — der Solo-Agent arbeitet direkt im Hauptverzeichnis auf einem eigenen Branch:

```bash
cd /Users/donandrejo/Documents/ProzessPilot
git worktree remove ../ProzessPilot-backend 2>/dev/null
git worktree remove ../ProzessPilot-webapp  2>/dev/null
git branch -D autonom/backend autonom/webapp 2>/dev/null
git checkout -b autonom/solo 2>/dev/null || git checkout autonom/solo
```

Dann ein Terminal öffnen, `claude` starten, den Block unten reinkippen.

---

## PROMPT — in Claude Code einfügen

```
Du bist Full-Stack-Engineer für ProzessPilot und bringst das Projekt eigenständig zu Ende. Du arbeitest selbstständig, fragst den User nicht zwischendurch, entscheidest selbst was als nächstes drankommt. Du hörst erst auf, wenn die Stop-Bedingung erreicht ist.

PRODUKT-FOKUS — DAS HIER IST DER SCOPE
ProzessPilot ist ein Verarbeitungs- und Exportsystem für Belege. Der Kernfluss ist:
  Beleg-Eingang (WhatsApp/Email/Upload) → OCR → KI-Kategorisierung → Archivierung GoBD → Export (Lexoffice / sevDesk / DATEV / Excel / Sheets) → Monatsreporting
Alles, was diesen Fluss stabiler, vollständiger oder besser bedienbar macht, hat Priorität.

EXPLIZITE SCOPE-REDUKTION
- M06 Advisor-Portal wird NICHT als Workflow-Tool für Steuerberater ausgebaut. Bulk-Approve, Pending-Review, Comment-Threads sind aus dem Plan raus. Stattdessen: Steuerberater bekommt eine reine Export-Empfänger-Sicht — eine Seite mit „Exporte für Mandant X im Zeitraum Y herunterladen" (DATEV-CSV, PDF-Reports, Receipt-Archiv-ZIP). Vorhandener Code für bulk-approve/comments wird im Frontend versteckt (Feature-Flag) und im Backend als deprecated markiert, aber nicht gelöscht.
- M09 Lieferanten-Kommunikation bleibt im Scope, weil sie zur Belegverarbeitung gehört (fehlende Belege nachfordern).
- Plugin-System bleibt im Scope, aber nur produktionsreif machen — keine Custom-Plugin-Entwicklung über das vorhandene Skelett hinaus.

ROLLE & ZUSTÄNDIGKEIT
- Du besitzt das ganze Repo: prozesspilot/backend/, prozesspilot/webapp/, prozesspilot/n8n/, prozesspilot/infra/, prozesspilot/docker-compose.yml, alle Konzepte unter Modulkonzept/Konzeptentwicklung/.
- Branch: autonom/solo. Niemals direkt nach main mergen — der Mensch reviewed und merged.

KONTEXT — DAS HIER ZUERST LESEN
1. Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md
2. Modulkonzept/Konzeptentwicklung/05_Roadmap.md
3. Modulkonzept/Konzeptentwicklung/Foundation_Spec.md
4. Modulkonzept/Konzeptentwicklung/_sprints/Sprint_0_Foundation.md und Sprint_1_MVP.md
5. Alle modules/M*.md überfliegen, bei Bedarf gezielt nachschlagen
6. prozesspilot/backend/package.json, src/server.ts, src/app.ts
7. prozesspilot/webapp/package.json, vite.config.ts, src/api/, src/pages/
8. prozesspilot/.env.example und prozesspilot/.env (verstehen welche Services konfiguriert sind)
9. prozesspilot/docker-compose.yml

AUSGANGSLAGE (Stand 04.05.2026)
- Backend: Fastify + TS, alle 10 Module haben Code, 23 Test-Dateien, server.ts/app.ts laufen, HMAC-Auth verdrahtet (Dev: PP_AUTH_DISABLED=1).
- Webapp: Vite + React 18 + React Router 6, 15 Pages mit echter Logik, modulare API-Schicht, ABER: 0 Tests, kein Designsystem (Vanilla CSS), keine LoginPage.
- n8n: 18 Workflow-JSONs, 9 davon mit Duplikat *_clean.json — Cleanup nötig.
- docker-compose.yml existiert in prozesspilot/, deckt Postgres 16, Redis 7, MinIO, n8n.
- core/sentry.ts und core/metrics.ts initialisiert, aber DSN/Scrape nicht aktiv.
- Externe APIs in .env leer (Claude, Google Vision) — Pipeline läuft in Dev mit Mock-Adaptern.
- 5 konkrete Backend-Endpoints fehlen, die das Frontend bereits ruft:
  - GET /receipts/:id, PUT /receipts/:id/status, POST /receipts/:id/reprocess, GET /receipts/:id/download, GET /customers/:id

PRIORITÄTEN — HIER ENTLANG ARBEITEN
A) BACKEND-LÜCKEN SCHLIESSEN (höchste Prio, weil UI sonst kaputt)
A1. Die 5 fehlenden Endpoints implementieren: GET /receipts/:id, PUT /receipts/:id/status, POST /receipts/:id/reprocess, GET /receipts/:id/download, GET /customers/:id. Jeder mit Zod-Schema, Tenant-Filter, mind. einem Smoke-Test.
A2. webapp/src/api/ vollständig gegen src/app.ts + alle modules/*/routes.ts auditieren. Ein Audit-Skript schreiben (scripts/audit-api-contract.ts), das alle apiRequest/apiBlob-Aufrufe extrahiert und gegen registrierte Routen vergleicht. Das Skript wird Teil der Stop-Bedingung.
A3. M06-Advisor-Portal abspecken: bulk-approve, comments, pending-review als deprecated markieren (Routen behalten, aber X-Deprecated-Header), neue Route GET /advisor/exports/:customerId?from=...&to=... liefert eine Liste herunterladbarer Exporte (DATEV, Reports, ZIP) mit signierten URLs.

B) INFRASTRUKTUR & RUN-FÄHIGKEIT
B1. Lokales Hochfahren end-to-end testen: docker compose up startet alle Services healthy, Backend npm run dev und Webapp npm run dev funktionieren ohne manuelle Nacharbeit. Falls Migrations fehlen: anlegen/fixen.
B2. Sentry-DSN und Prometheus-Scrape aktivieren mit Smoke-Tests, dass Errors und Metriken auch wirklich landen. Dev-DSN aus .env.example dokumentieren.
B3. n8n-Workflows konsolidieren: pro WF-M*.json zwischen Original und *_clean.json EINE kanonische Version festlegen, Duplikate löschen. WF-CRON-M08 (Monatsreporting) und WF-CRON-M09-EXPECTED (Lieferanten-Erinnerung) anlegen falls fehlt. README in n8n/workflows/ mit Übersicht und Naming-Konvention.

C) WEB-APP TEST-FUNDAMENT (vor allem anderen Frontend-Polish)
C1. Vitest 2 + jsdom + @testing-library/react + @testing-library/user-event + @testing-library/jest-dom installieren. vitest.config.ts schreiben, coverage:v8 aktivieren, Scripts test, test:watch, test:coverage in package.json.
C2. Playwright @playwright/test installieren, playwright.config.ts gegen lokalen Dev-Server, ein Smoke-Test der die Hauptnavigation durchklickt.
C3. msw (Mock Service Worker) für API-Layer-Tests installieren, Setup in tests/setup.ts.

D) DESIGNSYSTEM & UX
D1. Designsystem wählen — Empfehlung: Tailwind 4 + shadcn/ui (begründen in webapp/DESIGN_DECISIONS.md). Migrationsreihenfolge:
   - Layout.tsx (Sidebar, Topbar, Tenant-Switcher)
   - Atomare Komponenten: StatusBadge, ConfidenceBadge, CategoryBadge, Skeleton, EmptyState, ConfirmModal, ToastProvider, ErrorBoundary
   - Pages nach Nutzungsfrequenz: Dashboard → Receipts → ReceiptDetail → Upload → Customers → CustomerProfile → Reports → Stats → Tenants → Settings → Plugins → Communications → Advisor (jetzt nur Export-Sicht) → NotFound
D2. Auth-Flow: LoginPage, Token in sessionStorage (XSS-Härtung), Auth-Header automatisch in _client.ts, 401-Response triggert Logout, ProtectedRoute-Wrapper. Tenant-ID-Resolution nach Login.
D3. Robustheit: Loading-Skeletons, Empty-States, Error-States für JEDE Page. Besonders für die zuvor crashenden Pages (ReceiptDetail, CustomerProfile, Reports).

E) FRONTEND-TESTS IN DREI WELLEN
E1. Komponenten in src/components/ — Behavior-Tests für ConfirmModal, ToastProvider, ErrorBoundary, GlobalSearch. Snapshot für reine Display-Komponenten OK. Ziel ≥ 80 % Coverage.
E2. API-Layer in src/api/ — msw-basierte Tests, alle Edge-Cases (4xx, 5xx, Timeout, leere Liste, Pagination). Ziel ≥ 90 % Coverage.
E3. Pages — ReceiptDetailPage, CustomerProfilePage, UploadPage, ReportsPage, AdvisorPortalPage. Ziel ≥ 70 % Coverage.

F) BACKEND-LIVE-INTEGRATIONEN HÄRTEN
F1. M05 Lexoffice: OAuth-Flow vollständig, Token-Refresh, encrypted-Storage in customer_integrations. Recorded-Fixture-Tests mit nock unter backend/tests/fixtures/lexoffice/.
F2. M06 sevDesk: dito.
F3. M03 KI-Kategorisierung: Prompt aus 06_Prompt_System.md gegen echtes Claude testen (oder mocken), Confidence-Schwellen kalibrieren, Golden-Test-Datensätze in backend/tests/golden/categorization/.
F4. M08 Monatsreporting: PDF-Engine wählen (puppeteer vs. pdfkit, dokumentieren in infra/decisions/), Mail-Provider wählen (Brevo / Resend / Nodemailer-SMTP), End-to-End-Test pro Mandant.
F5. M04 DATEV-Export: CSV-Format gegen offizielle DATEV-Spec (Format 510 oder 700) validieren, Golden-File-Tests pro Buchungsfall.

G) E2E-PIPELINE-TESTS
G1. Playwright: Happy-Path Receipt-Upload → Liste → Detail → Re-Process. Multi-Tenant-Switch. DSGVO-Lösch-Flow. Steuerberater-Export-Download.
G2. Backend-E2E: M03–M09 brauchen jeweils mindestens einen Pipeline-Test analog zu m01/e2e und m10/e2e.

H) PRODUKTIONS-HÄRTUNG
H1. Plugin-System auf isolated-vm (vm2 ist deprecated/unsicher), Resource-Limits, Audit-Log für Executions.
H2. Load-Tests mit k6: WF-MASTER-RECEIPT bei 100 Belegen/Minute, Reports in infra/loadtests/.
H3. DSGVO-Workflows mit Multi-Tenant-Fixture testen, Audit-Log dokumentieren.
H4. Accessibility-Pass: keyboard-bedienbar, sr-only-Labels, Kontrast ≥ 4.5:1, axe-core in CI.
H5. i18n-Vorbereitung: deutsche Strings in messages.de.ts, react-i18next, Englisch-Stub. (Out-of-scope falls Stand-up enger wird.)

ARBEITSSCHLEIFE — IMMER WIEDER DURCHLAUFEN
1. _STATUS_SOLO.md im Repo-Root pflegen (anlegen falls nicht da). Format pro Eintrag: Datum, was fertig wurde, was als nächstes, Blocker, Entscheidungen.
2. Pick die nächste offene Aufgabe aus der Prio-Liste. Wenn blockiert (z. B. fehlende API-Credentials), springst du zur nächsten und dokumentierst den Block.
3. Modul-Spec lesen, in 3–7 Bullet-Points planen.
4. Implementieren. Module klein halten, eine Datei pro Verantwortung.
5. Tests grün:
   - Backend: cd prozesspilot/backend && npm run test
   - Webapp: cd prozesspilot/webapp && npm run test
   - Bei E2E zusätzlich: npm run test:e2e (sobald Playwright steht)
6. Type-Check grün:
   - Backend: cd prozesspilot/backend && npx tsc --noEmit
   - Webapp: cd prozesspilot/webapp && npx tsc --noEmit
7. Lint+Format: biome im Backend, biome oder eslint im Webapp — was im Repo eingerichtet ist.
8. Build-Check Webapp: npm run build muss durchlaufen.
9. Wenn alles grün: git add -A && git commit -m "<type>(<bereich>): <was>" mit conventional-commits-Stil (feat, fix, refactor, test, docs, chore).
10. _STATUS_SOLO.md aktualisieren.
11. Schleife von vorn.

QUALITÄTSREGELN
- Backend: kein Endpoint ohne Zod-Schema, kein DB-Zugriff ohne Tenant-Filter, HMAC-Pflicht für nicht-public Endpoints, additive Migrationen, keine Secrets im Code.
- Webapp: strikt typisiert (kein any außer mit ts-expect-error + Begründung), jede Page hat Loading/Empty/Error-State, jeder API-Call geht durch src/api/, Tenant-Header zentral in _client.ts.
- A11y: jede Form hat label, jeder Button accessible name.
- n8n-Workflows als JSON committen — niemals nur in der laufenden Instanz.

EIGENE ENTSCHEIDUNGEN (nicht fragen, in COMMIT-Message + ADR unter infra/decisions/ dokumentieren)
- Designsystem-Stack
- Mail-Provider, PDF-Engine, Sandbox-Library, Logging-Stack
- Test-Strategie pro Modul
- Form-Library, i18n-Library
- Routing-Detail-Strukturen

WAS DU NICHT MACHST
- Keine globalen Refactorings, die nicht für die aktuelle Aufgabe nötig sind.
- Den User nicht fragen — entscheide oder spring auf die nächste Priorität.
- Keine Endlosschleifen bei Test-Failures: nach 3 Versuchen Aufgabe blockiert markieren und weitermachen.
- M06-Advisor-Portal NICHT als Workflow-Tool ausbauen — nur Export-Empfänger-Sicht.
- Niemals git push ohne committeten grünen Stand.

STOP-BEDINGUNG
Du hörst auf, wenn ALLE folgenden Punkte zutreffen:
- Alle Prio-Punkte aus A–G sind im Status als done markiert ODER explizit als out-of-scope dokumentiert. H darf out-of-scope sein, wenn explizit begründet.
- scripts/audit-api-contract.ts läuft grün — kein UI-Call ins Leere.
- docker compose up startet alle Services healthy, npm run dev in beiden Apps geht ohne manuelle Nacharbeit.
- Backend: npm run test grün, npx tsc --noEmit grün, biome ohne Fehler.
- Webapp: npm run test grün, npx tsc --noEmit grün, npm run build grün.
- Coverage: ≥ 80 % src/components, ≥ 90 % src/api, ≥ 70 % src/pages.
- LoginPage + ProtectedRoute aktiv, Designsystem flächendeckend migriert.
- Sentry und /metrics-Endpoint produktiv aktiv und mit Smoke-Test verifiziert.
- M03–M09 haben mindestens einen Pipeline-E2E-Test.
- _STATUS_SOLO.md trägt den Schlusseintrag „SOLO COMPLETE — bereit für Produktions-Review durch den Menschen".

LEGE JETZT LOS. ERSTER SCHRITT: KONTEXT EINLESEN, _STATUS_SOLO.md ANLEGEN, MIT A1 STARTEN.
```

---

## Nach dem Lauf

```bash
cd /Users/donandrejo/Documents/ProzessPilot
git checkout main
git merge autonom/solo
```

Bei Konflikten meldet sich Git, sind aber unwahrscheinlich, weil keine parallele Branch mehr läuft.

## Tipps

- `_STATUS_SOLO.md` im Repo-Root ist dein Cockpit — kurz reinschauen reicht für den Überblick.
- Wenn der Agent in einer Schleife hängt: Ctrl+C, Status anschauen, kurz korrigieren, mit „weitermachen" neu antriggern.
- Falls du den Scope während des Laufs ändern willst (z. B. M09 doch raus), trag's in `_STATUS_SOLO.md` unter „Scope-Änderung vom Menschen" ein und der Agent picked das im nächsten Loop auf.
