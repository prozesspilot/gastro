# Master-Fix-Prompt: Alle Audit-Befunde 2026-05-12 abarbeiten

> **So nutzt du diesen Prompt:**
> 1. **Neue** Claude-Code-Session im Repo-Root öffnen: `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/`
> 2. Modell: **Opus 4.6** (nicht Sonnet, nicht Haiku — der Prompt ist komplex)
> 3. Block zwischen `===== PROMPT START =====` und `===== PROMPT ENDE =====` kopieren und als erste Nachricht senden
> 4. Bei den Checkpoints **wirklich** prüfen, nicht durchwinken
> 5. Realistische Zeit: 2–3 Stunden Claude-Generierung + 30–60 min dein Review

---

```
===== PROMPT START =====

ROLLE
Du bist Senior Site Reliability Engineer + Full-Stack Engineer (Node 20 + TypeScript strict + Fastify + React + Vite + Postgres + Redis + n8n) im Projekt ProzessPilot. Heute ist dein Auftrag: das System auf Basis eines bereits durchgeführten Audits in einen produktionsbereiten Zustand bringen. Du arbeitest nach einem präzisen Befund-Plan, nicht nach Bauchgefühl.

KONTEXT — der Audit, dem du folgst
Am 2026-05-12 wurde ein vollständiger Repo-Audit durchgeführt. Befund: 4 BLOCKER, 6 WICHTIGE Probleme, 8 EMPFEHLUNGEN, 3 OFFENE FRAGEN. Der Audit-Report liegt unter:
  /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_AUDIT_2026-05-12.html

Lies diesen vor allem anderen. Jeder Befund hat eine ID (B1–B4, W1–W6, E1–E8, F1–F3). Du referenzierst diese IDs in jedem Commit, jeder Aktion, jedem Bericht.

PFLICHT-KONTEXT — vor Beginn vollständig lesen
1. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_AUDIT_2026-05-12.html   (← der Bauplan)
2. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS.html                    (Cleanup-Stand 07.05.)
3. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_LOGIN_FIX.html         (Login-Fix-Stand 12.05.)
4. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/README.md
5. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/05_Roadmap.md
6. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md
7. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/README.md
8. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/src/app.ts (kurzer Skim)
9. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/webapp/src/pages/SettingsPage.tsx (für B3)
10. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/webapp/src/components/Layout.tsx (für W2)
11. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/.gitignore (für W4)

Nach dem Lesen: fasse in 8 Bullet-Points zusammen, was du verstanden hast, und warte auf "weiter zur Verifikation".

═══════════════════════════════════════════════════════════════════════
GLOBALE REGELN — gelten für ALLE Phasen
═══════════════════════════════════════════════════════════════════════
- NIEMALS git push, git reset --hard, git checkout auf andere Branch.
- NIEMALS rm -rf außerhalb von dist/, node_modules/, .turbo/, .next/, Backup-Files (*.bak-*).
- NIEMALS .env, .env.local, .env.prod ins git stagen (immer git check-ignore prüfen).
- NIEMALS Klartext-Passwörter in Logs, Commits, Code-Kommentare.
- NIEMALS Sentry-DSN, API-Keys oder andere Secrets hardcoden.
- Bei jedem Schreibvorgang an existierenden Files: vorher Backup (cp <file> <file>.bak-fix-<timestamp>).
- Bei Test-/Build-Fehler: STOP, vollständigen Stacktrace zeigen, NICHT eigenmächtig debuggen.
- Bei Mehrdeutigkeit: explizit fragen statt raten.
- Konventionelle Commit-Messages: feat / fix / chore / refactor / test / docs.
- Pro Commit-Message: relevante Befund-IDs (B1, W3, etc.) in der Subject-Line oder im Body.
- Jeden Schritt mit ✓ oder ✗ + 1 Zeile berichten. KEIN Bla-bla.

═══════════════════════════════════════════════════════════════════════
PHASE 0 — VERIFIKATION DES AUDIT-BEFUNDS (10 min)
═══════════════════════════════════════════════════════════════════════

ZIEL: Sicherstellen, dass die Befunde aus dem Audit noch valid sind (zwischen Audit und Fix können Stunden vergangen sein).

CHECKS
0.1 B1 — Existiert backend/tests/m04-categorize/ noch?
    Aktion: ls backend/tests/m04-categorize/
0.2 B2 — Existieren die 8 toten Migrationen in backend/migrations/?
    Aktion: ls backend/migrations/*.sql | grep -v 031
0.3 B3 — Hardcoded localhost-URLs in webapp/src/pages/SettingsPage.tsx?
    Aktion: grep -n "http://localhost" webapp/src/pages/SettingsPage.tsx
0.4 B4 — git status zeigt wirklich ~57 uncommittete Files?
    Aktion: git status --short | wc -l
0.5 W1 — Konzept-Doku noch mit M14 ⬜?
    Aktion: grep "M14.*⬜\|M14.*noch nicht" /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/README.md
0.6 W2 — Layout.tsx hat keinen /users-Link?
    Aktion: grep -E 'to="/users"|/users' webapp/src/components/Layout.tsx
0.7 W4 — dist/ in .gitignore?
    Aktion: grep -E "^dist|^backend/dist" .gitignore

CHECKPOINT 0 — VERIFIKATIONS-REPORT
Bericht: pro Befund "✓ noch da" oder "✗ inzwischen erledigt" oder "⚠ leicht geändert: ...".
Wenn ein Befund nicht mehr existiert (z. B. m04-categorize-Tests schon weg): in den Folge-Phasen überspringen + im Final-Report begründen.
STOP. Warte auf "weiter zu Phase 1".

═══════════════════════════════════════════════════════════════════════
PHASE 1 — BLOCKER-SPRINT (60–90 min)
═══════════════════════════════════════════════════════════════════════

Reihenfolge: B1 → B2 → B3 → Tests laufen → B4 (Commits)

──── B1: Toter m04-categorize-Test ──────────────────────────────────
SCHRITTE:
  1. Backup: cp -r backend/tests/m04-categorize backend/tests/m04-categorize.bak-fix-$(date +%Y%m%d-%H%M%S)
  2. rm -rf backend/tests/m04-categorize/
  3. Verify: ls backend/tests/m04-categorize/ → not found
  4. Sanity-Check: Importiert noch irgendwo m04-categorize-Code? grep -rn "m04-categorize\|m04Categorize" backend/src backend/tests
     → Falls Treffer: STOP, melden. Falls 0: weiter.

──── B2: 8 tote Migrationen in backend/migrations/ ───────────────────
SCHRITTE:
  1. Liste anzeigen: ls backend/migrations/*.sql
  2. WICHTIG: Inhalt jeder Datei kurz scannen, ob sie aktiv genutzt wird.
     Für jede Datei: grep -rn "$(basename $file .sql)" backend/src migrations/
     → Wenn 0 Treffer: kann weg. Wenn Treffer: STOP, melden.
  3. Backup (Tar): tar -czf backend/migrations-backup-$(date +%Y%m%d-%H%M%S).tar.gz backend/migrations/*.sql
  4. git rm backend/migrations/002_customer_profiles.sql backend/migrations/003_phase2_tables.sql \
            backend/migrations/011_sevdesk.sql backend/migrations/012_datev.sql \
            backend/migrations/013_tax_advisor_portal.sql backend/migrations/014_m09_supplier_comm.sql \
            backend/migrations/015_plugin_registry.sql backend/migrations/016_dsgvo.sql
  5. backend/migrations/.gitkeep behalten (Ordner darf existieren bleiben, nur leer)
  6. Verify: ls backend/migrations/ → nur noch .gitkeep + ggf. 031/031b (falls die hier noch liegen)
     Wichtig: 031_users_auth.sql + 031b_bootstrap_super_admin.sql sind inzwischen in migrations/ (Repo-Root)
     gelandet — wenn sie auch in backend/migrations/ liegen, sind die Duplikate und können weg.

──── B3: Hardcoded localhost in SettingsPage.tsx ────────────────────
SCHRITTE:
  1. Backup: cp webapp/src/pages/SettingsPage.tsx webapp/src/pages/SettingsPage.tsx.bak-fix-$(date +%Y%m%d-%H%M%S)
  2. Top der Datei (nach den imports), füge ein:
     ```typescript
     const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
     const N8N_URL = import.meta.env.VITE_N8N_URL || 'http://localhost:5678';
     ```
  3. Entferne die alte Zeile `const N8N_URL = 'http://localhost:5678';` (Zeile 33).
  4. Ersetze die 2 Links in JSX:
     `href="http://localhost:3000/api/v1/health"` → `href={`${API_URL}/api/v1/health`}`
     `href="http://localhost:3000/docs"`         → `href={`${API_URL}/docs`}`
  5. Verifikation: grep -n "localhost" webapp/src/pages/SettingsPage.tsx → KEIN Treffer mehr
  6. webapp/.env.example und docker-compose.prod.yml ergänzen — siehe W3 (kommt in Phase 2)

──── TESTS + BUILD nach B1+B2+B3 ──────────────────────────────────
  cd backend && npm test
  cd ../webapp && npm test
  cd ../backend && npm run build
  cd ../webapp && npm run build
  Alle 4 grün? Wenn nicht: STOP, exakter Stacktrace.

──── B4: Uncommittete Files in 3 thematischen Commits ───────────────
SCHRITTE:

  Vorbereitung: git check-ignore .env → Output ".env" (sonst STOP, .env muss in .gitignore!)

  COMMIT A — Audit-Cleanup (Resultate aus B1+B2+B3):
    git add backend/migrations/.gitkeep
    git add webapp/src/pages/SettingsPage.tsx webapp/.env.example
    git rm <die 8 Migrations-Files> -f
    git rm -r backend/tests/m04-categorize/ -f
    git commit -m "fix: audit findings B1-B3 — remove dead tests, dead migrations, hardcoded URLs

- B1: drop backend/tests/m04-categorize/ (module deleted earlier)
- B2: drop 8 dead migrations in backend/migrations/ (migration runner reads from /migrations only)
- B3: SettingsPage uses VITE_API_URL + VITE_N8N_URL instead of hardcoded localhost"

  COMMIT B — M14 + Infrastructure (alles aus dem Master-Prompt-Lauf):
    git add backend/migrations/031_users_auth.sql backend/migrations/031b_bootstrap_super_admin.sql
    git add backend/src/core/auth/ backend/src/modules/users/
    git add backend/package.json backend/package-lock.json backend/src/app.ts
    git add backend/src/core/config.ts backend/vitest.config.ts
    git add webapp/src/auth/ webapp/src/pages/LoginPage.tsx webapp/src/pages/ChangePasswordPage.tsx
    git add webapp/src/pages/UsersPage.tsx webapp/src/pages/UserFormModal.tsx
    git add webapp/src/components/UserMenu.tsx webapp/src/components/Layout.tsx
    git add webapp/src/api/auth.ts webapp/src/api/users.ts webapp/src/api/_client.ts
    git add webapp/src/App.tsx webapp/src/tests/
    git add backend/src/core/auth/hmac.middleware.test.ts
    git commit -m "feat(m14): JWT auth + user management + permission middleware

Implements modules/M14_User_Verwaltung_Auth.md:
- JWT (15min) + Refresh-Token (30d) with rotation + replay detection
- argon2id password hashing
- Permission-based access control (wildcard expansion)
- User-CRUD endpoints, Bootstrap super_admin CLI
- Frontend: LoginPage, UsersPage, UserFormModal, ChangePasswordPage, UserMenu
- 6 new tests (jwt, password, permissions + handlers)"

  COMMIT C — Infrastructure + CI + Audit:
    git add .github/ .claude/agents/ .claude/commands/ infra/scripts/
    git add docker-compose.prod.yml infra/runbook/01_deployment.md README.md
    git add .env.example .env.bak-*
    # Konzeptentwicklung-Files:
    git add ../Modulkonzept/Konzeptentwicklung/
    git commit -m "chore(infra+docs): CI pipeline + audit subagent + IONOS scripts + concept docs sync

- GitHub Actions: ci.yml, codeql.yml, dependabot.yml
- Audit subagent: .claude/agents/konzept-auditor.md + 2 slash commands
- IONOS-specific scripts: setup-swap.sh, memory-check.sh
- docker-compose.prod.yml: memory limits per service
- Concept docs: STATUS_AUDIT_2026-05-12.html, M14 spec, Server_Umzug.md, prompts"

  Verifikation:
    git log --oneline -3
    git status --short  → sollte leer oder nur .env zeigen

CHECKPOINT 1 — BLOCKER-REPORT
Bericht-Tabelle:
| ID | Aktion | Status | Bemerkung |
|----|--------|--------|-----------|
| B1 | m04-categorize-Tests gelöscht | ✓ | |
| B2 | 8 tote Migrationen gelöscht | ✓ | |
| B3 | SettingsPage auf VITE-ENV | ✓ | |
| B4 | 3 Commits erstellt | ✓ | A: <sha>, B: <sha>, C: <sha> |
| Tests | npm test grün | ✓ | n Tests grün |
| Build | npm run build grün | ✓ | |

STOP. Warte auf "weiter zu Phase 2".

═══════════════════════════════════════════════════════════════════════
PHASE 2 — WICHTIGE PROBLEME (60 min)
═══════════════════════════════════════════════════════════════════════

──── W1: Konzept-Doku auf IST-Stand ─────────────────────────────────
SCHRITTE:
  1. README.md im Konzept-Ordner: Modul-Tabelle Zeile mit M14 ändern:
     `| M14 | User-Verwaltung & Auth (⬜ noch nicht impl.) | ...`
     →
     `| M14 | User-Verwaltung & Auth                       | alle Pakete | Login + REST              | backend/src/modules/users/ + webapp/src/auth/ |`
     Header-Status-Block "Letztes Update" auf 2026-05-12.

  2. 05_Roadmap.md Phase A+ Block: alle 5 Checkboxen von `- [ ]` auf `- [x]` setzen.

  3. STATUS.html (post-cleanup, 07.05.) als veraltet markieren oder über
     Verweis auf STATUS_AUDIT_2026-05-12.html aktualisieren — neuer Notice-Block
     oben in STATUS.html: "⚠ Veraltet seit 2026-05-12. Aktueller Stand: STATUS_AUDIT_2026-05-12.html".

  4. Memory-Datei aktualisieren (lokaler Pfad, falls Claude Code Zugriff hat):
     /Users/donandrejo/Library/Application Support/Claude/local-agent-mode-sessions/*/spaces/*/memory/project_prozesspilot.md
     → falls Pfad nicht erreichbar: ÜBERSPRINGEN und im Final-Report erwähnen.

──── W2: Nav-Link zu /users im Layout ───────────────────────────────
SCHRITTE:
  1. Backup: cp webapp/src/components/Layout.tsx webapp/src/components/Layout.tsx.bak-fix-...
  2. Im Navigations-Block (vermutlich Sidebar oder Header-Nav) einfügen:
     ```tsx
     {hasPermission('users.read') && (
       <NavLink to="/users">Benutzer</NavLink>
     )}
     ```
     Falls Layout `useAuth()` nicht nutzt: import { useAuth } from '../auth/AuthContext'; oben hinzufügen.
     `hasPermission` aus AuthContext destructuren.
  3. Stil-konsistent: gleiche CSS-Klassen wie andere Nav-Links.
  4. Bei super_admin (tenant_id===null): zusätzlich ein Item "Tenant-Switcher" oder ähnliches sichtbar.
  5. Verify: webapp Build grün + manuell prüfen (oder Test).

──── W3: VITE-ENV-Variablen + .env.example ──────────────────────────
SCHRITTE:
  1. webapp/.env.example öffnen (anlegen falls fehlt):
     ```
     # API-Backend URL (Production: https://api.deinedomain.de)
     VITE_API_URL=http://localhost:3000
     # n8n Editor URL (Production: https://n8n.deinedomain.de)
     VITE_N8N_URL=http://localhost:5678
     ```
  2. docker-compose.prod.yml — webapp-Service-Block: in args den VITE_N8N_URL ergänzen.
  3. docs/openapi.yaml Server-Block: Production-Server-URL als Variable.
  4. Server_Umzug.md Schritt 5 (.env.prod-Sektion): VITE_API_URL + VITE_N8N_URL ergänzen.

──── W4: backend/dist/ in .gitignore ────────────────────────────────
SCHRITTE:
  1. grep -E "^dist|^backend/dist|/dist" .gitignore
  2. Wenn nicht vorhanden: echo "backend/dist/" >> .gitignore && echo "webapp/dist/" >> .gitignore
  3. Sind backend/dist/-Files in git? git ls-files backend/dist/ | head
  4. Falls ja: git rm -r --cached backend/dist/  (entfernt aus Index, behält Files lokal)

──── W5: Tests für m11-imap, dsgvo, plugin-system ───────────────────
SCHRITTE (Stubs reichen — Vollabdeckung ist V2):

  Für jedes der drei Module:
  1. backend/tests/<modul>/<modul>.routes.test.ts anlegen.
  2. Smoke-Test-Pattern:
     ```typescript
     import { buildApp } from '../../src/app';
     describe('<Modul> routes', () => {
       let app;
       beforeAll(async () => { app = await buildApp({ logger: false }); });
       afterAll(async () => { await app.close(); });
       it('lädt das Modul ohne Fehler', () => {
         expect(app.hasRoute('GET', '/api/v1/...')).toBe(true);  // realistischer Endpoint
       });
       it('schützt Endpoint hinter Auth', async () => {
         const res = await app.inject({ method: 'GET', url: '/api/v1/...' });
         expect(res.statusCode).toBe(401);
       });
     });
     ```
  3. Mindestens 2 Tests pro Modul: lädt-ohne-Fehler + Auth-Required.
  4. npm test — alle grün?

──── W6: m06-advisor-portal → m13-advisor-portal? ───────────────────
NICHT EIGENMÄCHTIG. Das ist Frage F1 in Phase 4 — User muss entscheiden.
In Phase 2 NICHT umbenennen.

CHECKPOINT 2 — WICHTIGE-REPORT
Bericht-Tabelle:
| ID | Aktion | Status | Bemerkung |
|----|--------|--------|-----------|
| W1 | README + Roadmap + STATUS.html + Memory | ✓ | |
| W2 | Layout Nav-Link /users | ✓ | |
| W3 | VITE-ENV in .env.example + compose + openapi | ✓ | |
| W4 | dist/ in .gitignore | ✓ | |
| W5 | Stub-Tests für m11/dsgvo/plugin-system | ✓ | n neue Tests |
| W6 | m06→m13 Umbenennung | ⏸ | offen für User-Entscheidung |

Tests + Build grün? Wenn nicht: STOP.

COMMIT D — Wichtige Probleme:
  git add ../Modulkonzept/Konzeptentwicklung/README.md ../Modulkonzept/Konzeptentwicklung/05_Roadmap.md
  git add ../Modulkonzept/Konzeptentwicklung/STATUS.html
  git add webapp/src/components/Layout.tsx webapp/.env.example
  git add docker-compose.prod.yml docs/openapi.yaml
  git add .gitignore
  git add backend/tests/m11-imap/ backend/tests/dsgvo/ backend/tests/plugin-system/
  git commit -m "fix: audit findings W1-W5 — sync docs, add /users nav, VITE env vars, gitignore dist, test stubs"

STOP. Warte auf "weiter zu Phase 3".

═══════════════════════════════════════════════════════════════════════
PHASE 3 — MACHBARE EMPFEHLUNGEN (30 min)
═══════════════════════════════════════════════════════════════════════

Übersprungen werden: E2 Sentry-DSN, E3 WhatsApp Meta, E4 UptimeRobot (alle extern).

──── E1: Audit-Subagent einmal probelaufen lassen ────────────────────
NICHT direkt aufrufen (Subagent-Eigenaufruf in Claude Code wäre rekursiv).
Stattdessen: README für den Subagent prüfen + sicherstellen, dass:
  - .claude/agents/konzept-auditor.md existiert und sauber ist
  - .claude/commands/audit-konzept.md ruft Subagent korrekt auf
  - .claude/commands/audit-apply.md hat Safety-Net (nur DELETE-Liste)
  - /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/_audit/ existiert + README erklärt Workflow
Falls etwas fehlt: ergänzen. Falls alles da ist: ✓ markieren.

──── E5: Memory-Check-Cron im Deployment-Runbook ────────────────────
infra/runbook/01_deployment.md erweitern: neuer Abschnitt nach Schritt "Backups":
```
## Memory-Monitoring (IONOS 4 GB RAM — Pflicht)
Cron-Eintrag auf dem Server:
  */10 * * * * /opt/prozesspilot/infra/scripts/memory-check.sh
Setzt Alert-Mail bei >85% RAM-Nutzung an deine Email.
```

──── E6: Playwright in CI integrieren ────────────────────────────────
.github/workflows/ci.yml prüfen:
  - Läuft `npm run test:e2e` (oder `npx playwright test`) als Step?
  - Falls nein: Step ergänzen, nach webapp-Build, mit Postgres + Backend als Services
  - Caching für Playwright-Browsers via actions/cache
Falls schon vorhanden: ✓ markieren.

──── E7: M08 TODOs als Issue dokumentieren ──────────────────────────
Statt zu implementieren (Phase 2 Arbeit) — nur dokumentieren:
  /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/_audit/TODO_M08_phase2.md anlegen:
  ```
  # M08 Phase 2 TODOs
  ## Mail-Sender (services/mail-sender.ts:31)
  - Implementierung: nodemailer SMTP
  - ENV: SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM
  - Test: 1 Integration-Test mit MailHog / Ethereal
  ## WhatsApp-Sender (services/whatsapp-sender.ts:27)
  - Implementierung: Graph-API call template "monthly_report_de"
  - Voraussetzung: WhatsApp Business verifiziert + Template-Approval
  - Test: Mock-Mode + 1 Integration mit Test-Phone-Number
  ```

──── E8: README CI-Badge ────────────────────────────────────────────
prozesspilot/README.md ganz oben (nach H1):
  [![CI](https://github.com/<user>/prozesspilot/actions/workflows/ci.yml/badge.svg)](https://github.com/<user>/prozesspilot/actions/workflows/ci.yml)
  [![CodeQL](https://github.com/<user>/prozesspilot/actions/workflows/codeql.yml/badge.svg)](https://github.com/<user>/prozesspilot/actions/workflows/codeql.yml)
Hinweis im Bericht: <user> muss manuell ersetzt werden, sobald GitHub-Repo bekannt ist.

CHECKPOINT 3 — EMPFEHLUNGEN-REPORT
Bericht: pro E1, E5, E6, E7, E8 ✓/⏸ + Notiz.

COMMIT E:
  git add infra/runbook/01_deployment.md .github/workflows/ci.yml prozesspilot/README.md
  git add ../Modulkonzept/Konzeptentwicklung/_audit/TODO_M08_phase2.md
  git commit -m "chore: audit recommendations E1+E5+E6+E7+E8 — memory cron, playwright in CI, README badges, M08 phase2 TODO"

STOP. Warte auf "weiter zu Phase 4".

═══════════════════════════════════════════════════════════════════════
PHASE 4 — OFFENE FRAGEN ZUR USER-ENTSCHEIDUNG (10 min)
═══════════════════════════════════════════════════════════════════════

NICHTS UMSETZEN. Nur strukturiert dem User die drei Fragen vorlegen, mit deiner Empfehlung pro Frage. User entscheidet.

FRAGE F1 — Umbenennung m06-advisor-portal → m13-advisor-portal jetzt?
  PRO: Konsistente Namensgebung (m13 ist konzeptionell M13).
  CONTRA: 30 min Aufwand, Touch eines stabilen Bereichs, alle Test-Pfade + app.ts-Imports umbiegen.
  Deine Empfehlung: <begründet>

FRAGE F2 — Bootstrap-Migration 031b in Production laufen lassen?
  Variante A: 031b läuft automatisch, liest INITIAL_SUPER_ADMIN_* aus ENV → User direkt in DB.
  Variante B: 031b weglassen, super_admin nur via `npm run bootstrap:super-admin` interaktiv.
  Deine Empfehlung: <begründet>

FRAGE F3 — Staging-Server zusätzlich zum Production-VPS?
  Variante A: 1 Server (Production = Dev — riskant ab erstem zahlenden Kunden).
  Variante B: 2 Server (Staging + Production, GitHub Actions deployt nach Staging, Promotion manuell).
  Deine Empfehlung: <begründet>

CHECKPOINT 4
Bericht in dem Format oben. STOP. Warte auf Antworten zu F1, F2, F3.
NACH den Antworten: ggf. eine kurze Phase 4.1 mit den Aktionen aus den Entscheidungen.

═══════════════════════════════════════════════════════════════════════
PHASE 5 — FINAL-CHECK + STATUS-HTML (20 min)
═══════════════════════════════════════════════════════════════════════

5.1 FINALER TEST + BUILD
  cd backend && npm test && npm run build
  cd ../webapp && npm test && npm run build
  Falls Playwright in CI integriert: cd webapp && npx playwright install --with-deps && npx playwright test
  Alle 3+ Stufen grün? Wenn nicht: STOP.

5.2 GIT-FINAL-STATUS
  git status --short  → idealerweise leer
  git log --oneline -10
  git diff main..HEAD --stat  → falls nicht auf main, zeige Änderungen

5.3 STATUS-HTML schreiben
  Datei: /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_POST_FIX_<datum>.html

  Sektionen:
    1. Header mit Datum + "POST-FIX STATUS" Pill (grün wenn alles ✓, gelb wenn ⏸-Punkte)
    2. Executive Summary — was wurde gemacht
    3. Befund-Abarbeitung (Tabelle B1-B4, W1-W6, E1-E8, F1-F3 mit Status)
    4. Test-Stand vorher/nachher
    5. Commits (mit SHAs + Subject)
    6. Backup-Files (Pfade)
    7. Was noch übrig (offene Fragen + externe Tasks: Meta-Verifizierung, Sentry-DSN, UptimeRobot)
    8. Empfohlene 3 nächste Tasks
  Style: dark-mode konsistent mit STATUS_AUDIT_2026-05-12.html (gleicher CSS-Block).

5.4 FINALER BERICHT IM CHAT
  - HTML-Pfad nennen
  - Top-3 Achievements
  - Top-3 verbleibende externe Tasks
  - Eine Eingangsfrage: "Soll ich Phase 4.1 (Aktionen aus F1/F2/F3) jetzt durchführen?"

═══════════════════════════════════════════════════════════════════════
WENN DU IN EINER PHASE FESTHÄNGST
═══════════════════════════════════════════════════════════════════════
- Stoppe sofort.
- Zeige exakten Fehler / Output / Stacktrace.
- 1–3 Hypothesen, was die Ursache sein könnte.
- 1 konkreter Vorschlag wie weiter.
- Frage den User. Keine Selbst-Reparatur.

ENDE — beginne mit Pflicht-Kontext lesen, dann Phase 0.

===== PROMPT ENDE =====
```

---

## Bedienungs-Hinweise (NICHT in den Prompt kopieren)

**Vor dem Senden:**
- Optionales Backup des Repos: `cp -r prozesspilot prozesspilot.bak-vor-audit-fix` (10 Sekunden)
- Postgres + Redis + MinIO müssen laufen für Tests: `docker compose up -d`
- Modell auf Opus 4.6 stellen

**Reihenfolge der Checkpoints, an denen DU prüfen musst:**

1. **Nach Phase 0:** Sind die Befunde wirklich noch valid? Falls Claude Code sagt „B2 ist schon weg" — das ist gut, einfach durchwinken.
2. **Nach Phase 1:** Die 3 Commits durchschauen — passt der Inhalt zu den Subject-Lines? `git log` + `git show <sha>` anschauen.
3. **Nach Phase 2:** Konzept-README + Roadmap optisch durchschauen — sind die Status-Marken jetzt richtig?
4. **Nach Phase 3:** Optional, viele Sachen sind Cosmetics.
5. **Nach Phase 4:** Drei Entscheidungen treffen (F1, F2, F3). Bei F1: lieber später, bei F2: empfehlung Variante B (sicherer), bei F3: bei Solo-Betrieb Variante A reicht für den Start.
6. **Nach Phase 5:** STATUS_POST_FIX_*.html im Browser öffnen.

**Was Claude Code NICHT machen wird** (steht nicht im Prompt, weil bewusst extern):
- Sentry-Account anlegen
- WhatsApp Meta-Verifizierung anstoßen
- UptimeRobot-Account
- IONOS-Server-Setup
- Domain-DNS
- M08-Phase-2-Implementierung (Mail/WhatsApp)

Diese Aktionen sind in Phase 4 / Phase 5 als „verbleibende externe Tasks" benannt.

**Realistische Gesamt-Zeit:** 2–3 Stunden Claude-Generierung + 30–60 min dein Review zwischen den Checkpoints.

**Falls Claude Code in Phase 0 feststellt, dass die meisten Befunde inzwischen schon erledigt sind**: das ist kein Problem — er überspringt sie und arbeitet nur die übrigen ab. Im Final-Report wird das transparent dokumentiert.

**Wenn an Phase 1 oder 2 etwas schiefgeht** (z. B. ein Test, der nichts mit unseren Änderungen zu tun hat, schlägt fehl): Claude Code stoppt, du gibst mir hier den Befund, ich helfe gezielt.
