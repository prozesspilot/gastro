# Autonomer Master-Fix-Prompt: Alle Audit-Befunde abarbeiten ohne Nachfragen

> **Single-shot Modus.** Claude Code arbeitet selbständig, trifft alle Entscheidungen selbst, fragt nicht zwischendurch, liefert am Ende EINEN finalen Bericht.
>
> **So nutzt du das:**
> 1. **Neue** Claude-Code-Session im Repo-Root: `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/`
> 2. Modell: **Opus 4.6**
> 3. Block zwischen `===== PROMPT START =====` und `===== PROMPT ENDE =====` kopieren, als erste Nachricht senden
> 4. Lass es laufen (2–3 Stunden). Du musst zwischendurch nichts tun.
> 5. Am Ende kommt ein HTML-Statusbericht + Liste was nicht autonom erledigt werden konnte (externe Tasks).

---

```
===== PROMPT START =====

ROLLE
Du bist Senior Site Reliability Engineer + Full-Stack Engineer (Node 20 + TypeScript strict + Fastify + React + Vite + Postgres + Redis + n8n) im Projekt ProzessPilot. Heute arbeitest du in AUTONOMEM MODUS: Du gehst die komplette Audit-Befund-Liste 2026-05-12 durch, triffst alle Entscheidungen selbst, fragst NICHT zwischendurch, und lieferst am Ende EINEN finalen Bericht mit HTML-Status.

AUTONOMOUS_MODE: ON
═══════════════════════════════════════════════════════════════════════
- Du fragst den User NICHT zwischendurch.
- Bei den 3 offenen Audit-Fragen (F1, F2, F3) gibt es vor-definierte Default-Entscheidungen (siehe Sektion "DEFAULT-ENTSCHEIDUNGEN").
- Bei Ambiguität triffst du die konservativste Entscheidung (= geringstes Risiko).
- Bei einem unauflösbaren Hindernis: KEIN Stopp, sondern in den finalen Bericht aufnehmen ("Konnte nicht autonom gelöst werden: <Grund>, <Vorschlag>"), nächsten Task weitermachen.
- Du arbeitest in Sequenz durch alle Phasen. Kein "Soll ich weitermachen?" — einfach machen.

PFLICHT-KONTEXT — vor Beginn vollständig lesen
1. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_AUDIT_2026-05-12.html   (← der Bauplan, jeder Befund hat ID B1–B4 / W1–W6 / E1–E8 / F1–F3)
2. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/README.md
3. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/05_Roadmap.md
4. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md
5. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/README.md
6. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/src/app.ts (Skim für Kontext)
7. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/webapp/src/pages/SettingsPage.tsx (für B3)
8. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/webapp/src/components/Layout.tsx (für W2)
9. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/.gitignore (für W4)

Bestätige NICHT, dass du den Kontext gelesen hast. Beginne sofort mit Phase 0.

═══════════════════════════════════════════════════════════════════════
HARTE SICHERHEITSLEITPLANKEN (gelten unverletzbar — selbst im autonomen Modus)
═══════════════════════════════════════════════════════════════════════
- KEIN git push, git push --force, git reset --hard, git checkout auf andere Branches.
- KEIN rm -rf außerhalb von: dist/, node_modules/, .turbo/, .next/, Backup-Files (*.bak-*).
- KEINE .env / .env.local / .env.prod ins git stagen (immer vorher git check-ignore prüfen — bei Treffer ein, sonst skip).
- KEINE hardcoded API-Keys, Secrets oder Klartext-Passwörter in Code / Commits / Logs.
- KEIN Production-Server berühren (kein SSH zu fremden Hosts).
- KEIN npm install neuer Pakete außer wenn explizit von M14-Spec gefordert (die ist schon erfüllt — also: kein neues).
- Bei Test-/Build-Failure: anhalten, NICHT eigenmächtig „kreativ reparieren". Im finalen Bericht als „blockiert" markieren.
- Bei jedem Schreibvorgang an existierende Files: vorher Backup (cp <file> <file>.bak-fix-$(date +%Y%m%d-%H%M%S)).
- Konventionelle Commit-Messages mit Befund-ID(s) im Subject oder Body.

═══════════════════════════════════════════════════════════════════════
DEFAULT-ENTSCHEIDUNGEN (vor-getroffen, nicht erneut hinterfragen)
═══════════════════════════════════════════════════════════════════════

F1 — Umbenennung m06-advisor-portal → m13-advisor-portal?
  ENTSCHEIDUNG: NEIN, jetzt nicht.
  Grund: Code stabil, Tests grün, Touch eines stabilen Bereichs für reine Kosmetik bringt Bug-Risiko. In Roadmap als „beim nächsten Refactor-Sprint" markieren.
  Aktion in Phase 2: 05_Roadmap.md Notiz hinzufügen, sonst nichts tun.

F2 — Bootstrap-Migration 031b in Production?
  ENTSCHEIDUNG: Variante B (nur interaktiv via npm run bootstrap:super-admin).
  Grund: Sicherheit. INITIAL_SUPER_ADMIN_PASSWORD in ENV-Files = Risiko (Versehentliches Commit). Interaktive Lösung zwingt zur bewussten Eingabe.
  Aktion in Phase 2: 031b_bootstrap_super_admin.sql so anpassen, dass sie KEINEN Admin anlegt wenn NODE_ENV=production (oder leerer ENV); Doc-Block ergänzen, dass Production-Bootstrap nur per CLI läuft. Falls 031b komplett trivial ist, kann sie auch in einen no-op konvertiert werden.

F3 — Staging-Server zusätzlich zu Production?
  ENTSCHEIDUNG: NEIN, erstmal nur 1 Server (Production).
  Grund: Solo-Dev, 1 Pilot-Kunde. 2. Server wird bei 3+ zahlenden Kunden relevant.
  Aktion in Phase 2: Server_Umzug.md Notiz „Staging-Server: aufschieben bis 3+ Tenants", Roadmap-Eintrag im Phase-D-Block.

═══════════════════════════════════════════════════════════════════════
ARBEITS-PLAN — 6 Phasen, in genau dieser Reihenfolge
═══════════════════════════════════════════════════════════════════════

[Phase 0]  Verifikation des Audit-Befunds — sind Probleme noch da?
[Phase 1]  BLOCKER abarbeiten (B1-B4) + 3 thematische Commits
[Phase 2]  WICHTIGE Probleme (W1-W5) + F1/F2/F3-Notizen + 1 Commit
[Phase 3]  Machbare Empfehlungen (E1, E5, E6, E7-Doku, E8) + 1 Commit
[Phase 4]  Final-Test + Final-Build
[Phase 5]  Finalen Status-HTML schreiben + Bericht ausgeben

NACH JEDER PHASE: KURZE STATUS-LOG-ZEILE im Chat (1 Zeile, kein Bla-Bla), dann NÄCHSTE PHASE.
KEIN „Soll ich weiter?"

═══════════════════════════════════════════════════════════════════════
PHASE 0 — VERIFIKATION (~10 min)
═══════════════════════════════════════════════════════════════════════

Führe folgende Checks aus, sammle Resultate in interner Liste:
  - ls backend/tests/m04-categorize/  → existiert?
  - ls backend/migrations/*.sql  → wieviele Files (sollte 9 sein: 8 tot + .gitkeep)?
  - grep "http://localhost" webapp/src/pages/SettingsPage.tsx  → Treffer?
  - git status --short | wc -l  → wieviele uncommittet?
  - grep "M14.*⬜\|M14.*noch nicht" /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/README.md  → Treffer?
  - grep -E 'to="/users"|/users' webapp/src/components/Layout.tsx  → Treffer?
  - grep -E "^dist|^backend/dist|/dist" .gitignore  → Treffer?

Status-Log: "Phase 0 verifiziert: B1=<da/weg>, B2=<da/weg>, B3=<da/weg>, B4=<n uncommittet>, W1=<da/weg>, W2=<da/weg>, W4=<da/weg>".

═══════════════════════════════════════════════════════════════════════
PHASE 1 — BLOCKER (~60 min)
═══════════════════════════════════════════════════════════════════════

Reihenfolge: B1 → B2 → B3 → Test+Build → B4 (3 Commits)

B1 — toter m04-categorize-Test:
  cp -r backend/tests/m04-categorize backend/tests/m04-categorize.bak-fix-<ts>
  rm -rf backend/tests/m04-categorize/
  grep -rn "m04-categorize\|m04Categorize" backend/src backend/tests  → 0 Treffer? Wenn nicht: refs entfernen.

B2 — 8 tote Migrationen in backend/migrations/:
  Backup als tar.gz: tar -czf backend/migrations-dead-backup-<ts>.tar.gz backend/migrations/*.sql
  git rm der 8 Files (002_customer_profiles, 003_phase2_tables, 011_sevdesk, 012_datev, 013_tax_advisor_portal, 014_m09_supplier_comm, 015_plugin_registry, 016_dsgvo).
  .gitkeep behalten.

B3 — Hardcoded localhost in webapp/src/pages/SettingsPage.tsx:
  Backup machen.
  Top der Datei (nach imports) einfügen:
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const N8N_URL = import.meta.env.VITE_N8N_URL || 'http://localhost:5678';
  Alte hardcoded `const N8N_URL = 'http://localhost:5678';` entfernen (Zeile ~33).
  Die 2 Links umschreiben:
    href="http://localhost:3000/api/v1/health"  →  href={`${API_URL}/api/v1/health`}
    href="http://localhost:3000/docs"           →  href={`${API_URL}/docs`}
  Verify: grep "localhost" webapp/src/pages/SettingsPage.tsx → 0 Treffer (außer ggf. in Default-Fallback-Strings, die sind erlaubt).

NACH B1+B2+B3: Tests + Build laufen lassen:
  cd backend && npm test
  cd ../webapp && npm test
  cd ../backend && npm run build
  cd ../webapp && npm run build
  Falls einer fehlschlägt: STOP, im finalen Bericht als „Phase 1 blockiert: <Test-Name> fehlgeschlagen", restlichen Phasen 2-5 trotzdem versuchen.

B4 — 57 uncommittete Files in 3 thematische Commits:
  Pre-Check: git check-ignore .env  → muss ".env" ausgeben, sonst .env in .gitignore eintragen!
  Pre-Check: git status -s | grep -E "^\?\?\s.*\.env$" → falls .env als untracked auftaucht: ZUERST in .gitignore, dann weiter.

  COMMIT A — Audit-Cleanup:
    Files aus B1, B2, B3.
    Commit-Msg: "fix: audit findings B1-B3 — remove dead tests + dead migrations + hardcoded URLs"

  COMMIT B — M14 + Infrastructure:
    backend/migrations/031_users_auth.sql, 031b_bootstrap_super_admin.sql
    backend/src/core/auth/*, backend/src/modules/users/*
    backend/package.json, package-lock.json, src/app.ts, src/core/config.ts, vitest.config.ts
    webapp/src/auth/*, webapp/src/pages/LoginPage.tsx, ChangePasswordPage.tsx, UsersPage.tsx, UserFormModal.tsx
    webapp/src/components/UserMenu.tsx, Layout.tsx
    webapp/src/api/auth.ts, users.ts, _client.ts
    webapp/src/App.tsx, webapp/src/tests/*
    backend/src/core/auth/hmac.middleware.test.ts (falls neu)
    Commit-Msg: "feat(m14): JWT auth + user management + permission middleware"

  COMMIT C — Infrastructure + CI + Docs:
    .github/, .claude/agents/, .claude/commands/, infra/scripts/
    docker-compose.prod.yml, infra/runbook/01_deployment.md, prozesspilot/README.md
    .env.example, .env.bak-* (falls vorhanden)
    Konzeptentwicklung/* (alle .md + .html + _audit/)
    Commit-Msg: "chore(infra+docs): CI pipeline + audit subagent + IONOS scripts + concept docs sync"

  Verify: git status --short  → leer oder nur .env

Status-Log: "Phase 1 abgeschlossen: 3 Commits, n Tests grün, Build grün".

═══════════════════════════════════════════════════════════════════════
PHASE 2 — WICHTIGE PROBLEME (~60 min)
═══════════════════════════════════════════════════════════════════════

W1 — Konzept-Doku sync:
  README.md: Modul-Tabelle, Zeile M14: „⬜ noch nicht impl." → entfernen, Pfade ergänzen.
  Footer/Header: „IST-Stand 2026-05-07" → „IST-Stand 2026-05-12 (post-fix)"
  05_Roadmap.md Phase A+: alle Checkboxen `- [ ]` → `- [x]` setzen.
  STATUS.html: oben einen Notice-Block einfügen: "⚠ Veraltet seit 2026-05-12. Aktueller Stand: STATUS_AUDIT_2026-05-12.html".
  Memory-Datei (falls erreichbar): skippen, ist Sache der Cowork-Memory.

W2 — Layout Nav-Link /users:
  Backup webapp/src/components/Layout.tsx.
  useAuth-Import sicherstellen.
  Im Nav-Block (Sidebar oder Header) einfügen:
    {hasPermission('users.read') && (
      <NavLink to="/users" className={ ... gleiche CSS wie andere Items ... }>Benutzer</NavLink>
    )}
  Bei super_admin (tenant_id===null): keine spezielle Behandlung nötig, hasPermission('*') deckt das ab.

W3 — VITE-ENV-Variablen:
  webapp/.env.example anlegen (oder ergänzen) mit:
    VITE_API_URL=http://localhost:3000
    VITE_N8N_URL=http://localhost:5678
  docker-compose.prod.yml — webapp-Service args:
    ARG VITE_N8N_URL hinzufügen
  Server_Umzug.md Schritt 5 (.env.prod): VITE_API_URL + VITE_N8N_URL ergänzen.
  docs/openapi.yaml: Server-Block mit Variable.

W4 — dist/ in .gitignore:
  grep -E "^dist|^backend/dist|/dist" .gitignore → falls leer:
    echo "backend/dist/" >> .gitignore
    echo "webapp/dist/" >> .gitignore
  git ls-files backend/dist/  → falls Treffer:
    git rm -r --cached backend/dist/

W5 — Stub-Tests für m11-imap, dsgvo, plugin-system:
  Für jedes der 3 Module: backend/tests/<modul>/<modul>.routes.test.ts anlegen mit Smoke-Test-Pattern:
    - import buildApp from '../../src/app'
    - beforeAll/afterAll, app.close()
    - test 1: "lädt Modul ohne Fehler" — app.hasRoute oder Routes-Array prüfen
    - test 2: "schützt Endpoint hinter Auth" — app.inject GET ohne Token → 401
  npm test alle grün?

W6 — m06→m13 Umbenennung: SKIPPED (siehe DEFAULT F1).
  Aktion: in 05_Roadmap.md Phase D einen Punkt ergänzen: „Refactor: m06-advisor-portal → m13-advisor-portal (Konventions-Korrektur, aktuell wegen Stabilität verschoben)".

F1/F2/F3-Notizen:
  - 05_Roadmap.md Phase D: m06→m13 Eintrag (s.o.).
  - 031b_bootstrap_super_admin.sql: SQL anpassen, sodass sie nur dann INSERT-et, wenn INITIAL_SUPER_ADMIN_EMAIL UND INITIAL_SUPER_ADMIN_PASSWORD_HASH (nicht plain!) gesetzt sind. Alternative: 031b zu einer reinen Skeleton-Migration ohne INSERT machen, mit Kommentar „Production: nutze npm run bootstrap:super-admin".
  - Server_Umzug.md: Notiz „Staging-Server: erst ab 3+ Tenants. Aktuell nur 1 Production-VPS." als Hinweis-Block in Schritt 0.

Tests + Build nach Phase 2:
  cd backend && npm test
  cd ../webapp && npm test
  cd ../backend && npm run build
  cd ../webapp && npm run build
  Falls Fail: STOP für Phase 2, im Bericht als „Phase 2 blockiert", weiter mit Phase 3.

COMMIT D — Wichtige Probleme:
  git add Konzeptentwicklung/README.md Konzeptentwicklung/05_Roadmap.md Konzeptentwicklung/STATUS.html Konzeptentwicklung/Server_Umzug.md
  git add webapp/src/components/Layout.tsx webapp/.env.example
  git add docker-compose.prod.yml docs/openapi.yaml
  git add .gitignore
  git add backend/tests/m11-imap/ backend/tests/dsgvo/ backend/tests/plugin-system/
  git add backend/migrations/031b_bootstrap_super_admin.sql (falls modifiziert)
  Commit-Msg: "fix: audit findings W1-W5 + F1-F3 defaults — sync docs, add /users nav, VITE env vars, gitignore dist, test stubs"

Status-Log: "Phase 2 abgeschlossen: 1 Commit, n+m Tests grün".

═══════════════════════════════════════════════════════════════════════
PHASE 3 — EMPFEHLUNGEN (~30 min)
═══════════════════════════════════════════════════════════════════════

E1 — Audit-Subagent: prüfen ob alle Files da sind. Falls etwas fehlt: ergänzen. KEIN Eigenaufruf des Subagents (rekursiv).
  Checks:
    - .claude/agents/konzept-auditor.md existiert + sinnvolles Frontmatter (model: opus, tools: Read, Glob, Grep, Write)
    - .claude/commands/audit-konzept.md existiert
    - .claude/commands/audit-apply.md existiert + Safety-Net (DELETE_LIST-Pattern)
    - Konzeptentwicklung/_audit/ existiert + README erklärt Workflow

E5 — Memory-Check-Cron im Deployment-Runbook:
  infra/runbook/01_deployment.md erweitern um Sektion „Memory-Monitoring":
    Cron-Eintrag */10 * * * * /opt/prozesspilot/infra/scripts/memory-check.sh
    Hinweis: Mail-Alert bei >85% RAM

E6 — Playwright in CI:
  .github/workflows/ci.yml prüfen:
    - Falls noch kein „test:e2e" Step: ergänzen mit npx playwright install --with-deps + npx playwright test
    - Caching für Playwright-Browsers via actions/cache
  Falls schon vorhanden: belassen, im Bericht als ✓ markieren.

E7 — M08 TODOs dokumentieren (nicht implementieren):
  Datei anlegen: Konzeptentwicklung/_audit/TODO_M08_phase2.md mit beiden TODOs (Mail + WhatsApp) ausführlich dokumentiert.

E8 — README CI-Badges:
  prozesspilot/README.md ganz oben (nach H1) zwei Markdown-Badges einfügen, mit Platzhalter <user> falls GitHub-Owner unbekannt:
    [![CI](https://github.com/<user>/prozesspilot/actions/workflows/ci.yml/badge.svg)](https://github.com/<user>/prozesspilot/actions/workflows/ci.yml)
    [![CodeQL](https://github.com/<user>/prozesspilot/actions/workflows/codeql.yml/badge.svg)](https://github.com/<user>/prozesspilot/actions/workflows/codeql.yml)

E2/E3/E4 — Sentry / WhatsApp / UptimeRobot: SKIP (externe Tasks, im finalen Bericht als „User-Action" listen).

COMMIT E — Empfehlungen:
  git add .claude/ infra/runbook/01_deployment.md .github/workflows/ci.yml prozesspilot/README.md Konzeptentwicklung/_audit/TODO_M08_phase2.md
  Commit-Msg: "chore: audit recommendations E1+E5+E6+E7+E8 — subagent check, memory cron, playwright in CI, README badges, M08 phase2 TODO"

Status-Log: "Phase 3 abgeschlossen: 1 Commit, Empfehlungen umgesetzt".

═══════════════════════════════════════════════════════════════════════
PHASE 4 — FINAL TEST + BUILD (~10 min)
═══════════════════════════════════════════════════════════════════════

cd backend && npm test 2>&1 | tail -20
cd ../webapp && npm test 2>&1 | tail -20
cd ../backend && npm run build 2>&1 | tail -5
cd ../webapp && npm run build 2>&1 | tail -5

# Optional, wenn Postgres läuft:
docker compose ps 2>&1 | head -10
# Optional, wenn Playwright konfiguriert:
cd ../webapp && npx playwright install --with-deps chromium 2>&1 | tail -5

Sammele Resultate für finalen Bericht. Bei Failure: nicht weiter machen, einfach im Bericht als blockiert listen.

git log --oneline -8
git status --short

Status-Log: "Phase 4 abgeschlossen: Final-Tests <n Pass/m Fail>, n Commits seit Audit-Start".

═══════════════════════════════════════════════════════════════════════
PHASE 5 — FINALER STATUS-HTML (~20 min)
═══════════════════════════════════════════════════════════════════════

Schreibe Datei:
  /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_POST_FIX_AUTONOMOUS.html

Style: dark-mode, konsistent mit STATUS_AUDIT_2026-05-12.html (gleiche CSS-Variables und Klassen).

Sektionen:
  1. Header — „ProzessPilot · Autonomer Fix-Lauf · <Datum> <Uhrzeit>"
     Pill „GRÜN" oder „TEILS GRÜN" (TEILS GRÜN wenn Phasen blockiert)
  2. Executive Summary (3-5 Sätze): was wurde gemacht
  3. Audit-Befund-Tabelle: alle IDs (B1..B4 / W1..W6 / E1..E8 / F1..F3) mit Status:
     ✓ erledigt | ⏸ verschoben (mit Grund) | ✗ blockiert (mit Grund) | 🔗 extern (User-Action nötig)
  4. Test-Stand vorher/nachher (Anzahl Tests + Pass/Fail)
  5. Commit-Liste (A-E, mit kurzen SHAs + Subject)
  6. Backup-Files (Pfade aller .bak-fix-*-Files + Tar-Archive)
  7. Verbleibende User-Actions (was Claude Code NICHT konnte):
     - WhatsApp Meta-Verifizierung
     - IONOS-Server-Bestellung + SSH + DNS
     - Domain auf Server zeigen
     - .env.prod mit echten Secrets befüllen
     - bootstrap:super-admin interaktiv ausführen (entscheidung F2)
     - Sentry-Account + DSN
     - UptimeRobot-Account
     - npm install (falls nötig) auf Production-Server
     - GitHub-Repo erstellen + push + Deploy-Key + Webhook
  8. Empfohlene nächste 5 Schritte (sortiert nach Dringlichkeit)
  9. Footer: Generierungs-Timestamp + „Autonomous Mode"

Im Chat: Ausgabe in dieser Form:
  ✓ Fix-Lauf abgeschlossen
  - Erledigt: <n> Befunde (B1-B4 + W1-W5 + E1+E5+E6+E7+E8)
  - Verschoben: <n> Befunde (Liste mit Grund)
  - Blockiert: <n> Befunde (Liste mit Grund)
  - Externe Tasks: 9 (Liste verkürzt)
  - HTML: /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_POST_FIX_AUTONOMOUS.html
  - Commits: <Liste der A-E SHAs>

ENDE.

═══════════════════════════════════════════════════════════════════════
WENN IRGENDWO ETWAS SCHIEFGEHT (egal welche Phase)
═══════════════════════════════════════════════════════════════════════
- KEIN STOP für den User.
- Phase / Schritt im internen Log als „blockiert" markieren.
- Weitermachen mit der nächsten unabhängigen Aufgabe.
- Im finalen Status-HTML klar dokumentieren:
  * WAS sollte gemacht werden
  * WAS gemacht wurde (bzw. nicht)
  * WARUM nicht (Fehler-Output)
  * WIE der User es manuell fixt
- Niemals dem User Fragen stellen (auch nicht zwischendurch). Triff Default-Entscheidung oder skip.

LOS — beginne sofort mit Phase 0. Erste Ausgabe sollte sein:
  "[Phase 0] Verifiziere Befund-Status …"

===== PROMPT ENDE =====
```

---

## Bedienungs-Hinweise (NICHT in den Prompt kopieren)

**Vor dem Senden:**

1. Sicherstellen, dass Docker läuft + Services hoch sind:
   ```bash
   cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot && docker compose up -d
   ```
2. Modell auf Opus 4.6 stellen
3. (Optional) Repo-Backup: `cp -r prozesspilot prozesspilot.bak-vor-autonomous-fix`
4. Prompt-Block kopieren, einfügen, **Enter**.

**Während des Laufs:**

- Claude Code arbeitet 2–3 Stunden ohne Nachfragen.
- Du musst nichts tun. Kannst was anderes machen.
- Falls Claude Code dich aus irgendeinem Grund trotzdem etwas fragt: einfach „weiter" antworten, er soll selbst entscheiden.

**Nach dem Lauf:**

- Status-HTML im Browser öffnen
- Liste „verbleibende User-Actions" durchgehen — das ist alles, was du noch selbst tun musst
- Wenn etwas blockiert war: kopier den Befund hier rein, dann unblocken wir gezielt

**Vor-getroffene Default-Entscheidungen** (kannst du nachträglich noch ändern):

- **F1** (m06→m13-Umbenennung): NEIN, beim nächsten Refactor.
- **F2** (Bootstrap-Migration in Production): NEIN, nur interaktiv. Sicherer.
- **F3** (Staging-Server): NEIN, erst ab 3+ zahlenden Kunden.

Diese Defaults sind konservativ und für Solo-Setup optimiert. Wenn du eine davon anders willst: erst Prompt anpassen, dann senden.

**Was Claude Code wirklich nicht kann** (egal wie autonom):

- WhatsApp Meta-Verifizierung anstoßen
- IONOS-Server kaufen + SSH einrichten + DNS
- Sentry-Account / UptimeRobot anlegen
- `.env.prod` mit echten API-Keys befüllen
- `npm run bootstrap:super-admin` interaktiv auf Production ausführen

Diese 5 Punkte stehen am Ende des Status-HTMLs als „User-Actions".

**Realistische Erwartung:** 80–95 % der Audit-Befunde werden autonom erledigt. Externe Tasks bleiben offen, sind aber dokumentiert.
