# CLEANUP_PLAN.md

Stand: 2026-05-07
Erstellt durch: Aufraeum-Agent (Phase 1, nur lesend)

## Ziel
Aus dem aktuell fragmentierten Repository-Zustand wird eine einzige saubere Quelle der Wahrheit:
- Genau ein Branch: `main`
- Genau ein Worktree: `/Users/donandrejo/Documents/ProzessPilot`
- Eine kanonische Version jeder n8n-Workflow-Datei
- Konsolidierte Status- und Anleitungs-Dokumentation
- `STRUCTURE.md` im Repo-Root

---

## Section 1 — Inventory Summary

### 1.1 Branches

| Branch              | HEAD     | Letzter Commit (Datum)        | Unique Commits vs. autonom/main | Worktree                                |
|---------------------|----------|-------------------------------|---------------------------------|-----------------------------------------|
| `autonom/main`      | a1ebd76  | 2026-05-01 18:53 (initial)   | 0                               | (keiner)                                |
| `autonom/solo`      | c34b690  | 2026-05-04 22:21              | 22                              | `/Users/donandrejo/Documents/ProzessPilot` (HEAD) |
| `autonom/backend`   | 1495cd8  | 2026-05-04 13:46              | 6                               | `../ProzessPilot-backend`               |
| `autonom/webapp`    | 540b589  | 2026-05-04 13:34              | 2                               | `../ProzessPilot-webapp`                |

Gemeinsamer Ancestor aller Branches: `a1ebd76` (autonom/main, "initial import"). Es gibt KEIN lokales `main`-Branch.

### 1.2 Branch-Cross-Compare

- `autonom/solo` ↔ `autonom/backend`: 393 Dateien differieren, ca. 12 253 Zeilen +/16 408 Zeilen − netto.
- `autonom/solo` ↔ `autonom/webapp`: 206 Dateien differieren, ca. 15 341 Zeilen +/16 143 Zeilen − netto.
- `autonom/solo` enthaelt 22 unique Commits, von denen mehrere ("feat(b3-c2): n8n cleanup", "feat(c1-d2): auth flow + tests", "feat(c1-d1-e1-e3): more tests") inhaltlich Webapp-Themen abdecken, die `autonom/webapp` als Ausgangspunkt hatte.
- `autonom/solo` ist chronologisch und semantisch die juengste Iteration; sie integriert Test-/Webapp-Arbeit und ergaenzt Receipt-/Routing-Backend-Routen.

### 1.3 Worktrees

| Pfad                                                  | Branch            | git status      | Groesse | Aktion           |
|-------------------------------------------------------|-------------------|-----------------|---------|------------------|
| `/Users/donandrejo/Documents/ProzessPilot`            | autonom/solo      | 23 modified, 9 untracked | 611 M   | BEHALTEN (=> main) |
| `/Users/donandrejo/Documents/ProzessPilot-backend`    | autonom/backend   | sauber          | 428 M   | ENTFERNEN        |
| `/Users/donandrejo/Documents/ProzessPilot-webapp`     | autonom/webapp    | sauber          | 249 M   | ENTFERNEN        |

### 1.4 Uncommittete Aenderungen im Hauptverzeichnis (autonom/solo)

23 modifizierte Dateien (1 510 Zeilen + / 253 Zeilen −), unter anderem:
- `prozesspilot/backend/src/app.ts` (+2)
- `prozesspilot/backend/src/core/adapters/ocr/mindee.adapter.ts` (+27/-)
- `prozesspilot/backend/src/core/n8n/client.ts` (+20)
- `prozesspilot/backend/src/modules/receipts/receipt.routes.ts` (+97/-)
- `prozesspilot/backend/src/modules/routing/handlers/plan.handler.ts` (+69/-)
- `prozesspilot/n8n/workflows/WF-MASTER-RECEIPT.json` (+627/-) — grosse Erweiterung
- `prozesspilot/n8n/workflows/WF-CRON-M09-EXPECTED.json`, `WF-PLUGIN-DISPATCHER.json` — kleinere Updates
- `prozesspilot/webapp/src/pages/CustomerProfilePage.tsx` (+261, neu eingefuehrt)
- `prozesspilot/webapp/src/api/customers.ts` (+124/-)
- `prozesspilot/webapp/src/types.ts` (+23)

9 untracked Eintraege:
- `prozesspilot/backend/src/modules/m11-imap/` (neues Modul)
- `prozesspilot/migrations/026_sevdesk.sql`
- `prozesspilot/migrations/027_datev.sql`
- `prozesspilot/migrations/028_tax_advisor_portal.sql`
- `prozesspilot/migrations/029_m09_supplier_comm.sql`
- `prozesspilot/migrations/030_plugin_registry.sql`
- `prozesspilot/n8n/workflows/WF-INPUT-IMAP.json`
- `prozesspilot/n8n/workflows/WF-INPUT-UPLOAD.json`
- `prozesspilot/.claude/agent-memory/prozesspilot-senior-dev/project_pipeline_wiring.md`

Diese Aenderungen sind als nachfolgende Iteration auf `autonom/solo` zu verstehen; sie werden vor jeder destruktiven Operation als WIP-Commit gesichert.

### 1.5 Workflow-Duplikate (`*_clean.json`)

Im Hauptverzeichnis (autonom/solo) existieren KEINE `_clean.json`-Dateien mehr — die Konsolidierung hat dort bereits stattgefunden.

Im `autonom/webapp`-Worktree existieren noch 4 Duplikat-Paare:

| Paar in webapp-Worktree                | groesse non-clean | groesse _clean |
|----------------------------------------|-------------------|----------------|
| `WF-M01.json` / `WF-M01_clean.json`           | 6 937 B          | 5 827 B        |
| `WF-M02.json` / `WF-M02_clean.json`           | 7 343 B          | 5 827 B        |
| `WF-M07.json` / `WF-M07_clean.json`           | 7 403 B          | 5 852 B        |
| `WF-INPUT-WHATSAPP.json` / `WF-INPUT-WHATSAPP_clean.json` | 9 239 B   | 17 713 B       |

Die non-clean-Versionen in webapp sind byte-identisch mit den im autonom/solo-Branch gepflegten kanonischen Dateien (gleiche Groesse). Da `autonom/webapp` ohnehin geloescht wird, verschwinden die `_clean.json`-Duplikate damit automatisch. Im verbleibenden Repo ist Phase 4 effektiv schon umgesetzt.

### 1.6 Status- und Anleitungsdateien

Im Hauptverzeichnis vorhanden:

| Datei                                       | Aktion                              | Begruendung |
|---------------------------------------------|-------------------------------------|-------------|
| `AGENT_SOLO.md` (root)                      | BEHALTEN, Header-Hinweis hinzu      | Anleitungs-Doku fuer Mensch (Vorgabe) |
| `AGENTS_AUTONOM.md` (root)                  | BEHALTEN, Header-Hinweis hinzu      | Anleitungs-Doku fuer Mensch (Vorgabe) |
| `prozesspilot/_STATUS_SOLO.md`              | ARCHIVIEREN nach `docs/archive/`    | Veralteter Session-Status |
| `prozesspilot/TERMINAL2_STATUS.md`          | ARCHIVIEREN nach `docs/archive/`    | Veralteter Session-Status (Session 4) |
| `prozesspilot/backend/IMPLEMENTATION_STATUS.md` | PRUEFEN — vermutlich behalten | Modul-Implementierungsstatus, koennte aktuell sein |
| `prozesspilot/webapp/DESIGN_DECISIONS.md`   | BEHALTEN                            | ADR-aehnliche Designentscheidungen |
| `prozesspilot/n8n/README.md`                | BEHALTEN                            | Workflow-Dokumentation |
| `prozesspilot/README.md`, `prozesspilot/infra/README.md` | BEHALTEN                  | Standard-READMEs |

Alte Top-Level-Dateien (`prompt_terminal*.txt`, `aufgaben_*.txt`, `agent_system_prompt*.txt`, `prozesspilot_gesamtkonzept.html`, `ProzessPilot_Status_Mai2026.html`, `ProzessPilot_Fortschritt.html`):
- BEHALTEN AS-IS — diese sind benutzergetriebene Konzept-/Prompt-Dateien, keine Agent-Statusberichte. Nicht im Scope dieses Cleanups.

### 1.7 Sonstiges

- Keine bestehenden Tags (`git tag` → leer).
- Top-Level docker-compose-Dateien gibt es bereits (in `prozesspilot/docker-compose.yml` und `infra/monitoring/docker-compose.yml`).
- `.gitignore` deckt node_modules/dist/coverage/etc. ab.

---

## Section 2 — Diff-Analyse pro Branch

### 2.1 `autonom/solo` (=> wird main)
22 unique Commits, alle inhaltlich behalten. Weitere Iteration als WIP-Commit aus dem Working Tree des Hauptverzeichnisses.

### 2.2 `autonom/backend` — ENTSCHEIDUNG: NICHT mergen, archivieren via Backup-Tag
6 unique Commits gegenueber autonom/main:
1. `2e1a3a9 feat(api): close webapp gaps — reprocess, download, categories`
2. `9874b30 test(m05/m06): fixture-replay tests for lexoffice & sevdesk clients`
3. `2c51d7b feat: M03 confidence kalibrieren, M08 SMTP, M04 golden file, M09 expected-check`
4. `940e77e feat: plugin sandbox haerten, DSGVO audit, observability tests, loadtests`
5. `7f72e6e feat: API-audit script, repo-root docker-compose, n8n consolidation`
6. `1495cd8 feat: M03-M09 E2E-Tests, DATEV-Buchungsfaelle, customer_integrations + OAuth-Skeleton`

**Diff-Befund**: 393 Dateien differieren zu autonom/solo, 12 253 + / 16 408 −. Die backend-Branch hat eine **logisch andere Backend-Architektur**:
- Eigene Modul-Struktur unter `_shared/customers`, `_shared/errors`, `_shared/receipts`
- Eigene `dsgvo`-Routen, Hooks-System (`hook-runner`, `request-logging`)
- Eigene Test-Files (m05/m06 fixture-replay, golden files)

`autonom/solo` hat eine **andere, neuere Iteration** dieser Module (m05-lexoffice, m06-sevdesk als eigene Module statt unter _shared, andere routes/-Struktur). Ein Merge wuerde semantische Konflikte in Dutzenden Dateien produzieren, die NICHT aus dem Code-Inhalt heraus eindeutig aufloesbar sind. Unique Code aus dem backend-Branch (z.B. M03-M09 E2E-Tests, DATEV-Cases) ist fuer den weiteren Entwicklungsfluss von Wert, aber nicht ohne manuelle Re-Integration verwendbar.

**Aktion**: Branch wird NICHT in main gemergt. Stattdessen wird `archive/autonom-backend-2026-05-07` als Backup-Tag gesetzt (Commits bleiben fuer immer in der Git-History abrufbar). Der Branch wird anschliessend mit `git branch -D` geloescht. Im Anschluss-Notizfeld "Open Questions" steht der Hinweis, dass der User eine spaetere manuelle Integration der backend-Branch durchfuehren muss, falls einzelne Commits nachgezogen werden sollen.

### 2.3 `autonom/webapp` — ENTSCHEIDUNG: NICHT mergen, archivieren via Backup-Tag
2 unique Commits gegenueber autonom/main:
1. `217150c feat(webapp): Tailwind/Radix design system, auth, tests, e2e`
2. `540b589 feat(webapp): finish design-system migration + page tests + MSW`

**Diff-Befund**: 206 Dateien differieren zu solo. Die webapp-Branch enthaelt eine FRUEHERE Stufe der Tailwind/Radix-Migration mit eigenen Test-Strukturen (`src/test/...` statt `src/tests/...`, eigenes `tailwind.config.ts`, eigene Playwright-E2E-Specs unter `tests/e2e/`). `autonom/solo` hat diese Migration weitergefuehrt und integriert: Page-Tests fuer alle 15 Seiten, MSW-Handler unter `src/tests/msw/`, MSW-Server, neuere e2e-Tests.

Ein Merge wuerde die alte Test-Struktur (`src/test/`) erneut einfuehren parallel zur neuen (`src/tests/`), was konfusion stiftet und Tests doppelt laufen laesst.

**Aktion**: Branch wird NICHT in main gemergt. Backup-Tag `archive/autonom-webapp-2026-05-07`. Anschliessend `git branch -D`.

### 2.4 `autonom/main` — ENTSCHEIDUNG: zu main rebenennen oder loeschen
Diese Branch ist nur "initial import" und gemeinsamer Ancestor. Sie wird durch das Erstellen eines neuen `main`-Branches auf der Basis von autonom/solo ueberfluessig.

**Aktion**: Nach dem Setup von `main` aus autonom/solo wird `autonom/main` per `git branch -D` geloescht (nach Backup-Tag `archive/autonom-main-2026-05-07`).

### 2.5 Zusammenfassende Branch-Strategie

```
Vor:    autonom/main (initial), autonom/solo, autonom/backend, autonom/webapp
Nach:   main (= ehemaliges autonom/solo + WIP-Rescue-Commit)
Tags:   pre-cleanup-2026-05-07-HHMM
        archive/autonom-main-2026-05-07
        archive/autonom-backend-2026-05-07
        archive/autonom-webapp-2026-05-07
```

Alle Commits aller alten Branches bleiben ueber die Tags wiederherstellbar.

---

## Section 3 — Duplicate Resolution (n8n-Workflows)

Im verbleibenden Branch (autonom/solo => main) gibt es bereits **keine** `*_clean.json`-Dateien mehr. Die kanonischen Versionen liegen unter `prozesspilot/n8n/workflows/WF-M01.json`, `WF-M02.json`, `WF-M07.json`, `WF-INPUT-WHATSAPP.json`.

Die im webapp-Worktree noch vorhandenen `*_clean.json`-Dateien verschwinden mit der Worktree-/Branch-Loeschung automatisch.

Phase 4 reduziert sich daher auf:
- Neu eingefuegte Workflows als untracked sichten und committen: `WF-INPUT-IMAP.json`, `WF-INPUT-UPLOAD.json`.
- README in `prozesspilot/n8n/workflows/` ist bereits vorhanden — Inhalt pruefen, gegebenenfalls auf neue Workflows aktualisieren.

---

## Section 4 — Action Plan (geordnet)

Alle Befehle laufen im Hauptverzeichnis `/Users/donandrejo/Documents/ProzessPilot`, soweit nicht anders angegeben.

### Phase 2 — Safety
1. `git tag pre-cleanup-2026-05-07-$(date +%H%M)` (auf aktuellem HEAD von autonom/solo)
2. `git tag archive/autonom-main-2026-05-07 autonom/main`
3. `git tag archive/autonom-backend-2026-05-07 autonom/backend`
4. `git tag archive/autonom-webapp-2026-05-07 autonom/webapp`
5. `git add -A && git commit -m "chore(wip): rescue WIP from autonom/solo working tree before cleanup"`
   - Schliesst alle 23 modifizierten + 9 untracked Dateien ein.

### Phase 3 — Branches und Worktrees
6. `git checkout -b main`  (neuer main-Branch auf autonom/solo + WIP-Commit)
7. `git worktree remove /Users/donandrejo/Documents/ProzessPilot-backend`
8. `git worktree remove /Users/donandrejo/Documents/ProzessPilot-webapp`
9. `git branch -D autonom/main autonom/solo autonom/backend autonom/webapp`
   - Erlaubt, weil pro Branch ein `archive/...`-Tag gesetzt wurde.
10. Verifizieren: `git worktree list` zeigt nur das Hauptverzeichnis; `git branch -a` zeigt nur `main`.

### Phase 4 — n8n-Workflows
11. (Bereits durch WIP-Commit erledigt:) `WF-INPUT-IMAP.json` und `WF-INPUT-UPLOAD.json` sind committed.
12. `prozesspilot/n8n/workflows/README.md` lesen und gegebenenfalls um Eintraege fuer `WF-INPUT-IMAP`, `WF-INPUT-UPLOAD`, `WF-M09-SUPPLIER-COMM` ergaenzen.

### Phase 5 — Statusdateien
13. `mkdir -p docs/archive` (im Repo-Root, falls noch nicht vorhanden)
14. `git mv prozesspilot/_STATUS_SOLO.md docs/archive/2026-05-04_STATUS_SOLO.md`
15. `git mv prozesspilot/TERMINAL2_STATUS.md docs/archive/2026-05-01_TERMINAL2_STATUS.md`
16. Header-Hinweis vorne in `AGENT_SOLO.md` und `AGENTS_AUTONOM.md` einfuegen:
    `> Letzte Aktualisierung: 2026-05-07. Status: archivierte Anleitung aus paralleler Agenten-Phase. Aktueller Workflow: siehe STRUCTURE.md.`

### Phase 6 — STRUCTURE.md
17. `STRUCTURE.md` im Repo-Root erstellen (Inhalt unten, Section 6 — wird im Plan-Body bei Ausfuehrung gerendert).

### Phase 7 — Verifikation
18. `git status` → working tree clean
19. `git log --oneline -10` → klare History mit WIP-Rescue + main
20. `find . -name "*_clean.json"` → leer
21. `git branch -a` → nur main
22. `cd prozesspilot/backend && npm install --silent && npm run dev` (Smoke-Run mit Timeout, dann stoppen)
23. `cd prozesspilot/webapp && npm install --silent && npm run build`
24. CLEANUP_PLAN.md um Abschluss-Sektion ergaenzen (Tag-Name, geloeschte Branches/Worktrees, archivierte Dateien, Verifikations-Resultate).
25. Final commit: `git commit -am "docs: cleanup plan complete + structure overview"`

**docker-compose-Smoke (optional, nicht blockierend)**: Wenn Docker Desktop laeuft, kann `docker compose -f prozesspilot/docker-compose.yml up -d` ausgefuehrt werden. Bei Fehlschlag NICHT abbrechen — nur loggen.

---

## Section 5 — Risks & Open Questions

### Risiken
- **`git branch -D` auf nicht gemergte Branches**: 8 Commits (6 backend + 2 webapp) sind nicht in main enthalten. Sie bleiben aber ueber die `archive/*`-Tags fuer immer auffindbar (`git log archive/autonom-backend-2026-05-07`). Der User kann jederzeit Cherry-Pick durchfuehren.
- **WIP-Rescue-Commit**: 23 Mods + 9 Untracked werden als ein einziger `chore(wip)`-Commit gespeichert. Inhaltliche Trennung wuerde Refactor erfordern, was im Scope dieses Cleanups bewusst ausgeschlossen ist.
- **`npm install --silent` und `npm run dev`/`npm run build`** koennten an fehlenden ENV-Variablen oder fehlendem Docker scheitern. Bei Fehlschlag wird der Fehler dokumentiert, KEIN automatischer Rollback ausgeloest.

### Offene Punkte (NICHT eskalations-pflichtig — wird im Plan dokumentiert und kann spaeter manuell adressiert werden)
- Soll `autonom/backend` (M03-M09 E2E-Tests, DATEV-Buchungsfaelle, OAuth-Skeleton) als Folgeschritt in main re-integriert werden? — bleibt ueber Tag verfuegbar, **kein** Bestandteil dieses Cleanups.
- Soll `prozesspilot/backend/IMPLEMENTATION_STATUS.md` ebenfalls nach docs/archive verschoben werden? Default: behalten, weil unklar ob noch aktuell. User kann manuell entscheiden.

**Keine Eskalation noetig — bereit zur Ausfuehrung nach Go.**

---

## Section 6 — Rollback-Prozedur

Falls nach Cleanup ein Zustand wiederhergestellt werden soll:

```bash
cd /Users/donandrejo/Documents/ProzessPilot

# 1) Auf den exakten Pre-Cleanup-State zuruecksetzen:
git reset --hard pre-cleanup-2026-05-07-HHMM    # exakter Tag-Name aus Phase 2

# 2) Geloeschte Branches wiederherstellen:
git branch autonom/main    archive/autonom-main-2026-05-07
git branch autonom/backend archive/autonom-backend-2026-05-07
git branch autonom/webapp  archive/autonom-webapp-2026-05-07
git branch autonom/solo    pre-cleanup-2026-05-07-HHMM

# 3) Worktrees neu erstellen (nur falls noetig):
git worktree add /Users/donandrejo/Documents/ProzessPilot-backend autonom/backend
git worktree add /Users/donandrejo/Documents/ProzessPilot-webapp  autonom/webapp
```

Cherry-Pick einzelner Commits aus archivierten Branches:
```bash
git log archive/autonom-backend-2026-05-07 --oneline
git cherry-pick <commit-sha>
```

---

## Section 7 — Abschluss-Sektion

**Cleanup abgeschlossen am 2026-05-07.**

### Tags
- Pre-Cleanup-Snapshot: `pre-cleanup-20260507-1209`
- Archive-Tags (vollstaendige History bleibt jederzeit ueber `git log <tag>` und `git checkout <tag>` abrufbar):
  - `archive/autonom-main-2026-05-07`     → ehemals `autonom/main`
  - `archive/autonom-solo-2026-05-07`     → ehemals `autonom/solo` (vor WIP-Rescue-Commit)
  - `archive/autonom-backend-2026-05-07`  → ehemals `autonom/backend`
  - `archive/autonom-webapp-2026-05-07`   → ehemals `autonom/webapp`

### Branch-Zustand nachher
- Genau ein Branch: `main` (basiert auf ehemaligem `autonom/solo` + WIP-Rescue-Commit + Cleanup-Doku-Commit)
- `autonom/backend` und `autonom/webapp` wurden **NICHT** in main gemergt: zu starke strukturelle Divergenz (393 bzw. 206 Dateien differieren, Module haben divergierende Architektur). Beide bleiben ueber Tags wiederherstellbar — Cherry-Picks einzelner Commits sind weiterhin moeglich.

### Worktree-Zustand nachher
- Genau ein Worktree: `/Users/donandrejo/Documents/ProzessPilot` auf `main`.
- Sekundaer-Worktrees `../ProzessPilot-backend` und `../ProzessPilot-webapp` entfernt.

### Datei-Konsolidierung
- `*_clean.json`-Duplikate: keine mehr im Repo (Suchergebnis leer).
- Statusdateien archiviert nach `docs/archive/`:
  - `2026-05-04_STATUS_SOLO.md` (vorher `prozesspilot/_STATUS_SOLO.md`)
  - `2026-05-01_TERMINAL2_STATUS.md` (vorher `prozesspilot/TERMINAL2_STATUS.md`)
  - `2026-05-01_WEBAPP_STATUS.md` (vorher `prozesspilot/webapp/src/WEBAPP_STATUS.md`)
- `AGENT_SOLO.md` und `AGENTS_AUTONOM.md` mit Header-Hinweis "Letzte Aktualisierung: 2026-05-07. Status: archivierte Anleitung..." versehen.
- Neue Dateien hinzugefuegt:
  - `STRUCTURE.md` (Repo-Karte, kanonisch)
  - `prozesspilot/n8n/workflows/README.md` ergaenzt um `WF-INPUT-IMAP` und `WF-INPUT-UPLOAD`.

### Verifikations-Resultate

| Pruefung                            | Ergebnis |
|-------------------------------------|----------|
| `git status` clean                  | OK |
| `git branch -a` → nur `main`        | OK |
| `git worktree list` → nur Hauptverzeichnis | OK |
| `find . -name "*_clean.json"` leer  | OK |
| `git log --oneline -10` Klar/Lesbar | OK |
| Docker-Compose (postgres, redis, n8n, minio) healthy | OK (lief bereits) |
| Backend `npm install` (silent)      | OK |
| Backend `npm run dev` Boot          | OK — "Server listening at http://0.0.0.0:3000", "ProzessPilot Backend gestartet". Live-Requests `/api/v1/receipts/stats` 200/48ms und `/api/v1/receipts?customer_id=...` 200/9ms beobachtet, danach Server sauber gestoppt. |
| Webapp `npm install` (silent)       | OK |
| Webapp `npm run build`              | OK — `vite build` 1.70s, 80 Module, `dist/index.html` 0.92 kB, CSS 39.76 kB (gzip 8.00 kB), JS 351.05 kB (gzip 101.37 kB), keine Fehler. |

### Hinweise an Nachfolge-Sessions
- Der WIP-Rescue-Commit (`541507e`) bundles eine groessere Iteration. Wenn fachliche Trennung gewuenscht ist, kann dieser Commit per `git reset --soft` und Re-Commit zerlegt werden.
- Die `archive/autonom-backend-2026-05-07` enthaelt unter anderem M03–M09 E2E-Tests, DATEV-Buchungsfaelle, customer_integrations + OAuth-Skeleton. Bei Bedarf einzelne Commits via `git log archive/autonom-backend-2026-05-07 --oneline` und `git cherry-pick <sha>` nachziehen.
