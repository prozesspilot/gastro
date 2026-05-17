# Claude-Code-Workflow — wie Steve und Andreas zusammen entwickeln

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Steve, Andreas, alle zukünftigen Mitarbeiter
> **Verhältnis zu anderen Dokumenten:** Setzt `00_Architektur_Hauptdokument.md` voraus. Wird referenziert von allen Modul-Specs und Pilot-Strategie.

---

## 1. Ausgangslage und Ziel

### 1.1 Was wir wollen

ProzessPilot wird **vollständig durch Claude Code** entwickelt — ohne dass Steve oder Andreas manuell Code schreiben. Beide haben minimale Coding-Erfahrung (Steve: etwas Java + Server-Basics, Andreas: keine), beide nutzen Claude Code im Terminal.

Der Workflow muss:

- **Sicher gegen Manual-Touch sein** — wenn die KI was Falsches baut, muss das System es selbst auffangen (Tests, Reviews, CI), nicht durch Code-Lesen von Steve oder Andreas
- **Parallele Arbeit ermöglichen** — beide arbeiten gleichzeitig an verschiedenen Aufgaben, ohne sich Code wegzurupfen
- **Sehr stark dokumentiert sein** — beide müssen das System pflegen können, auch in 6 Monaten
- **Skalierbar mit dem Team wachsen** — wenn später Mitarbeiter dazukommen, müssen die ohne lange Einarbeitung produktiv werden

### 1.2 Drei Claude-Code-Instanzen

| Instanz | Wo läuft sie | Wofür |
|---|---|---|
| **Steve-lokal** | MacBook von Steve | Frontend-Entwicklung (Webapp, Wizard, Chat-Widget), Discord-Bot, Sales-Material |
| **Andreas-lokal** | MacBook von Andreas | Backend, Module (M01–M15), n8n-Workflows, Infrastructure, Migrations |
| **Hetzner-remote** | Server bei Hetzner | Production-Deploys, Migrations-Run, Hot-Fixes, Monitoring |

Alle drei nutzen denselben GitHub-Account (Steve und Andreas sind auf beiden MacBooks im selben Account angemeldet, Hetzner ebenso). Unterscheidung wer-was-gemacht-hat geht über **Branch-Naming** und **Co-Authored-By-Trailer in Commits**.

---

## 2. Aufgaben-Verteilung Steve und Andreas

### 2.1 Domain-Aufteilung (Standard)

| Domäne | Verantwortlich | Begründung |
|---|---|---|
| **Backend** (Module M01–M15, Services, Adapter, Hooks) | Andreas | Tech-Tiefe, Datenmodell, n8n-Workflows |
| **Datenbank** (Migrations, Schema, RLS) | Andreas | Hoher Konsistenz-Bedarf, ein Verantwortlicher reduziert Konflikte |
| **n8n-Workflows** | Andreas | Eng mit Backend verbunden |
| **Infrastructure** (Docker, CI/CD, Hetzner-Setup) | Andreas | Ops-Kompetenz |
| **Mitarbeiter-Webapp Frontend** | Steve | Sichtbar für Mitarbeiter, Steve nutzt es täglich |
| **Onboarding-Wizard Frontend** | Steve | Customer-facing, Steve kennt Wirt-Pain-Points |
| **Web-Chat-Widget Frontend** | Steve | Customer-UX |
| **Discord-Bot Service** | Steve | Operativer Kontext, Steve ist Discord-Server-Admin |
| **Legal-Texte** (AGB, AVV, Datenschutz) | Steve | Vertragliche Verantwortung |
| **Sales-Material** (Pitch-Deck, Spar-Rechner) | Steve | Vertriebs-Know-How |
| **Konzept-Doku** (Modulkonzept/Konzeptentwicklung/) | gemeinsam | Beide müssen verstehen, beide pflegen |

### 2.2 Cross-Funktionale Tätigkeiten (beide)

- **Code-Reviews:** jeweils der andere reviewt mit `code-reviewer`-Agent (siehe Abschnitt 6)
- **Merge in main:** nur nach beidseitigem OK + grüner CI
- **Architektur-Entscheidungen:** gemeinsam via Discord-Voice-Call
- **Pilot-Wirt-Kontakt:** Steve federführend, Andreas auf Abruf bei Tech-Fragen
- **Vertriebsagentur-Kontakt:** Steve allein

### 2.3 Wenn sich die Domänen überschneiden

Beispiel: Web-Chat-Widget hat Frontend (Steve) UND Backend-Service (Andreas) UND Discord-Bridge (Steve). Lösung:

- Aufteilung in **mehrere Tasks**, jede mit klarem Owner
- Tasks haben `depends_on`-Feld, damit Reihenfolge klar ist
- Schnittstellen werden vorher in Spec definiert (kein "ich erfinde mal eine API, der andere passt sich an")

---

## 3. GitHub-Setup

### 3.1 Repository

Ein zentrales Repo: `prozesspilot/prozesspilot` (auf GitHub-Org). Beide haben Push-Rechte.

**Stand 2026-05-15:** Repo-Struktur wurde bereinigt — vorher gab es eine doppelte Verschachtelung `prozesspilot/prozesspilot/`, jetzt ist alles auf einer Ebene direkt im Repo-Root.

### 3.2 Branch-Modell

```
main                                 # Produktions-Branch, geschützt
  ├── steve/discord-bot-init         # Steve arbeitet hier
  ├── steve/webapp-tenant-list
  ├── andreas/m15-sumup-connector    # Andreas arbeitet hier
  ├── andreas/m03-bewirtungs-hook
  ├── server/hotfix-deployment       # Hetzner-Claude für Hotfixes
  └── ...
```

**Branch-Naming-Convention (Pflicht):**

- `steve/<task-id>-<kurzbeschreibung>` für Steve's Tasks
- `andreas/<task-id>-<kurzbeschreibung>` für Andreas' Tasks
- `server/<task-id>-<kurzbeschreibung>` für Hetzner-Hotfixes
- `gemeinsam/<task-id>-<kurzbeschreibung>` für Pair-Programming-Sessions

### 3.3 Branch-Protection auf `main`

- Direkter Push auf `main` ist **nicht erlaubt**
- Pull-Request mit mindestens einem Approve nötig
- Status-Check: CI muss grün sein
- Linear History (kein Merge-Commit-Chaos, nur Squash oder Rebase)

### 3.4 Commit-Identität (Lösung für ein-Account-zwei-Personen)

Da beide im selben GitHub-Account sind, wird die Person über **Git-Local-Config** unterschieden:

```bash
# Auf Steve's MacBook:
git config --local user.name "Steve Bernhardt"
git config --local user.email "steve@prozesspilot.net"

# Auf Andreas' MacBook:
git config --local user.name "Andreas [Nachname]"
git config --local user.email "andreas@prozesspilot.net"

# Auf Hetzner:
git config --local user.name "ProzessPilot Server (Claude Code)"
git config --local user.email "server@prozesspilot.net"
```

Plus: jeder Commit von Claude Code bekommt einen `Co-Authored-By`-Trailer:

```
Implementiere M15 SumUp-OAuth-Flow

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Steve Bernhardt <steve@prozesspilot.net>
```

So sieht man in `git log` wer-mit-Claude-was-gemacht-hat.

### 3.5 Pull-Request-Workflow

```
1. Claude Code (auf Steve's oder Andreas' Mac):
   - Liest Task-Spec aus tasks/_in_progress/T0XX-...md
   - Implementiert
   - Schreibt Tests
   - Läuft lokal: tests, lint, type-check
   - Wenn alles grün: pusht Branch
   - Eröffnet PR via GitHub-MCP mit ausgefüllter PR-Description

2. GitHub Actions CI läuft:
   - Lint (ESLint, Prettier)
   - Type-Check (tsc)
   - Unit-Tests
   - Integration-Tests (mit Postgres-Container)
   - Build-Check
   - Bei Fehler: Discord-Ping in #dev-log mit Fehler-Details

3. Discord-Webhook postet PR in #dev-coordination:
   "@andere — Steve hat PR #42 eröffnet: T015 SumUp-OAuth-Flow"

4. Anderer Claude Code (auf dem anderen Mac):
   - /review-pr 42
   - Checkt PR-Branch aus
   - Läuft code-reviewer-Agent
   - Postet Review-Kommentare auf GitHub
   - Bei OK: GitHub-Approve

5. Bei beidseitigem Approve + grüner CI:
   - Merge per Squash
   - Branch wird automatisch gelöscht
   - Discord-Notification: "✅ PR #42 gemerged auf main"
   - Wenn auf Hetzner-Auto-Deploy: Deploy-Workflow startet
```

---

## 4. Aufgaben-System (Tasks)

### 4.1 Aufbau

```
prozesspilot/tasks/
├── _README.md           # Erklärung des Systems
├── _template.md         # Vorlage für neue Tasks
├── _backlog/            # Tasks die noch nicht gestartet sind
│   ├── T001-bootstrap-workflow.md
│   ├── T002-...
├── _in_progress/        # Aktuell in Arbeit (Owner-Tag im Filename)
│   ├── T003-andreas-m15-sumup-oauth.md
│   └── T004-steve-discord-bot-init.md
└── _done/               # Fertig + gemerged
    └── T001-bootstrap-workflow.md
```

### 4.2 Task-Format

Jede Task ist eine Markdown-Datei mit standardisierter Struktur:

```markdown
# T0XX — <Titel>

**ID:** T0XX
**Verantwortlich:** Steve / Andreas / gemeinsam
**Branch:** <branch-prefix>/<id>-<kurzbeschreibung>
**Geschätzt:** N Tage
**Priorität:** P0 (Blocker) / P1 (wichtig) / P2 (kann warten) / P3 (later)
**Dependencies:** [T0XX, T0YY] (welche müssen zuerst fertig sein)
**Ziel-Meilenstein:** M0 / M1 / M2 / ...

## Was zu tun ist
<klare Beschreibung in 1-3 Sätzen>

## Akzeptanz-Kriterien
- [ ] ...
- [ ] ...
- [ ] CI grün
- [ ] code-reviewer-Agent gibt OK
- [ ] PR-Description vollständig

## Spec-Referenzen
- <Datei.md>
- <Datei.md>

## Claude-Code-Start-Prompt
<kompletter Prompt der in Claude Code reinkopiert wird>

## Notes
<optionale Hinweise, Edge-Cases, Bekanntes>
```

### 4.3 Task-Lebenszyklus

```
[_backlog/T0XX-...md]
       │
       │ Steve oder Andreas: /start-task T0XX
       │ → File wird verschoben nach _in_progress/T0XX-<owner>-...md
       │ → Branch wird angelegt
       │ → Initial-Commit
       ▼
[_in_progress/T0XX-<owner>-...md]
       │
       │ Claude Code arbeitet
       │ Akzeptanz-Kriterien werden abgehakt
       │
       │ Wenn fertig: /finish-task
       │ → Tests laufen
       │ → PR wird eröffnet
       │ → Discord-Notification
       ▼
[Pull Request offen, _in_progress/T0XX bleibt]
       │
       │ Cross-Review durch anderen Claude Code
       │ /review-pr <pr-number>
       │
       │ Bei Approve + CI grün:
       │ → PR wird gemerged
       │ → Auto-Deploy auf Hetzner
       ▼
[_done/T0XX-...md]
```

---

## 5. `.claude/`-Konfiguration im Repo

### 5.1 Was in `.claude/` lebt

```
prozesspilot/.claude/
├── CLAUDE.md                 # Master-Context, jede Session lädt das
├── settings.json             # Modelle, Berechtigungen, Hooks
├── agents/
│   ├── code-reviewer.md
│   ├── test-writer.md
│   ├── n8n-author.md
│   ├── discord-bot-builder.md
│   ├── migration-author.md
│   ├── docs-writer.md
│   └── task-explainer.md
└── commands/
    ├── start-task.md
    ├── finish-task.md
    ├── review-pr.md
    ├── new-module.md
    └── sync-with-main.md
```

### 5.2 Geteilt via Git

`.claude/` ist Teil des Repos. Beide Macs haben dieselbe Konfiguration. Änderungen an Sub-Agents oder Slash-Commands werden via Git gepusht und auf beiden Seiten sichtbar nach `git pull`.

### 5.3 Modelle

- **Sonnet 4.6** für tägliche Coding-Tasks (~90 % der Arbeit)
- **Opus 4.6** für `code-reviewer`-Agent + Architektur-Entscheidungen + komplexe Migrations

### 5.4 Berechtigungen

Konservativ: Claude Code darf

- Files lesen + schreiben im Repo-Verzeichnis
- `git`-Befehle ausführen (für Branches, Commits, Pushes)
- Tests + Lint + Build ausführen
- GitHub-MCP nutzen (PRs, Issues, Reviews)
- Discord-Webhook senden

Claude Code darf NICHT:

- `rm -rf` ohne Bestätigung
- Direkter Push auf `main` (Branch-Protection verhindert es eh)
- Production-DB direkt manipulieren (nur via Migrations)
- Credentials aus `.env`-Files lesen ohne explizite Bestätigung

---

## 6. Sub-Agents — die sieben Helfer

| Agent | Wozu | Modell |
|---|---|---|
| **code-reviewer** | Review von PRs: Bugs, Security, Performance, Architektur-Verstöße | Opus 4.6 |
| **test-writer** | Generiert Tests zu jedem geschriebenen Code, Coverage > 80% | Sonnet 4.6 |
| **n8n-author** | Erstellt n8n-Workflow-JSONs nach Konventionen aus 03_n8n_Workflows.md | Sonnet 4.6 |
| **discord-bot-builder** | Baut discord.js-Code, kennt Pattern für Buttons + Slash-Commands | Sonnet 4.6 |
| **migration-author** | Schreibt SQL-Migrations, rückwärts-kompatibel, mit Rollback | Opus 4.6 |
| **docs-writer** | Generiert JSDoc + README-Sections + Modul-Specs | Sonnet 4.6 |
| **task-explainer** | Erklärt Code in einfachen Worten — für Steve/Andreas wenn sie was nicht verstehen | Sonnet 4.6 |

Detail-Definitionen in `prozesspilot/.claude/agents/<name>.md`.

---

## 7. Slash-Commands — die fünf Routine-Befehle

| Command | Wozu |
|---|---|
| `/start-task T0XX` | Liest Task-Spec, verschiebt nach _in_progress, erstellt Branch, lädt Spec-Files, beginnt Implementation |
| `/finish-task` | Tests + Lint + Type-Check, schreibt PR-Beschreibung, pusht, eröffnet PR via GitHub-MCP, Discord-Ping |
| `/review-pr <pr-number>` | Checkt PR-Branch aus, läuft code-reviewer, postet Review-Kommentare auf GitHub |
| `/new-module M16 <name>` | Generiert Modul-Skelett (Spec + Backend-Folder + n8n-Workflow-Stub + Migration) |
| `/sync-with-main` | Pullt main, rebased eigenen Branch, löst einfache Konflikte automatisch (mit Bestätigung) |

Detail-Definitionen in `prozesspilot/.claude/commands/<name>.md`.

---

## 8. CI/CD-Pipeline (GitHub Actions)

### 8.1 Workflow `ci.yml` (bei jedem Push und PR)

- Checkout Code
- Setup Node 20
- Postgres-Service-Container für Integration-Tests
- `npm install`
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run build`
- Bei Fehler: Discord-Webhook in `#dev-log`

### 8.2 Workflow `discord-notify.yml` (bei Push, PR-Open, PR-Merged)

- GitHub-Event empfangen
- Strukturierte Discord-Nachricht in entsprechenden Channel:
  - Push auf Branch → `#dev-log`
  - PR eröffnet → `#dev-coordination` mit @-Mention an den Reviewer
  - PR gemerged → `#dev-log`
  - CI-Fehler → `#alerts-critical`

### 8.3 Workflow `deploy-staging.yml` (bei Merge auf main)

- Docker-Image bauen
- Image zu Container-Registry pushen
- SSH zu Hetzner
- `docker compose pull && docker compose up -d`
- Health-Check
- Discord-Notification "✅ Deploy erfolgreich" oder "❌ Deploy fehlgeschlagen"

---

## 9. Discord-Integration für den Workflow

### 9.1 Channels

```
ProzessPilot Discord
├── 🛠️ DEV
│   ├── 🔧 #dev-coordination     # PR-Reviews, neue Tasks, Sync
│   ├── 📋 #dev-log              # Push, Merge, CI-Status
│   ├── 🚨 #alerts-critical      # CI-Fail, Production-Errors
│   └── 🚀 #deployment           # Deploy-Notifications
```

### 9.2 GitHub-Webhook konfiguriert

GitHub sendet bei folgenden Events Webhook an Discord:

- `push` → `#dev-log`
- `pull_request opened` → `#dev-coordination` mit Mention
- `pull_request merged` → `#dev-log`
- `workflow_run failed` → `#alerts-critical`
- `workflow_run succeeded (deploy)` → `#deployment`

### 9.3 Daily Standup

- 15-Min Voice-Call in Discord-Voice-Channel "Daily Standup"
- Standard-Zeit: 9:30 Uhr werktags
- Standard-Themen: Was gestern, was heute, wo blockiert, wer braucht Hilfe

---

## 10. Code-Qualitäts-Garantien

Da beide kaum Code lesen können, müssen automatisierte Garantien stark sein:

### 10.1 Pre-commit Hooks (lokal, vor jedem commit)

- Prettier: Code-Formatierung
- ESLint: Lint
- typecheck: TypeScript-Check
- Bei Fehler: commit blockiert

### 10.2 CI-Pipeline (bei jedem PR)

- Alle Pre-commit-Checks
- Plus: Unit-Tests, Integration-Tests, Build-Check
- Plus: Security-Audit (`npm audit`, `trivy`)

### 10.3 Cross-KI-Review

- code-reviewer-Agent (Opus 4.6) liest jeden PR vor Merge
- Sucht: Bugs, Security-Issues, Architektur-Verstöße, fehlende Tests
- Posted Kommentare auf GitHub-PR

### 10.4 Mindest-Test-Coverage

- Unit-Tests: 80% Code-Coverage Pflicht
- Integration-Tests: jeder API-Endpoint mindestens einmal getestet
- E2E-Tests: kritische User-Flows (Login, Beleg-Upload, Steuerberater-Übergabe)

### 10.5 Architektur-Tests

- Dependency-Cruiser: prüft dass keine zyklischen Imports
- Lint-Regeln: keine direkten DB-Zugriffe aus Modulen, nur via Services

---

## 11. Konflikt-Vermeidung

### 11.1 Nicht gleichzeitig am gleichen File

Tasks werden so geschnitten, dass Steve und Andreas auf **verschiedenen Dateien** arbeiten. Wenn doch Überschneidung:

- **Vorab Discord-Sync:** "Ich arbeite jetzt an X — du auch?"
- **Wenn ja:** Pair-Programming-Session statt parallel

### 11.2 Migrations-Reihenfolge

Migrations sind hochkonflikt-anfällig. Regel:

- Nur eine Migration pro PR
- Migrations werden **nicht parallel** erstellt
- Bei Konflikt: der spätere PR muss seine Migration umnummerieren

### 11.3 API-Schema-Änderungen

Wenn ein Endpoint ändert:

- Erst Spec aktualisieren (im PR)
- Dann Backend ändert (PR von Andreas)
- Dann Frontend nutzt neue API (PR von Steve)
- Reihenfolge im Discord absprechen

---

## 12. Was bewusst nicht im Workflow steht

- **Manuelle Code-Schritte durch Steve oder Andreas** — alles über Claude Code
- **Code-Review durch Steve oder Andreas tief technisch** — kommt von code-reviewer-Agent
- **Direkte DB-Manipulation in Production** — nur via Migrations + Auto-Deploy
- **Deploy auf Hetzner per FTP / manuell** — nur via GitHub Actions oder /deploy-Command
- **Coding ohne Spec** — jede Task hat erst Spec, dann Code
- **Eigene Sub-Agents von Steve oder Andreas spontan** — alle Sub-Agents leben im Repo, werden gemeinsam beschlossen

---

## 13. Erste Schritte für den Setup-Tag

1. Repo cloned auf beiden Macs
2. `.claude/`-Konfiguration aus diesem PR ist da
3. Beide installieren Claude Code falls noch nicht da
4. Beide konfigurieren git-local-Identity (siehe 3.4)
5. GitHub-MCP wird in beiden lokalen Claude-Code-Setups eingerichtet
6. Discord-Webhook wird im GitHub-Repo eingerichtet (siehe 9.2)
7. CI-Pipeline läuft das erste Mal (T000-Bootstrap-Task)
8. Erste Test-Task wird gemeinsam durchgespielt (Pair-Programming, beobachten)
9. Daily Standup in Discord-Voice startet

---

## 14. Zusammenfassung in einem Absatz

ProzessPilot wird komplett durch Claude Code entwickelt. Drei Instanzen (Steve-lokal, Andreas-lokal, Hetzner-remote) im selben GitHub-Account, unterschieden über Branch-Naming und git-local-Identity. Aufteilung: Andreas baut Backend + Module + Infrastructure, Steve baut Frontends + Discord-Bot + Sales-Material. Tasks im Repo unter `tasks/`, mit klarem Lebenszyklus _backlog → _in_progress → _done. Sieben Sub-Agents (code-reviewer, test-writer, n8n-author, discord-bot-builder, migration-author, docs-writer, task-explainer), fünf Slash-Commands für Routine-Tätigkeiten. PR-Pflicht auf main, Cross-KI-Review durch code-reviewer-Agent, GitHub Actions CI mit Lint+Test+Build+Deploy, Discord-Webhook für alle Events. Sonnet 4.6 für Coding, Opus 4.6 für Reviews. Ziel: 0 % manuell geschriebener Code.

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Steve + Andreas (gemeinsam)
