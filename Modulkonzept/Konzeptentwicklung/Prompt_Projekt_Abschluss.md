# Master-Prompt: ProzessPilot Projekt-Abschluss

> **So nutzt du das:**
> 1. Öffne ein neues Claude-Code-Fenster im Repo-Root `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/`.
> 2. Kopiere den kompletten Prompt-Block unten (zwischen `===== PROMPT START =====` und `===== PROMPT ENDE =====`) und füge ihn als erste Nachricht ein.
> 3. Claude Code arbeitet in **fünf Phasen** mit **harten Checkpoints** dazwischen — nach jeder Phase wartet er auf dein „weiter" oder „stop".
> 4. Plane 1–2 Sessions à 2–3 Stunden plus deine Review-Zeit ein.

---

```
===== PROMPT START =====

ROLLE
Du bist Senior Full-Stack Engineer (Node 20 + TypeScript strict + Fastify, React + Vite + Vitest + Playwright, Postgres + Redis, n8n) und Release-Engineer im Projekt ProzessPilot. Dein Auftrag: das Projekt von „Code fertig, Auth fehlt, Repo unsauber" auf „produktionsbereit für ersten Pilotkunden" bringen. Keine Erfindungen. Keine Auslassungen. Du folgst exakt den Specs und meldest dich bei jedem Checkpoint zur Freigabe.

PFLICHT-KONTEXT (in dieser Reihenfolge lesen, bevor du irgendetwas tust)
1. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS.html
2. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/README.md
3. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md
4. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/01_Datenmodell_Events.md
5. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/02_Kundenprofil_System.md
6. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/04_Erweiterbarkeit_Pro.md
7. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/05_Roadmap.md
8. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/06_Prompt_System.md
9. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md   ← VERBINDLICH für Phase 2
10. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/Server_Umzug.md
11. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/README.md
12. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/src/app.ts

Nachdem du alles gelesen hast, fasse in maximal 8 Bullet-Points zusammen, was du verstanden hast, und warte auf „weiter".

GLOBALE REGELN (gelten für alle Phasen)
- Stack: TypeScript strict, Fastify, Vitest, pino, Zod, pg (kein ORM), ioredis, @aws-sdk/client-s3, biome.
- JSON-Felder: snake_case. TypeScript-Identifier: camelCase. DB-Tabellen: snake_case Plural.
- Dateipfade exakt wie in den Specs angegeben — keine Umstrukturierung „on the fly".
- Tests sind Pflicht. Coverage-Ziel core/auth + modules/users: > 90 %.
- Bei Mehrdeutigkeit in der Spec: Entscheidung treffen, mit Inline-Kommentar `// DECISION:` markieren, am Ende der Phase als „Decisions"-Liste auflisten.
- Niemals Klartext-Passwörter loggen. Pino-Redaction für *.password, *.token, *.secret, headers.authorization.
- Bei jedem Test- oder Build-Fail: STOP, Stacktrace zeigen, Vorschlag machen — nicht selbst „kreativ" reparieren.

PHASEN-ÜBERBLICK
  Phase 1: Repo-Hygiene + Baseline absichern        (~30 min)
  Phase 2: M14 — Auth + User-Verwaltung             (~3–4 h, der Hauptteil)
  Phase 3: CI/CD-Pipeline                            (~30 min)
  Phase 4: IONOS-Anpassungen (4 GB RAM)              (~30 min)
  Phase 5: Audit-Subagent + Konzept-Drift-Schutz     (~20 min)

Am Ende jeder Phase: Bericht + warten auf „weiter".

────────────────────────────────────────────────────────────────────
PHASE 1 — REPO-HYGIENE + BASELINE
────────────────────────────────────────────────────────────────────

ZIEL
Sauberer Ausgangszustand: alle uncommitteten Änderungen sind reviewt und entweder committed oder verworfen, alle Tests sind grün.

SCHRITTE
1. `cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot && git status --short` ausführen.
2. Für jeden modifizierten Bereich (n8n-Workflows, receipt.repository, app.ts, webapp/types.ts, Konzeptentwicklung-Files) einen `git diff` zeigen und kurz beschreiben, was die Änderung tut.
3. Vorschlag: zwei thematisch saubere Commits.
   - Commit A: "cleanup: remove m04-categorize remnant + empty _foundation, update concept docs"
     → die Änderungen aus dem Cleanup-Lauf 2026-05-07 (app.ts, gelöschte Files, Konzeptentwicklung/*)
   - Commit B: "refactor: n8n workflows + receipt repository improvements"
     → alle WF-*.json + receipt.repository.ts + routing/plan.handler.ts + webapp/types.ts
4. WARTEN auf Freigabe pro Commit-Vorschlag, dann ausführen.
5. Baseline-Tests:
   ```
   cd backend && npm test
   cd ../webapp && npm test
   ```
   Beide grün? Wenn nicht: STOP, Test-Fail zeigen, Lösungsvorschlag machen.
6. Aufräumen: `npm run build` im backend, `npm run build` im webapp — beide ohne Errors.

CHECKPOINT 1
Bericht:
- Git-Status nach Commits
- Test-Resultate (Anzahl grüne Tests, ggf. übersprungene)
- Build-Resultate
Warte auf „weiter zu Phase 2".

────────────────────────────────────────────────────────────────────
PHASE 2 — M14: AUTH + USER-VERWALTUNG
────────────────────────────────────────────────────────────────────

ZIEL
Echtes Login mit Email + Passwort, JWT + Refresh-Token, granulare Permissions, User-Verwaltung-UI. Ersetzt den aktuellen Tenant-Select-Platzhalter.

VERBINDLICHE SPEC
/Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md

Folge §14 der Spec — die 10 Schritte sind die Sub-Phasen. Nach Schritt 3, Schritt 6 und Schritt 10 jeweils einen Mini-Checkpoint.

2.1 Migration (Schritt 1 der Spec)
- backend/migrations/031_users_auth.sql
- backend/migrations/031b_bootstrap_super_admin.sql
- Verify: `npm run migrate` zweimal hintereinander → 2. Lauf 0 neue
- Verify: `psql ... -c "\d users"` zeigt alle Spalten aus Spec §4

2.2 Backend core/auth/ (Schritt 2)
- backend/src/core/auth/jwt.ts
- backend/src/core/auth/jwt.middleware.ts
- backend/src/core/auth/password.ts             (argon2id, Lib `argon2`)
- backend/src/core/auth/permissions.ts          (Wildcard-Expansion)
- jeweils + .test.ts mit Vitest
- argon2-Parameter aus ENV (Spec §7)
- JWT-Secret aus ENV JWT_SECRET (Pflicht — wenn fehlt: Server-Start verweigern)

2.3 Backend modules/users/ (Schritt 3)
- Komplette Datei-Struktur nach Spec §5.1
- Alle 11 Endpoints nach Spec §5.2 implementieren
- Lockout-Service nach Spec §5.7
- Token-Rotation mit Replay-Detection nach Spec §5.5
- Tests pro Handler + lockout + e2e

→ MINI-CHECKPOINT nach 2.3: Bericht „Backend M14 fertig, n Tests grün". Warten auf „weiter".

2.4 Frontend AuthContext umbauen (Schritt 4)
- webapp/src/auth/AuthContext.tsx — neue Logik nach Spec §6.5
- webapp/src/auth/permissions.ts — Frontend-Helper
- webapp/src/auth/token-refresh.ts — Auto-Refresh-Logik
- Tests aktualisieren / ergänzen

2.5 LoginPage + ChangePasswordPage (Schritt 5)
- webapp/src/pages/LoginPage.tsx — komplett umbauen (Email + Password statt Tenant-Select)
- webapp/src/pages/ChangePasswordPage.tsx — neu, für password_must_change-Flow
- Tests

2.6 API-Client (Schritt 6)
- webapp/src/api/auth.ts — neu
- webapp/src/api/users.ts — neu
- webapp/src/api/_client.ts — erweitern: Bearer-Header, Auto-Refresh bei 401

→ MINI-CHECKPOINT nach 2.6: Bericht „Frontend Auth-Grundlage fertig". Warten.

2.7 UsersPage + UserFormModal (Schritt 7)
- webapp/src/pages/UsersPage.tsx
- webapp/src/pages/UserFormModal.tsx
- Permission-Editor mit Presets (Spec §3.3) + Custom-Mode
- Tests inkl. Permission-Hide-Verhalten

2.8 UserMenu + Layout-Integration (Schritt 8)
- webapp/src/components/UserMenu.tsx
- in Layout.tsx einbinden (oben rechts)
- super_admin-Tenant-Switcher

2.9 Playwright-E2E (Schritt 9)
- webapp/tests/e2e/auth.spec.ts
- Szenarien: Login mit super_admin → User anlegen → Logout → Login mit dem neuen User → password_must_change → Passwort wechseln → Dashboard sichtbar

2.10 Smoke-Test + Doku (Schritt 10)
- backend/src/modules/users/README.md
- ENV-Variablen in .env.example ergänzen
- Bootstrap-Skript `npm run bootstrap:super-admin` — interaktiv, Email + Passwort eingeben, hasht + INSERT

CHECKPOINT 2
Bericht:
- alle 11 Endpoints einzeln testen (curl-Beispiele)
- Test-Stand: backend + webapp + Playwright
- Acceptance Criteria aus Spec §12 abhaken
- Decisions-Log
- ENV-Variablen-Liste, die in .env.prod gehören

Warte auf „weiter zu Phase 3".

────────────────────────────────────────────────────────────────────
PHASE 3 — CI/CD-PIPELINE
────────────────────────────────────────────────────────────────────

ZIEL
Bei jedem Push auf main laufen Tests + Build automatisch.

SCHRITTE
1. .github/workflows/ci.yml anlegen mit:
   - Matrix: Node 20
   - Services: Postgres 16 + Redis 7 (GitHub Action services)
   - Steps:
     a) Checkout, Setup Node, install (npm ci im backend + webapp)
     b) Lint: biome check
     c) Backend Tests: npm run migrate + npm test
     d) Webapp Build: npm run build
     e) Webapp Tests: npm test
     f) Playwright (headless): npm run test:e2e
2. .github/workflows/codeql.yml — SAST für TypeScript
3. .github/dependabot.yml — wöchentliche npm-Updates
4. README.md im Repo-Root: Badge „CI passing" einfügen

CHECKPOINT 3
Bericht:
- Workflow-Files erstellt + Inhalt
- Empfehlung: einmal `act` lokal laufen lassen oder direkt pushen
- WARNUNG: bei push erst auf einen `ci-test`-Branch, nicht main, damit nichts blockiert

Warte auf „weiter zu Phase 4".

────────────────────────────────────────────────────────────────────
PHASE 4 — IONOS-ANPASSUNGEN
────────────────────────────────────────────────────────────────────

ZIEL
Production-Setup ist auf 4 GB RAM IONOS-VPS lauffähig ohne OOM-Risiko.

CHECKPOINT-KONTEXT: User hat IONOS VPS 4-4-120 bestellt (4 vCore, 4 GB RAM, 120 GB NVMe). Das ist auf Minimum, RAM ist der Engpass.

SCHRITTE
1. docker-compose.prod.yml anpassen — Memory-Limits pro Service:
   ```yaml
   postgres:  deploy: { resources: { limits: { memory: 1G } } }
   n8n:       deploy: { resources: { limits: { memory: 800M } } }
   backend:   deploy: { resources: { limits: { memory: 768M } } }
   redis:     deploy: { resources: { limits: { memory: 256M } } }
   minio:     deploy: { resources: { limits: { memory: 256M } } }
   webapp:    deploy: { resources: { limits: { memory: 128M } } }
   ```
   Postgres zusätzlich: `command: postgres -c shared_buffers=256MB -c work_mem=8MB -c maintenance_work_mem=64MB -c effective_cache_size=512MB`

2. infra/scripts/setup-swap.sh — Swap-Setup-Skript:
   ```bash
   #!/bin/bash
   set -e
   if swapon --show | grep -q swapfile; then echo "Swap already active"; exit 0; fi
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   sudo sysctl vm.swappiness=10
   echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
   ```

3. infra/scripts/memory-check.sh — täglicher Cron-Check:
   ```bash
   #!/bin/bash
   THRESHOLD=85
   USAGE=$(free | awk '/Mem:/{printf("%.0f", $3/$2*100)}')
   if [ "$USAGE" -gt "$THRESHOLD" ]; then
     echo "MEM ALERT: ${USAGE}%" | mail -s "ProzessPilot Memory" s.andreas-k@hotmail.de
   fi
   ```

4. Konzeptentwicklung/Server_Umzug.md aktualisieren:
   - Schritt 1 (Server bestellen): IONOS statt Hetzner als Default
   - Schritt 2 (Server härten): Swap-Setup-Block ergänzen, vor Docker-Install
   - Neuer Schritt: „Memory-Monitoring einrichten"

5. infra/runbook/01_deployment.md: IONOS-spezifischer Abschnitt mit:
   - Cloud Panel Login
   - Image-Wahl (Ubuntu 22.04)
   - Backup-Add-On (separat zu buchen!)
   - IPv4-Reverse-DNS für saubere Mail-Zustellung (falls Mail-Versand aktiv)

CHECKPOINT 4
Bericht:
- alle Files
- Test: `docker-compose -f docker-compose.prod.yml config` validiert
- Hinweis an User: vor erstem Deploy `setup-swap.sh` ausführen

Warte auf „weiter zu Phase 5".

────────────────────────────────────────────────────────────────────
PHASE 5 — AUDIT-SUBAGENT
────────────────────────────────────────────────────────────────────

ZIEL
Künftiger Drift zwischen Konzept-Doku und Code wird automatisch erkannt.

SCHRITTE
1. .claude/agents/konzept-auditor.md anlegen:
   - model: opus
   - tools: Read, Glob, Grep, Write
   - description: „Audit-Agent: prüft Drift zwischen /Konzeptentwicklung/ und /prozesspilot/-Code, schreibt _audit/REPORT.md"
   - System-Prompt: prüft die Konsistenz-Aspekte aus STATUS.html („Diskrepanzen Konzept ↔ Code")

2. .claude/commands/audit-konzept.md — Slash-Command, der den Subagent aufruft mit:
   - Konzept-Pfad
   - Repo-Pfad
   - Output-Pfad: /Konzeptentwicklung/_audit/REPORT-<datum>.md

3. .claude/commands/audit-apply.md — zweiter Command, der NUR Files löscht/archiviert, die im letzten REPORT explizit als DELETE markiert wurden (Safety-Net).

4. /Konzeptentwicklung/_audit/.gitkeep + README.md mit Erklärung des Workflows.

CHECKPOINT 5 (Endcheck)
Bericht:
- Audit-Subagent + Commands erstellt
- Test: lokal `/audit-konzept` aufrufen, prüfen ob REPORT generiert wird (falls Claude Code keinen Subagent-Test-Modus hat: Pseudo-Aufruf simulieren)
- GESAMTBILANZ:
  · Phase 1: Repo sauber, n Tests grün
  · Phase 2: M14 fertig, n neue Tests
  · Phase 3: CI-Pipeline aktiv
  · Phase 4: IONOS-ready
  · Phase 5: Audit-Subagent eingerichtet
- Verbleibende NICHT-Code-Tasks (zur Erinnerung an User):
  · WhatsApp Meta-Verifizierung anstoßen (extern, 2–3 Wochen)
  · IONOS-Server bestellen / SSH einrichten
  · DNS für Domain konfigurieren
  · `.env.prod` mit echten Secrets befüllen
  · `setup-swap.sh` auf Server ausführen
  · `docker compose -f docker-compose.prod.yml up -d` auf Server
  · `npm run bootstrap:super-admin` für ersten User
- Decisions-Log über alle Phasen
- Empfohlene nächste 3 Tasks für User

────────────────────────────────────────────────────────────────────
WICHTIGE LEITPLANKEN — gelten überall
────────────────────────────────────────────────────────────────────

- Wenn ein Test fehlschlägt: STOP, Stacktrace + Hypothese + Lösungsvorschlag. Nicht „ich probier mal".
- Wenn eine Datei größer als 500 Zeilen würde: aufsplitten und begründen warum.
- Wenn du auf eine Datei stößt, die du nicht erwartet hast (z. B. doppelter Ordner): NICHT löschen, sondern melden.
- Wenn die Spec gegen den Repo-Stand widerspricht (z. B. „Frontend hat schon X" steht in Spec, aber Code-Datei existiert nicht): Spec hat Vorrang, Code wird angepasst.
- Bei größeren architektonischen Entscheidungen (z. B. „Wir nehmen statt argon2 doch bcrypt"): NICHT eigenmächtig, sondern den User fragen.
- Bei jedem Commit: konventionelle Commit-Messages (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`).
- Niemals `git push --force`. Niemals `rm -rf` ohne explizite User-Bestätigung (außer in dist/-Verzeichnissen).

===== PROMPT ENDE =====
```

---

## Bedienungs-Hinweise (für dich, nicht in den Prompt kopieren)

**Vor dem ersten Senden:**

1. Stelle sicher, dass du Claude Code im Repo-Root öffnest, nicht im Konzeptentwicklung-Ordner.
2. Prüfe, dass `git status` keine wirklich gefährlichen Änderungen zeigt — Backup ist immer gut.
3. Wähle in Claude Code Opus 4.6 (oder das stärkste verfügbare Modell), nicht Haiku.

**Während Claude Code läuft:**

- Bei den Checkpoints **wirklich** reviewen, nicht durchwinken. Bei M14 kannst du je nach Sub-Phase auch frühzeitig stoppen, wenn dir etwas nicht passt.
- Wenn Claude Code in einer Phase festhängt: „beende diese Phase mit dem, was du hast, dann zu nächster" — er nutzt dann die folgende Phase als Pause.
- Tests sollten zwischen den Phasen immer grün sein. Wenn nicht: stoppen, debuggen, NICHT weiter.

**Nach Phase 5:**

Du hast einen produktionsbereiten Stand. Die verbliebenen Schritte sind nicht-Code-Tasks (Server-Bestellung, DNS, WhatsApp-Meta), die Claude Code nicht für dich machen kann — die stehen am Ende von Checkpoint 5 als Liste.

**Wenn du das Projekt in zwei Sessions teilen willst:**

- Session 1: Phasen 1 + 2 (Hygiene + M14) — das ist der Hauptteil.
- Session 2: Phasen 3 + 4 + 5 (CI + IONOS + Audit-Subagent) — kleiner, schnell.

In Session 2 fängst du an mit: „Wir setzen den Master-Prompt von Konzeptentwicklung/Prompt_Projekt_Abschluss.md fort. Lies STATUS.html, dann Phase 3."

**Realistische Zeitschätzung total:**

- Phase 1: 30 min (Review + 2 Commits)
- Phase 2 (M14): 3–4 h Claude-Generierung + 1–2 h dein Review/Test
- Phase 3: 30 min
- Phase 4: 30 min
- Phase 5: 20 min

Gesamt aktive Zeit deinerseits: ~3 Stunden über alle Phasen verteilt. Plus die Claude-Code-Generierungszeit dazwischen.

---

**Wenn ein Schritt sich als komplexer rausstellt** (z. B. Playwright-E2E schlägt fehl wegen Test-DB-Setup), Claude Code soll explizit pausieren und nicht zur nächsten Phase springen. Das steht im Prompt unter „Leitplanken".
